#!/usr/bin/env python3
"""
gen_flags.py — Generate country-themed newsreader icons by recoloring newsitems.bin.

Takes the newsitems.bin template (newspaper icon, 12x6) and creates per-country
variants with flag-inspired 3-color palettes.

Zones in newsitems.bin:
  EDGE: fg=7/bg=0 non-space chars (newspaper outline)     → edge_fg
  BODY: fg=0/bg=7 cells (newspaper interior surface)       → body_bg
  TEXT: fg=1/bg=7 cells (" NEWS" header text)              → text_fg  
  STAR: fg=14/bg=7 cells (* decorations)                   → star_fg
  TRANS: space chars with bg=0 (become transparent)         → unchanged

Each country palette = (edge_fg, body_bg, text_fg, star_fg)
  edge_fg: 0-15  (newspaper outline color)
  body_bg: 0-7   (paper background color)
  text_fg: 0-15  (header text color)
  star_fg: 0-15  (star accent color)

Also patches the " NEWS" text (R1 C3-C7) with a 5-char country label.
"""
import struct, os, sys, re

W, H = 12, 6
OUTDIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(os.path.dirname(OUTDIR), 'newsitems.bin')

# ── CGA Color Constants ──────────────────────────────────────────────
BLK=0; BLU=1; GRN=2; CYN=3; RED=4; MAG=5; BRN=6; LGY=7
DGY=8; LBL=9; LGN=10; LCN=11; LRD=12; LMG=13; YEL=14; WHT=15

# ── Flag Palettes: (edge_fg, body_bg, text_fg, star_fg, label_5char) ──
# Colors chosen to best represent each flag within CGA 16-color constraints.
# edge_fg = newspaper outline, body_bg = paper surface, text_fg = header text
# star_fg = star accents, label = 5-char text replacing " NEWS"

