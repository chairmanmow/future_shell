#!/usr/bin/env python3
import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict, Counter
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
REPORT_PATH = REPO_ROOT / 'mods/future_shell/data/report.json'
INI_PATH = REPO_ROOT / 'mods/future_shell/config/newsreader.ini'

BEGIN_MARKER = '; === BEGIN GENERATED GLOBAL NEWS ==='
END_MARKER = '; === END GENERATED GLOBAL NEWS ==='

DEFAULT_THRESHOLD = 0.3
DEFAULT_LIMIT = 100

CONTINENT_ORDER = {
    'Global': 5,
    'Africa': 10,
    'Asia': 20,
    'Europe': 30,
    'Middle East': 40,
    'North America': 50,
    'South America': 60,
    'Oceania': 70,
    'Other': 90
}

CONTINENT_ICONS = {
    'Global': 'world_news',
    'Africa': 'world_news',
    'Asia': 'world_news',
    'Europe': 'world_news',
    'Middle East': 'world_news',
    'North America': 'world_news',
    'South America': 'world_news',
    'Oceania': 'world_news',
    'Other': 'world_news'
}

SUBCATEGORY_ORDER = {
    'Local News': 10,
    'Politics & Society': 20,
    'Business & Economy': 30,
    'Science & Technology': 40,
    'Sports': 50,
    'Lifestyle & Culture': 60,
    'World / International': 70,
    'Opinion': 80,
    'Other': 90
}

SUBCATEGORY_ICONS = {
    'Local News': 'world_news',
    'Politics & Society': 'world_news',
    'Business & Economy': 'business_finance',
    'Science & Technology': 'science_education',
    'Sports': 'sports',
    'Lifestyle & Culture': 'travel_lifestyle',
    'World / International': 'world_news',
    'Opinion': 'special_interests',
    'Other': 'offbeat'
}

CONTINENT_MEMBERS = {
    'Africa': {
        'Algeria', 'Botswana', 'Burkina Faso', 'Central African Republic', 'Chad',
        "Côte d'Ivoire", 'Democratic Republic of the Congo', 'Djibouti', 'Egypt',
        'Eritrea', 'Eswatini', 'Ethiopia', 'Gabon', 'Ghana', 'Kenya', 'Lesotho',
        'Libya', 'Malawi', 'Mauritius', 'Morocco', 'Namibia', 'Nigeria', 'Rwanda',
        'Sierra Leone', 'Somalia', 'South Africa', 'South Sudan', 'Tanzania',
        'Togo', 'Uganda', 'Zambia', 'Zimbabwe'
    },
    'Asia': {
        'Afghanistan', 'Armenia', 'Azerbaijan', 'Bangladesh', 'Bhutan', 'China',
        'Hong Kong', 'India', 'Indonesia', 'Japan', 'Kazakhstan', 'Laos', 'Malaysia',
        'Myanmar', 'Nepal', 'North Korea', 'Pakistan', 'Philippines', 'Singapore',
        'South Korea', 'Sri Lanka', 'Taiwan', 'Thailand', 'Uzbekistan', 'Vietnam'
    },
    'Europe': {
        'Albania', 'Austria', 'Belarus', 'Belgium', 'Bosnia and Herzegovina',
        'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic', 'Denmark', 'England',
        'Estonia', 'Finland', 'France', 'Georgia', 'Germany', 'Greece', 'Hungary',
        'Iceland', 'Ireland', 'Italy', 'Kosovo', 'Latvia', 'Lithuania', 'Luxembourg',
        'Malta', 'Moldova', 'Montenegro', 'Netherlands', 'North Macedonia', 'Norway',
        'Poland', 'Portugal', 'Romania', 'Russia', 'Serbia', 'Slovakia', 'Slovenia',
        'Spain', 'Sweden', 'Switzerland', 'Ukraine', 'United Kingdom', 'Wales',
        'Europe', 'Vatican City'
    },
    'Middle East': {
        'Iran', 'Israel', 'Lebanon', 'Oman', 'Palestine', 'Saudi Arabia',
        'Syria', 'Turkey', 'United Arab Emirates', 'Yemen'
    },
    'North America': {
        'Barbados', 'Belize', 'Canada', 'Costa Rica', 'Cuba', 'Grenada', 'Guatemala',
        'Haiti', 'Jamaica', 'Mexico', 'The Bahamas', 'Trinidad and Tobago',
        'Turks and Caicos Islands', 'St. Kitts and Nevis', 'United States',
        'United States Virgin Islands'
    },
    'South America': {
        'Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Guyana',
        'Peru', 'Suriname', 'Uruguay', 'Venezuela'
    },
    'Oceania': {
        'Australia', 'New Zealand'
    },
    'Global': {
        'Global'
    }
}


