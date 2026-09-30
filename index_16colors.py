#!/usr/bin/env python3
"""Build the 16colo.rs file index: which pack each archived file came from.

The local archive (/sbbs/text/16Colors/sixteencolors-archive-master/<year>/)
is flat per year, so the pack a file belongs to is lost. 16colo.rs's API
lists every file per pack; this walks it once and writes one JSON per year:

  /sbbs/text/16Colors/index/<year>.json   { "FILE.ANS": "packname", ... }

The website's gallery reads that to offer "View on 16c" links straight to
https://16colo.rs/pack/<pack>/<FILE>. Re-run any time; already indexed
packs are skipped unless --refresh. Polite: one request a second, the same
User-Agent as fetch_16colors.py.

  python3 index_16colors.py              # every year
  python3 index_16colors.py 1997 1998    # just these
  python3 index_16colors.py --limit 20   # stop after 20 packs (a test)
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API = "https://api.16colo.rs/v1"
USER_AGENT = "futureland-16colors-sync/1.0 (+https://futureland.today)"
BASE = "/sbbs/text/16Colors"
ARCHIVE = os.path.join(BASE, "sixteencolors-archive-master")
INDEX_DIR = os.path.join(BASE, "index")
PAGE_SIZE = 50
DELAY = 1.0


def log(msg):
    print(msg, flush=True)


def http_get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def api(path):
    for attempt in range(3):
        try:
            return json.loads(http_get(API + path).decode("utf-8"))
        except (urllib.error.URLError, ValueError) as e:
            if attempt == 2:
                raise
            log("    retry after %s" % e)
            time.sleep(5)


def list_packs(year):
    packs = []
    page = 1
    while True:
        d = api("/year/%s?pagesize=%d&page=%d" % (year, PAGE_SIZE, page))
        for r in d.get("results", []):
            name = str(r.get("name", ""))
            if name:
                packs.append(name)
        pages = d.get("page", {}).get("pages", 1)
        if page >= pages:
            break
        page += 1
        time.sleep(DELAY)
    return packs


def pack_files(pack):
    d = api("/pack/%s" % urllib.request.quote(pack, safe=""))
    out = []
    for r in d.get("results", []):
        files = r.get("files") or {}
        out.extend(files.keys())
    return out


def load_index(year):
    path = os.path.join(INDEX_DIR, "%s.json" % year)
    if os.path.exists(path):
        with open(path) as f:
            try:
                return json.load(f)
            except ValueError:
                return {}
    return {}


def save_index(year, data):
    os.makedirs(INDEX_DIR, exist_ok=True)
    path = os.path.join(INDEX_DIR, "%s.json" % year)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, separators=(",", ":"), sort_keys=True)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("years", nargs="*", help="years to index (default: every year folder in the archive)")
    ap.add_argument("--limit", type=int, default=0, help="stop after this many packs (test runs)")
    ap.add_argument("--refresh", action="store_true", help="re-fetch packs already in the index")
    args = ap.parse_args()

    years = args.years or sorted(y for y in os.listdir(ARCHIVE) if re.match(r"^\d{4}$", y))
    done = 0
    for year in years:
        index = load_index(year)
        # `_packs` remembers which packs were walked so a re-run resumes.
        walked = set(index.get("_packs", []))
        try:
            packs = list_packs(year)
        except Exception as e:  # noqa: BLE001 - keep going with the next year
            log("%s: could not list packs: %s" % (year, e))
            continue
        log("%s: %d packs, %d already indexed" % (year, len(packs), len(walked)))
        for pack in packs:
            if args.limit and done >= args.limit:
                save_index(year, index)
                log("limit reached")
                return 0
            if pack in walked and not args.refresh:
                continue
            try:
                files = pack_files(pack)
            except Exception as e:  # noqa: BLE001
                log("  %s: failed: %s" % (pack, e))
                time.sleep(DELAY)
                continue
            for name in files:
                # First pack wins: a file that appears in several packs keeps its earliest.
                index.setdefault(name, pack)
                index.setdefault(name.upper(), pack)
            walked.add(pack)
            index["_packs"] = sorted(walked)
            done += 1
            if done % 25 == 0:
                save_index(year, index)
                log("  %d packs walked" % done)
            time.sleep(DELAY)
        save_index(year, index)
    log("indexed %d packs" % done)
    return 0


if __name__ == "__main__":
    sys.exit(main())
