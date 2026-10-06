#!/usr/bin/env python3
"""Fetch artpacks from 16colo.rs that the local ANSI archive doesn't have yet.

The local archive (text/16Colors/sixteencolors-archive-master) is a snapshot
of the sixteencolors-archive GitHub repo with every pack unzipped into its
year directory and only the text-mode art kept.  The pack zips themselves are
gone, so "which packs do we have" is tracked in a manifest (packs.json, next
to the archive).  On first run the manifest is seeded from the listing of the
original sixteencolors-archive-master.zip.

    fetch_16colors.py                 # dry run: list missing packs
    fetch_16colors.py --fetch         # download + extract them
    fetch_16colors.py --fetch --year 2025 --year 2026
    fetch_16colors.py --fetch --limit 10

Python 3 stdlib only.
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

API = "https://api.16colo.rs/v1"
USER_AGENT = "futureland-16colors-sync/1.0 (+https://futureland.today)"
BASE = "/sbbs/text/16Colors"
ARCHIVE = os.path.join(BASE, "sixteencolors-archive-master")
SEED_ZIP = os.path.join(BASE, "sixteencolors-archive-master.zip")
MANIFEST = os.path.join(BASE, "packs.json")
ANSIVIEW_INI = "/sbbs/xtrn/ansiview/settings.ini"

# Same set of types the existing archive was filtered down to.
KEEP_EXT = {".ans", ".asc", ".nfo", ".txt", ".diz", ".bin", ".adf", ".idf", ".ansi"}
MAX_FILE_BYTES = 32 * 1024 * 1024   # per extracted file; art files are tiny
MAX_ZIP_BYTES = 512 * 1024 * 1024
PAGE_SIZE = 50                      # API caps pagesize at 50
DELAY = 1.0                         # seconds between requests to 16colo.rs


def log(msg):
    print(msg, flush=True)


def http_get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read(MAX_ZIP_BYTES + 1)
        except urllib.error.HTTPError as e:
            if e.code < 500 and e.code != 429:
                raise
            last = e
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e
        time.sleep(5 * (attempt + 1))
    raise last


def api(path):
    return json.loads(http_get(API + path).decode("utf-8"))


def clean_name(archive):
    """The API reports names like 'ds!-dxma.zip' / 'yoda~16.zip' while the
    file on disk (and in the GitHub mirror) is 'ds-dxma.zip' / 'yoda16.zip'."""
    return re.sub(r"[^A-Za-z0-9._-]", "", archive)


def pack_key(year, archive):
    return "%s/%s" % (year, clean_name(archive).lower())


def load_manifest():
    if os.path.exists(MANIFEST):
        with open(MANIFEST, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        manifest["packs"] = {pack_key(*k.split("/", 1)): v for k, v in manifest["packs"].items()}
        return manifest
    if not os.path.exists(SEED_ZIP):
        sys.exit("No manifest (%s) and no seed zip (%s): can't tell which packs "
                 "are already here." % (MANIFEST, SEED_ZIP))
    log("Seeding manifest from %s ..." % SEED_ZIP)
    packs = {}
    with zipfile.ZipFile(SEED_ZIP) as z:
        for name in z.namelist():
            m = re.match(r"^[^/]+/(\d{4})/([^/]+\.zip)$", name, re.I)
            if m:
                packs[pack_key(m.group(1), m.group(2))] = {"source": "seed"}
    log("  %d packs in the original snapshot" % len(packs))
    manifest = {"version": 1, "packs": packs}
    save_manifest(manifest)
    return manifest


def save_manifest(manifest):
    tmp = MANIFEST + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
    os.replace(tmp, MANIFEST)


def remote_years():
    return sorted(y for y in api("/year?pagesize=200") if re.match(r"^\d{4}$", y))


def remote_packs(year):
    page = 1
    while True:
        d = api("/year/%s?pagesize=%d&page=%d" % (year, PAGE_SIZE, page))
        for r in d.get("results", []):
            yield r
        if page >= int(d["page"]["pages"]):
            return
        page += 1
        time.sleep(DELAY)


def entry_name_bytes(info):
    """Filename as the bytes the pack author wrote (the rest of the archive
    was made with unzip, which leaves CP437 names as raw bytes)."""
    if info.flag_bits & 0x800:
        return info.filename.encode("utf-8")
    try:
        return info.filename.encode("cp437")
    except UnicodeEncodeError:
        return info.filename.encode("utf-8")


def safe_relpath(raw):
    """Zip entry name -> list of safe path components, or None to skip."""
    parts = [p for p in raw.replace(b"\\", b"/").split(b"/") if p not in (b"", b".")]
    if not parts or any(p == b".." for p in parts):
        return None
    if parts[0] == b"__MACOSX" or parts[-1].startswith(b"._"):
        return None
    return [p.replace(b"\x00", b"") for p in parts]


def sha1_file(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.digest()


def place(dest_dir, parts, data, pack, mtime):
    """Write one file without ever overwriting different existing content.
    Returns 'new', 'same' or 'renamed'."""
    target_dir = os.path.join(dest_dir, *parts[:-1]) if len(parts) > 1 else dest_dir
    os.makedirs(target_dir, exist_ok=True)
    target = os.path.join(target_dir, parts[-1])
    result = "new"
    if os.path.lexists(target):
        if os.path.isfile(target) and sha1_file(target) == hashlib.sha1(data).digest():
            return "same"
        stem, ext = os.path.splitext(parts[-1])
        target = os.path.join(target_dir, stem + b"-" + pack.encode("ascii", "replace") + ext)
        if os.path.lexists(target):
            return "same"
        result = "renamed"
    with open(target, "wb") as f:
        f.write(data)
    if mtime:
        os.utime(target, (mtime, mtime))
    return result


def extract_pack(zip_path, year, pack, layout):
    dest = os.path.join(ARCHIVE, year).encode()
    if layout == "pack":
        dest = os.path.join(dest, pack.encode("ascii", "replace"))
    counts = {"new": 0, "same": 0, "renamed": 0, "skipped": 0}
    with zipfile.ZipFile(zip_path) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            parts = safe_relpath(entry_name_bytes(info))
            ext = os.path.splitext(parts[-1])[1].lower().decode("ascii", "replace") if parts else ""
            if not parts or ext not in KEEP_EXT or info.file_size > MAX_FILE_BYTES:
                counts["skipped"] += 1
                continue
            try:
                data = z.read(info)
            except (zipfile.BadZipFile, NotImplementedError, RuntimeError, OSError) as e:
                log("    ! %s: %s" % (info.filename, e))
                counts["skipped"] += 1
                continue
            try:
                mtime = time.mktime(info.date_time + (0, 0, -1))
            except (ValueError, OverflowError):
                mtime = None
            counts[place(dest, parts, data, pack, mtime)] += 1
    return counts


def ensure_ansiview_section(year):
    """ansiview lists one gallery per year directory; add one for a new year."""
    path = os.path.join(ARCHIVE, year)
    try:
        with open(ANSIVIEW_INI, "r", encoding="cp437") as f:
            text = f.read()
    except OSError:
        return
    if path in text:
        return
    section = ("[Art Gallery %s]\ndescription = %s\nmodule = local.js\n"
               "path = %s\nhide = *.exe,*.com\n\n" % (year, year, path))
    # Galleries are listed newest first: go in front of the first older year.
    pos = None
    for m in re.finditer(r"^\[Art Gallery (\d{4})\]", text, re.M):
        if int(m.group(1)) < int(year):
            pos = m.start()
            break
    text = text[:pos] + section + text[pos:] if pos is not None else text.rstrip("\n") + "\n\n" + section
    with open(ANSIVIEW_INI, "w", encoding="cp437") as f:
        f.write(text)
    log("  added [Art Gallery %s] to %s" % (year, ANSIVIEW_INI))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--fetch", action="store_true", help="download and extract (default is a dry run)")
    ap.add_argument("--year", action="append", help="only this year (repeatable); default all years")
    ap.add_argument("--limit", type=int, default=0, help="stop after this many packs")
    ap.add_argument("--layout", choices=("flat", "pack"), default="flat",
                    help="flat: files straight into the year dir like the existing archive; "
                         "pack: one subdirectory per pack")
    ap.add_argument("--no-ansiview", action="store_true", help="don't add new year galleries to ansiview settings.ini")
    args = ap.parse_args()

    manifest = load_manifest()
    have = manifest["packs"]
    years = args.year or remote_years()

    missing = []
    for year in years:
        n = 0
        for r in remote_packs(year):
            archive = r.get("archive")
            if not archive or not archive.lower().endswith(".zip"):
                continue        # listed on the site but no downloadable zip
            if pack_key(year, archive) not in have:
                missing.append((year, r["name"], archive, r.get("download")))
                n += 1
        if n:
            log("%s: %d missing" % (year, n))
        time.sleep(DELAY)

    log("%d pack(s) missing locally" % len(missing))
    if not args.fetch:
        for year, name, archive, _ in missing:
            log("  %s/%s" % (year, archive))
        if missing:
            log("(dry run -- rerun with --fetch to download)")
        return 0

    done = failed = 0
    new_years = set()
    for year, name, archive, url in missing:
        if args.limit and done >= args.limit:
            break
        url = url or "https://16colo.rs/archive/%s/%s" % (year, urllib.parse.quote(archive))
        log("%s/%s" % (year, archive))
        tmp = None
        try:
            try:
                data = http_get(url, timeout=300)
            except urllib.error.HTTPError as e:
                if e.code != 404 or clean_name(archive) == archive:
                    raise
                data = http_get("https://16colo.rs/archive/%s/%s" % (year, clean_name(archive)), timeout=300)
            if len(data) > MAX_ZIP_BYTES:
                raise ValueError("zip larger than %d bytes" % MAX_ZIP_BYTES)
            with tempfile.NamedTemporaryFile(prefix="16c-", suffix=".zip", delete=False) as t:
                t.write(data)
                tmp = t.name
            if not os.path.isdir(os.path.join(ARCHIVE, year)):
                new_years.add(year)
            counts = extract_pack(tmp, year, re.sub(r"[^A-Za-z0-9._-]", "_", name), args.layout)
            log("    %(new)d new, %(renamed)d renamed (name clash), %(same)d already present, %(skipped)d skipped" % counts)
            have[pack_key(year, archive)] = {
                "source": "16colo.rs",
                "fetched": datetime.date.today().isoformat(),
                "files": counts["new"] + counts["renamed"],
                "layout": args.layout,
            }
            save_manifest(manifest)
            done += 1
        except (zipfile.BadZipFile, urllib.error.URLError, ValueError, OSError) as e:
            log("    ! failed: %s" % e)
            failed += 1
        finally:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)
        time.sleep(DELAY)

    if not args.no_ansiview:
        for year in sorted(new_years):
            if os.path.isdir(os.path.join(ARCHIVE, year)):
                ensure_ansiview_section(year)

    log("fetched %d, failed %d, %d still missing" % (done, failed, len(missing) - done))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