def slugify(value):
    if value is None:
        return ''
    text = unicodedata.normalize('NFKD', str(value))
    text = text.encode('ascii', 'ignore').decode('ascii')
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    text = re.sub(r'_+', '_', text)
    return text.strip('_')


def safe_slug(value, fallback='x'):
    slug = slugify(value)
    return slug if slug else fallback


def build_country_continent_map():
    mapping = {}
    for continent, countries in CONTINENT_MEMBERS.items():
        for country in countries:
            mapping[slugify(country)] = continent
    return mapping


COUNTRY_CONTINENT = build_country_continent_map()


def continent_for_country(country):
    slug = safe_slug(country)
    return COUNTRY_CONTINENT.get(slug, 'Other')


def normalize_country_label(continent, country):
    if not country:
        return continent or 'Global'
    if not continent:
        return country
    if country.lower() == continent.lower():
        return f'{country} (Regional)'
    return country


def normalize_subcategory(name):
    name = name or 'Other'
    return name if name in SUBCATEGORY_ORDER else 'Other'


def clean_text(value):
    return re.sub(r'\s+', ' ', str(value)).strip()


def format_float(value, digits=3):
    if value is None:
        return ''
    if not isinstance(value, (int, float)):
        return str(value)
    if digits == 0:
        return str(int(round(value)))
    text = f'{value:.{digits}f}'
    return text.rstrip('0').rstrip('.')


def load_report(path=REPORT_PATH):
    if not path.exists():
        raise FileNotFoundError(f'Report file not found: {path}')
    with path.open(encoding='utf-8') as handle:
        return json.load(handle)


def filter_entries(entries, threshold):
    selected = []
    skipped = 0
    for entry in entries:
        if not entry.get('alive'):
            skipped += 1
            continue
        img = float(entry.get('imgScore') or 0.0)
        fulltext = float(entry.get('fullTextScore') or 0.0)
        combined = img + fulltext
        if img == 0 and fulltext == 0:
            skipped += 1
            continue
        if combined < threshold:
            skipped += 1
            continue
        status = entry.get('status')
        if status not in (None, 200):
            skipped += 1
            continue
        record = dict(entry)
        record['combinedScore'] = combined
        record['imgScore'] = img
        record['fullTextScore'] = fulltext
        record['parentCategory'] = record.get('parentCategory') or 'Global'
        record['subCategory'] = normalize_subcategory(record.get('subCategory'))
        selected.append(record)
    return selected, skipped


def sort_group(entries):
    return sorted(
        entries,
        key=lambda e: (
            -e['combinedScore'],
            -e.get('imgScore', 0.0),
            -e.get('fullTextScore', 0.0),
            -(e.get('items') or 0),
            -parse_timestamp(e.get('lastUpdated')),
            str(e.get('title') or '').lower()
        )
    )


def parse_timestamp(value):
    if not value:
        return 0.0
    try:
        text = str(value).strip()
        if not text:
            return 0.0
        if text.endswith('Z'):
            text = text[:-1] + '+00:00'
        return datetime.fromisoformat(text).timestamp()
    except Exception:
        return 0.0


def build_hierarchy(entries, limit):
    hierarchy = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    stats = {}
    limit_active = limit if isinstance(limit, int) and limit > 0 else None
    for entry in entries:
        country = entry['parentCategory']
        continent = continent_for_country(country)
        sub = entry['subCategory']
        hierarchy[continent][country][sub].append(entry)
    feeds = []
    for continent, countries in hierarchy.items():
        for country, sub_map in countries.items():
            for sub, group in sub_map.items():
                ordered = sort_group(group)
                deduped = []
                seen_urls = set()
                for item in ordered:
                    url = (item.get('url') or '').strip()
                    if not url or url in seen_urls:
                        continue
                    seen_urls.add(url)
                    deduped.append(item)
                    if limit_active and len(deduped) >= limit_active:
                        break
                stats[(continent, country, sub)] = (len(deduped), len(group))
                for item in deduped:
                    feeds.append((continent, country, sub, item))
    return feeds, stats