FLAGS = {
    # ─── AFRICA ───────────────────────────────────────────────────────
    'algeria':           (GRN, GRN, WHT, LRD, ' ALG '),
    'botswana':          (LBL, BLU, WHT, LCN, ' BWA '),
    'burkina_faso':      (RED, RED, LGN, YEL, ' BFA '),
    'central_african_republic': (BLU, GRN, YEL, WHT, ' CAF '),
    'chad':              (BLU, BLU, YEL, LRD, 'CHAD '),
    'cote_d_ivoire':     (GRN, GRN, WHT, BRN, 'IVORY'),
    'democratic_republic_of_the_congo': (BLU, BLU, YEL, LRD, 'DRCNG'),
    'djibouti':          (LBL, GRN, WHT, LRD, ' DJI '),
    'egypt':             (RED, RED, WHT, YEL, 'EGYPT'),
    'eritrea':           (BLU, BLU, LGN, YEL, ' ERI '),
    'eswatini':          (BLU, BLU, YEL, LRD, 'ESWAT'),
    'ethiopia':          (GRN, GRN, YEL, LRD, ' ETH '),
    'gabon':             (GRN, GRN, YEL, LBL, 'GABON'),
    'ghana':             (RED, RED, YEL, LGN, 'GHANA'),
    'kenya':             (RED, RED, LGN, WHT, 'KENYA'),
    'lesotho':           (BLU, GRN, WHT, LBL, ' LSO '),
    'libya':             (RED, RED, WHT, LGN, 'LIBYA'),
    'malawi':            (RED, RED, LGN, WHT, 'MALAW'),
    'mauritius':         (RED, BLU, YEL, LGN, 'MAURT'),
    'morocco':           (RED, RED, LGN, YEL, 'MOROC'),
    'namibia':           (BLU, BLU, LGN, YEL, 'NAMIB'),
    'nigeria':           (GRN, GRN, WHT, LGN, 'NIGER'),
    'rwanda':            (BLU, BLU, YEL, LGN, 'RWNDA'),
    'sierra_leone':      (GRN, GRN, WHT, LBL, 'SRLNE'),
    'somalia':           (LBL, BLU, WHT, LCN, 'SOMAL'),
    'south_africa':      (GRN, GRN, YEL, LRD, ' RSA '),
    'south_sudan':       (RED, GRN, WHT, BLU, 'SSUDN'),
    'tanzania':          (GRN, GRN, YEL, LBL, 'TANZA'),
    'togo':              (GRN, GRN, YEL, LRD, ' TGO '),
    'uganda':            (RED, RED, YEL, WHT, 'UGAND'),
    'zambia':            (GRN, GRN, WHT, BRN, 'ZAMBI'),
    'zimbabwe':          (GRN, GRN, YEL, LRD, 'ZIMBW'),

    # ─── ASIA ─────────────────────────────────────────────────────────
    'afghanistan':       (RED, RED, WHT, LGN, 'AFGHN'),
    'bangladesh':        (GRN, GRN, LRD, WHT, 'BANGL'),
    'cambodia':          (BLU, RED, WHT, LBL, 'CAMBD'),
    'china':             (RED, RED, YEL, YEL, 'CHINA'),
    'hong_kong':         (RED, RED, WHT, LRD, 'HKONG'),
    'india':             (BRN, GRN, WHT, BLU, 'INDIA'),
    'indonesia':         (RED, RED, WHT, LRD, 'INDNS'),
    'japan':             (WHT, LGY, LRD, RED, 'JAPAN'),
    'malaysia':          (BLU, RED, YEL, WHT, 'MALAY'),
    'mongolia':          (RED, RED, YEL, LBL, 'MONGL'),
    'myanmar':           (GRN, GRN, YEL, LRD, 'MYANM'),
    'nepal':             (RED, RED, WHT, BLU, 'NEPAL'),
    'north_korea':       (RED, RED, WHT, BLU, 'NKREA'),
    'pakistan':           (GRN, GRN, WHT, LGN, 'PAKST'),
    'philippines':       (BLU, RED, YEL, WHT, 'PHLPN'),
    'singapore':         (RED, RED, WHT, LRD, 'SNGPR'),
    'south_korea':       (WHT, LGY, LRD, BLU, 'KOREA'),
    'sri_lanka':         (BRN, BRN, YEL, LRD, 'SRLNK'),
    'taiwan':            (BLU, RED, WHT, LBL, 'TAIWN'),
    'thailand':          (BLU, RED, WHT, LBL, 'THAIL'),
    'vietnam':           (RED, RED, YEL, YEL, 'VTNM '),

    # ─── EUROPE ───────────────────────────────────────────────────────
    'albania':           (RED, RED, WHT, DGY, 'ALBAN'),
    'armenia':           (RED, RED, YEL, BLU, 'ARMEN'),
    'austria':           (RED, RED, WHT, LRD, 'AUSTR'),
    'azerbaijan':        (BLU, BLU, LGN, LRD, 'AZERB'),
    'belarus':           (RED, RED, LGN, WHT, 'BELRS'),
    'belgium':           (BRN, RED, YEL, DGY, 'BELGM'),
    'bosnia_and_herzegovina': (BLU, BLU, YEL, WHT, 'BOSNA'),
    'bulgaria':          (GRN, GRN, WHT, LRD, 'BULGA'),
    'croatia':           (RED, RED, WHT, BLU, 'CROAT'),
    'czech_republic':    (BLU, RED, WHT, LBL, 'CZECH'),
    'denmark':           (RED, RED, WHT, LRD, 'DNMRK'),
    'estonia':           (BLU, BLU, WHT, DGY, 'ESTON'),
    'finland':           (WHT, LGY, LBL, BLU, 'FINLD'),
    'france':            (BLU, RED, WHT, LBL, 'FRANC'),
    'georgia':           (RED, RED, WHT, LRD, 'GEORG'),
    'germany':           (RED, BRN, YEL, DGY, 'GERMN'),
    'greece':            (LBL, BLU, WHT, LCN, 'GREEC'),
    'hungary':           (RED, RED, WHT, GRN, 'HUNGR'),
    'iceland':           (BLU, BLU, WHT, LRD, 'ICLND'),
    'ireland':           (GRN, GRN, WHT, BRN, 'IRLND'),
    'italy':             (GRN, RED, WHT, LGN, 'ITALY'),
    'kosovo':            (BLU, BLU, YEL, WHT, 'KOSOV'),
    'latvia':            (RED, RED, WHT, BRN, 'LATVA'),
    'lithuania':         (GRN, GRN, YEL, LRD, 'LITHU'),
    'luxembourg':        (LBL, RED, WHT, LCN, 'LUXMB'),
    'moldova':           (BLU, BLU, YEL, LRD, 'MLDVA'),
    'montenegro':        (RED, RED, YEL, DGY, 'MNTGR'),
    'netherlands':       (RED, RED, WHT, BLU, 'NTHRL'),
    'north_macedonia':   (RED, RED, YEL, LRD, 'NMACE'),
    'norway':            (RED, RED, WHT, BLU, 'NORWY'),
    'poland':            (RED, RED, WHT, LRD, 'POLND'),
    'portugal':          (GRN, RED, YEL, LGN, 'PORTG'),
    'romania':           (BLU, RED, YEL, LBL, 'ROMAN'),
    'russia':            (RED, BLU, WHT, LRD, 'RUSSA'),
    'serbia':            (RED, RED, WHT, BLU, 'SERBA'),
    'slovakia':          (BLU, RED, WHT, LBL, 'SLOVK'),
    'slovenia':          (BLU, RED, WHT, LBL, 'SLOVN'),
    'spain':             (RED, RED, YEL, BRN, 'SPAIN'),
    'sweden':            (BLU, BLU, YEL, LBL, 'SWEDN'),
    'switzerland':       (RED, RED, WHT, LRD, 'SWISS'),
    'turkey':            (RED, RED, WHT, LRD, 'TURKY'),
    'ukraine':           (BLU, BLU, YEL, LBL, 'UKRAN'),
    'united_kingdom':    (BLU, RED, WHT, LBL, '  UK '),

    # ─── MIDDLE EAST ─────────────────────────────────────────────────
    'bahrain':           (RED, RED, WHT, LRD, 'BAHRN'),
    'iran':              (GRN, GRN, WHT, LRD, ' IRAN'),
    'iraq':              (RED, RED, WHT, LGN, ' IRAQ'),
    'israel':            (WHT, LGY, BLU, LBL, 'ISRAL'),
    'jordan':            (RED, GRN, WHT, DGY, 'JORDN'),
    'kuwait':            (GRN, GRN, WHT, LRD, 'KUWAT'),
    'lebanon':           (RED, RED, LGN, WHT, 'LEBAN'),
    'oman':              (RED, RED, WHT, GRN, ' OMAN'),
    'palestine':         (GRN, RED, WHT, DGY, 'PALST'),
    'qatar':             (BRN, BRN, WHT, LRD, 'QATAR'),
    'saudi_arabia':      (GRN, GRN, WHT, LGN, 'SAUDI'),
    'syria':             (RED, RED, WHT, LGN, 'SYRIA'),
    'united_arab_emirates': (GRN, RED, WHT, DGY, ' UAE '),
    'yemen':             (RED, RED, WHT, DGY, 'YEMEN'),

    # ─── NORTH AMERICA ───────────────────────────────────────────────
    'canada':            (RED, RED, WHT, LRD, 'CANAD'),
    'costa_rica':        (BLU, RED, WHT, LBL, 'CRICA'),
    'cuba':              (BLU, RED, WHT, LBL, ' CUBA'),
    'dominican_republic':(BLU, RED, WHT, LBL, 'DOMRP'),
    'el_salvador':       (BLU, BLU, WHT, LBL, 'ELSAV'),
    'guatemala':         (LBL, BLU, WHT, LCN, 'GUATM'),
    'haiti':             (BLU, RED, WHT, LBL, 'HAITI'),
    'honduras':          (BLU, BLU, WHT, LBL, 'HNDRS'),
    'jamaica':           (GRN, GRN, YEL, DGY, 'JAMCA'),
    'mexico':            (GRN, GRN, WHT, LRD, 'MEXCO'),
    'nicaragua':         (BLU, BLU, WHT, LBL, 'NICRG'),
    'panama':            (BLU, RED, WHT, LBL, 'PANMA'),
    'trinidad_and_tobago':(RED, RED, WHT, DGY, 'TRINT'),
    'united_states':     (BLU, RED, WHT, LBL, ' USA '),

    # ─── SOUTH AMERICA ───────────────────────────────────────────────
    'argentina':         (LBL, BLU, WHT, YEL, 'ARGEN'),
    'bolivia':           (RED, GRN, YEL, LRD, 'BOLIV'),
    'brazil':            (GRN, GRN, YEL, BLU, 'BRAZL'),
    'chile':             (RED, RED, WHT, BLU, 'CHILE'),
    'colombia':          (BLU, BLU, YEL, LRD, 'COLMB'),
    'ecuador':           (BLU, BLU, YEL, LRD, 'ECADR'),
    'guyana':            (GRN, GRN, YEL, LRD, 'GUYNA'),
    'paraguay':          (RED, RED, WHT, BLU, 'PARGY'),
    'peru':              (RED, RED, WHT, LRD, ' PERU'),
    'suriname':          (GRN, GRN, YEL, LRD, 'SURNM'),
    'uruguay':           (WHT, LGY, LBL, YEL, 'URGUY'),
    'venezuela':         (BLU, RED, YEL, LBL, 'VNZLA'),

    # ─── OCEANIA ──────────────────────────────────────────────────────
    'australia':         (BLU, BLU, WHT, LRD, 'AUSTL'),
    'fiji':              (LBL, BLU, WHT, LRD, ' FIJI'),
    'new_zealand':       (BLU, BLU, WHT, LRD, '  NZ '),
    'papua_new_guinea':  (RED, RED, YEL, DGY, ' PNG '),

    # ─── GLOBAL ───────────────────────────────────────────────────────
    'global':            (LBL, BLU, LGN, YEL, 'GLOBE'),

    # ─── MISSING / ADDITIONAL ─────────────────────────────────────────
    'barbados':          (BLU, BLU, YEL, DGY, 'BARBD'),
    'belize':            (BLU, BLU, WHT, LRD, 'BELIZ'),
    'bhutan':            (BRN, BRN, YEL, WHT, 'BHUTN'),
    'cyprus':            (WHT, LGY, BRN, GRN, 'CYPRS'),
    'england':           (WHT, LGY, LRD, RED, 'ENGLND'),
    'europe':            (BLU, BLU, YEL, LBL, 'EURPE'),
    'grenada':           (RED, RED, YEL, GRN, 'GREND'),
    'kazakhstan':        (LBL, BLU, YEL, LCN, 'KAZAK'),
    'laos':              (RED, BLU, WHT, LRD, ' LAOS'),
    'malta':             (RED, RED, WHT, LGY, 'MALTA'),
    'st_kitts_and_nevis':(GRN, RED, YEL, DGY, 'STKTS'),
    'the_bahamas':       (LCN, CYN, YEL, DGY, 'BAHAM'),
    'turks_and_caicos_islands': (BLU, BLU, WHT, LRD, 'TURKS'),
    'united_states_virgin_islands': (BLU, BLU, WHT, YEL, 'USVI '),
    'uzbekistan':        (BLU, BLU, LGN, WHT, 'UZBEK'),
    'vatican_city':      (YEL, LGY, WHT, BRN, 'VATCN'),
}


