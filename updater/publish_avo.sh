#!/usr/bin/env bash
set -euo pipefail

STAGE_DIR="/sbbs/data/dirs/updates_avo_stage"
PUBLIC_DIR="/sbbs/webv4_custom/root/updates/avo"
SEM_FILE="/sbbs/temp/updates_avo_publish.sem"
LOG_FILE="/sbbs/logs/updater-publish.log"

# Run only when semaphore exists unless explicitly forced
if [[ "${1:-}" != "--force" && ! -f "$SEM_FILE" ]]; then
  exit 0
fi

mkdir -p "$PUBLIC_DIR"
shopt -s nullglob

published_zips=0

# Process release-*.zip bundles only (overwrite in place, preserve subdirs)
for zip in "$STAGE_DIR"/release-*.zip; do
  [[ -f "$zip" ]] || continue

  # Basic zip-slip guard
  bad=0
  while IFS= read -r entry; do
    [[ -z "$entry" ]] && continue
    case "$entry" in
      /*|../*|*"/../"*|*"..\\"*|*"\\.."*) bad=1; break ;;
    esac
  done < <(zipinfo -1 "$zip")

  if (( bad )); then
    printf '%s skipped_unsafe_zip=%s\n' "$(date -u +%FT%TZ)" "$(basename "$zip")" >> "$LOG_FILE"
    rm -f "$zip"
    continue
  fi

  unzip -oq "$zip" -d "$PUBLIC_DIR"
  rm -f "$zip"
  published_zips=$((published_zips+1))
done

rm -f "$SEM_FILE"
printf '%s published_zips=%d\n' "$(date -u +%FT%TZ)" "$published_zips" >> "$LOG_FILE"