def generate_category_nodes(feeds):
    continents = {}
    countries = {}
    subcategories = {}
    for continent, country, sub, _ in feeds:
        continent_slug = f'global_news_{safe_slug(continent)}'
        if continent_slug not in continents:
            continents[continent_slug] = {
                'slug': continent_slug,
                'label': continent,
                'parent': 'global_news',
                'icon': CONTINENT_ICONS.get(continent, 'world_news'),
                'order': CONTINENT_ORDER.get(continent, 80),
                'type': 'continent',
                'continent': continent
            }
        country_label = normalize_country_label(continent, country)
        country_slug = f'{continent_slug}_{safe_slug(country)}'
        if country_slug not in countries:
            countries[country_slug] = {
                'slug': country_slug,
                'label': country_label,
                'parent': continent_slug,
                'type': 'country',
                'continent': continent,
                'country': country
            }
        leaf_slug = f'{country_slug}_{safe_slug(sub)}'
        if leaf_slug not in subcategories:
            subcategories[leaf_slug] = {
                'slug': leaf_slug,
                'label': sub,
                'parent': country_slug,
                'type': 'subcategory',
                'continent': continent,
                'country': country,
                'icon': SUBCATEGORY_ICONS.get(sub, 'world_news'),
                'order': SUBCATEGORY_ORDER.get(sub, 500)
            }
    return continents, countries, subcategories


def render_category_node(node):
    lines = [f"[CategoryNode.{node['slug']}]"]
    lines.append(f"label = {node['label']}")
    if node.get('parent'):
        lines.append(f"parent = {node['parent']}")
    if node.get('icon'):
        lines.append(f"icon = {node['icon']}")
    if node.get('order') is not None:
        lines.append(f"order = {format_float(node['order'], digits=0)}")
    if node.get('type'):
        lines.append(f"type = {node['type']}")
    if node.get('continent'):
        lines.append(f"continent = {node['continent']}")
    if node.get('country'):
        lines.append(f"country = {node['country']}")
    lines.append('')
    return lines


def build_category_sections(continents, countries, subcategories):
    lines = [
        '[CategoryNode.global_news]',
        'label = Global News',
        'parent = root',
        'icon = world_news',
        'order = 1',
        'type = root',
        ''
    ]
    lines.extend(
        segment
        for node in sorted(
            continents.values(),
            key=lambda n: (
                CONTINENT_ORDER.get(n.get('continent'), 999),
                n.get('label', '').lower()
            )
        )
        for segment in render_category_node(node)
    )
    lines.extend(
        segment
        for node in sorted(
            countries.values(),
            key=lambda n: (
                CONTINENT_ORDER.get(n.get('continent'), 999),
                n.get('label', '').lower()
            )
        )
        for segment in render_category_node(node)
    )
    lines.extend(
        segment
        for node in sorted(
            subcategories.values(),
            key=lambda n: (
                CONTINENT_ORDER.get(n.get('continent'), 999),
                n.get('country', ''),
                SUBCATEGORY_ORDER.get(n.get('label'), 999),
                n.get('label', '').lower()
            )
        )
        for segment in render_category_node(node)
    )
    return lines


def render_feed_section(slug, feed):
    lines = [f'[Feed.{slug}]']
    lines.append(f"label = {clean_text(feed.get('title') or feed.get('label') or 'Feed')}")
    lines.append(f"url = {feed.get('url').strip()}")
    lines.append(f"category_node = {feed['category_node']}")
    lines.append(f"category = {feed['category']}")
    if feed.get('continent'):
        lines.append(f"continent = {feed['continent']}")
    if feed.get('country'):
        lines.append(f"country = {feed['country']}")
    if feed.get('subcategory'):
        lines.append(f"subcategory = {feed['subcategory']}")
    if feed.get('category_icon'):
        lines.append(f"category_icon = {feed['category_icon']}")
    if feed.get('combined_score') is not None:
        lines.append(f"combined_score = {format_float(feed['combined_score'], digits=3)}")
    if feed.get('img_score') is not None:
        lines.append(f"img_score = {format_float(feed['img_score'], digits=3)}")
    if feed.get('fulltext_score') is not None:
        lines.append(f"fulltext_score = {format_float(feed['fulltext_score'], digits=3)}")
    if feed.get('lastUpdated'):
        lines.append(f"last_updated = {feed['lastUpdated']}")
    lines.append('')
    return lines