def make_sauce(title='', author='icongen', width=W, height=H):
    sauce = bytearray(128)
    sauce[0:5] = b'SAUCE'
    sauce[5:7] = b'00'
    t = title.encode('ascii', 'replace')[:35].ljust(35)
    sauce[7:42] = t
    a = author.encode('ascii', 'replace')[:20].ljust(20)
    sauce[42:62] = a
    # FileSize field (bytes 90-93, LE) — raw data size without SAUCE/EOF
    file_size = width * height * 2
    struct.pack_into('<I', sauce, 90, file_size)
    sauce[94] = 5
    sauce[95] = width // 2 if width > 0 else 6
    struct.pack_into('<H', sauce, 96, width)
    struct.pack_into('<H', sauce, 98, height)
    return bytes(sauce)


def recolor_template(template_raw, edge_fg, body_bg, text_fg, star_fg, label_5):
    """Recolor newsitems.bin template with flag palette and custom label."""
    out = bytearray(template_raw)

    for row in range(H):
        for col in range(W):
            off = (row * W + col) * 2
            ch = out[off]
            at = out[off + 1]
            fg = at & 0x0F
            bg = (at >> 4) & 0x07

            # TRANSPARENT cells: space with bg=0 → leave unchanged
            if ch == 0x20 and bg == 0:
                continue

            # EDGE cells: non-space with bg=0 → recolor fg
            if bg == 0 and ch != 0x20:
                new_at = (0 << 4) | (edge_fg & 0x0F)
                out[off + 1] = new_at
                continue

            # STAR cells: fg=14 (Yellow) on bg=7
            if fg == 14 and bg == 7:
                new_at = (body_bg << 4) | (star_fg & 0x0F)
                out[off + 1] = new_at
                continue

            # TEXT cells: fg=1 (Blue) on bg=7 (the " NEWS" text)
            if fg == 1 and bg == 7:
                new_at = (body_bg << 4) | (text_fg & 0x0F)
                out[off + 1] = new_at
                continue

            # BODY cells: fg=0 on bg=7 (interior detail)
            if bg == 7:
                # Keep fg relative darkness: if fg was 0 (black), use contrast
                if fg == 0:
                    # Detail on body: use edge color for contrast
                    detail_fg = edge_fg if edge_fg != body_bg else BLK
                    new_at = (body_bg << 4) | (detail_fg & 0x0F)
                elif fg == 7:
                    # Body fill (█ with fg=7/bg=7 effectively): use body_bg
                    new_at = (body_bg << 4) | (body_bg & 0x0F)
                else:
                    new_at = (body_bg << 4) | (fg & 0x0F)
                out[off + 1] = new_at
                continue

    # Patch label: R1 C3-C7 (the " NEWS" 5 chars)
    if label_5 and len(label_5) >= 5:
        for i in range(5):
            off = (1 * W + 3 + i) * 2
            out[off] = ord(label_5[i]) & 0xFF

    return bytes(out)


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Generate country flag newsreader icons')
    parser.add_argument('--list', action='store_true', help='List countries without generating')
    parser.add_argument('--country', type=str, help='Generate only one country')
    parser.add_argument('--preview', type=str, help='Preview one country')
    args = parser.parse_args()

    if not os.path.exists(TEMPLATE):
        print(f'ERROR: Template not found: {TEMPLATE}')
        sys.exit(1)

    tpl_data = open(TEMPLATE, 'rb').read()
    tpl_raw = tpl_data[:W * H * 2]

    # Load config to find country node slugs
    ini_path = os.path.join(os.path.dirname(os.path.dirname(OUTDIR)), 'config', 'newsreader.ini')
    if os.path.exists(ini_path):
        ini_data = open(ini_path).read()
    else:
        ini_data = ''

    # Find all country nodes by splitting into sections
    country_nodes = {}
    sections = re.split(r'\n(?=\[)', ini_data)
    for section in sections:
        if 'type = country' not in section:
            continue
        slug_m = re.match(r'\[CategoryNode\.([^\]]+)\]', section)
        if not slug_m:
            continue
        node_slug = slug_m.group(1)
        # Extract country key: last segment after continent prefix
        # e.g. global_news_africa_algeria -> algeria
        # e.g. global_news_north_america_united_states -> united_states
        # Find which FLAGS key matches the end of the node slug
        label_m = re.search(r'^label\s*=\s*(.+)', section, re.MULTILINE)
        label = label_m.group(1).strip() if label_m else node_slug
        # Try to extract country key by removing continent prefix
        # Node slugs: global_news_{continent}_{country}
        parts = node_slug.split('_')
        # Find the continent boundary: skip "global_news_" prefix, then the continent
        # Continents: global, africa, asia, europe, middle_east, north_america, south_america, oceania
        continent_prefixes = [
            'global_news_global_', 'global_news_africa_', 'global_news_asia_',
            'global_news_europe_', 'global_news_middle_east_',
            'global_news_north_america_', 'global_news_south_america_',
            'global_news_oceania_'
        ]
        country_key = None
        for prefix in continent_prefixes:
            if node_slug.startswith(prefix):
                country_key = node_slug[len(prefix):]
                break
        if country_key:
            country_nodes[country_key] = (label, node_slug)

    if args.list:
        found = not_found = 0
        for key, (label, slug) in sorted(country_nodes.items()):
            has_flag = '✓' if key in FLAGS else '✗'
            if key in FLAGS:
                found += 1
            else:
                not_found += 1
            print(f'  {has_flag} {key:45s} {label}')
        total = found + not_found
        pct = 100 * found // total if total > 0 else 0
        print(f'\nCoverage: {found}/{total} ({pct}%)')
        return

    if args.preview:
        key = args.preview
        if key not in FLAGS:
            print(f'No palette for: {key}')
            return
        edge_fg, body_bg, text_fg, star_fg, label_5 = FLAGS[key]
        recolored = recolor_template(tpl_raw, edge_fg, body_bg, text_fg, star_fg, label_5)
        cp437 = {0xDB:'█',0xDC:'▄',0xDF:'▀',0xB0:'░',0xB1:'▒',0xB2:'▓',0x20:' ',
                 0xDA:'┌',0xBF:'┐',0xC0:'└',0xD9:'┘',0xC4:'─',0xB3:'│'}
        print(f'  flag_{key}.bin ({FLAGS[key][:4]}):')
        for row in range(H):
            line = '  |'
            for col in range(W):
                off = (row * W + col) * 2
                ch = recolored[off]
                line += cp437.get(ch, chr(ch) if 32 <= ch < 127 else '?')
            line += '|'
            print(line)
        print()
        return

    count = 0
    updated_nodes = []
    for country_key in sorted(FLAGS.keys()):
        if args.country and args.country != country_key:
            continue
        edge_fg, body_bg, text_fg, star_fg, label_5 = FLAGS[country_key]
        recolored = recolor_template(tpl_raw, edge_fg, body_bg, text_fg, star_fg, label_5)
        filename = f'flag_{country_key}.bin'
        title = country_key.replace('_', ' ').title()
        path = os.path.join(OUTDIR, filename)
        with open(path, 'wb') as f:
            f.write(recolored)
            f.write(b'\x1a')
            f.write(make_sauce(title=title))
        count += 1

        # Track which config nodes need updating
        if country_key in country_nodes:
            _, node_slug = country_nodes[country_key]
            updated_nodes.append((node_slug, f'flag_{country_key}'))

    print(f'Generated {count} country flag icons')

    if not args.country and updated_nodes:
        print(f'\nConfig nodes to update: {len(updated_nodes)}')


if __name__ == '__main__':
    main()