def build_feed_sections(feeds, stats):
    lines = []
    used_slugs = set()
    grouped = defaultdict(list)
    for continent, country, sub, entry in feeds:
        grouped[(continent, country, sub)].append(entry)
    for continent, country, sub in sorted(
        grouped.keys(),
        key=lambda key: (
            CONTINENT_ORDER.get(key[0], 999),
            normalize_country_label(key[0], key[1]).lower(),
            SUBCATEGORY_ORDER.get(key[2], 999)
        )
    ):
        entries = grouped[(continent, country, sub)]
        continent_slug = f'global_news_{safe_slug(continent)}'
        country_slug = f'{continent_slug}_{safe_slug(country)}'
        leaf_slug = f'{country_slug}_{safe_slug(sub)}'
        selected, total = stats.get((continent, country, sub), (len(entries), len(entries)))
        lines.append(f'; {continent} / {normalize_country_label(continent, country)} / {sub} (selected {selected} of {total})')
        for entry in entries:
            feed_slug_base = f'{leaf_slug}_{safe_slug(entry.get("title") or "feed")}'
            feed_slug = feed_slug_base or 'feed'
            suffix = 1
            while feed_slug in used_slugs:
                suffix += 1
                feed_slug = f'{feed_slug_base}_{suffix}'
            used_slugs.add(feed_slug)
            feed_record = {
                'title': entry.get('title'),
                'label': entry.get('title'),
                'url': entry.get('url'),
                'category_node': leaf_slug,
                'category': sub,
                'continent': continent,
                'country': normalize_country_label(continent, entry.get('parentCategory')),
                'subcategory': sub,
                'category_icon': SUBCATEGORY_ICONS.get(sub, 'world_news'),
                'combined_score': entry.get('combinedScore'),
                'img_score': entry.get('imgScore'),
                'fulltext_score': entry.get('fullTextScore'),
                'lastUpdated': entry.get('lastUpdated')
            }
            lines.extend(render_feed_section(feed_slug, feed_record))
    return lines


def integrate_into_ini(existing_text, generated_block):
    pattern = re.compile(rf'{re.escape(BEGIN_MARKER)}.*?{re.escape(END_MARKER)}\n?', re.S)
    if pattern.search(existing_text):
        existing_text = pattern.sub('', existing_text)
    existing_text = existing_text.rstrip()
    if existing_text:
        existing_text += '\n\n'
    return existing_text + generated_block + '\n'


def main():
    parser = argparse.ArgumentParser(description='Generate Global News hierarchy for newsreader.ini')
    parser.add_argument('--threshold', type=float, default=DEFAULT_THRESHOLD, help='Minimum combined score to include a feed')
    parser.add_argument('--limit', type=int, default=DEFAULT_LIMIT, help='Maximum feeds per country/subcategory leaf (<= 0 for unlimited)')
    parser.add_argument('--dry-run', action='store_true', help='Print generated output instead of editing newsreader.ini')
    parser.add_argument('--output', type=Path, help='Optional output path (defaults to newsreader.ini)')
    args = parser.parse_args()

    entries = load_report()
    filtered, skipped = filter_entries(entries, args.threshold)
    feeds, stats = build_hierarchy(filtered, args.limit)
    if not feeds:
        message = f'No feeds met the criteria (threshold={args.threshold}, limit={args.limit}).'
        if args.dry_run:
            print(message)
            return
        raise SystemExit(message)

    continents, countries, subcategories = generate_category_nodes(feeds)
    category_lines = build_category_sections(continents, countries, subcategories)
    feed_lines = build_feed_sections(feeds, stats)

    timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
    generated_lines = [
        BEGIN_MARKER,
        f'; Auto-generated on {timestamp}',
        f'; Source: {REPORT_PATH.name}',
        f'; Threshold: {args.threshold}  Limit: {"none" if args.limit <= 0 else args.limit}',
        f'; Selected feeds: {len(feeds)}  Filtered: {len(filtered)}  Skipped: {skipped}',
        ''
    ]
    generated_lines.extend(category_lines)
    generated_lines.extend(feed_lines)
    generated_lines.append(END_MARKER)
    generated_block = '\n'.join(generated_lines)

    if args.dry_run:
        sys.stdout.write(generated_block + '\n')
        return

    target_path = args.output if args.output else INI_PATH
    existing = target_path.read_text(encoding='utf-8') if target_path.exists() else ''
    updated = integrate_into_ini(existing, generated_block)
    target_path.write_text(updated, encoding='utf-8')

    summary = Counter(continent for continent, _, _, _ in feeds)
    print(f'Wrote {len(feeds)} feeds to {target_path}')
    for continent in sorted(summary, key=lambda c: CONTINENT_ORDER.get(c, 999)):
        print(f'  {continent}: {summary[continent]} feeds')


if __name__ == '__main__':
    main()
