#!/bin/bash
#
# chat-media-purge.sh — expire web-chat drag-and-drop attachments.
#
# Chat uploads are deliberately temporary: api/chat-upload.ssjs files them under
# root/chatmedia/<YYYY-MM-DD>/ so expiry is a whole-directory drop by date
# rather than a stat walk over every attachment ever posted.
#
# Messages keep the original URL in chat history; the embed renderer turns a
# link that no longer resolves into an "attachment expired" card, so nothing
# needs to rewrite the transcript.
#
# Install (runs daily at 04:20):
#   20 4 * * * /sbbs/mods/chat-media-purge.sh >/dev/null 2>&1
#
set -u

MEDIA_DIR="/sbbs/webv4_custom/root/chatmedia"
STAGE_DIR="/sbbs/data/chat-upload"
RETAIN_DAYS="${CHAT_MEDIA_RETAIN_DAYS:-7}"

# Abandoned part files: a browser tab closed mid-upload leaves staging behind.
STAGE_STALE_MIN=120

# Encoder slot locks are directories; one held this long lost its request.
LOCK_STALE_MIN=30

log() { printf '%s chat-media-purge: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"; }

if [ ! -d "$MEDIA_DIR" ]; then
    log "no media directory at $MEDIA_DIR, nothing to do"
    exit 0
fi

cutoff="$(date -d "${RETAIN_DAYS} days ago" +%Y-%m-%d)"
removed=0
freed=0

# Date-named directories only — anything else under chatmedia is not ours.
for dir in "$MEDIA_DIR"/*/; do
    [ -d "$dir" ] || continue
    name="$(basename "$dir")"

    case "$name" in
        [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
        *) continue ;;
    esac

    # String compare is safe and correct for zero-padded ISO dates.
    if [[ "$name" < "$cutoff" ]]; then
        size="$(du -sk "$dir" 2>/dev/null | cut -f1)"
        if rm -rf -- "$dir"; then
            removed=$((removed + 1))
            freed=$((freed + ${size:-0}))
        else
            log "failed to remove $dir"
        fi
    fi
done

if [ "$freed" -ge 1024 ]; then
    freed_text="~$((freed / 1024)) MB"
else
    freed_text="~${freed} KB"
fi
log "removed ${removed} day folder(s), freed ${freed_text} (retain ${RETAIN_DAYS}d, cutoff ${cutoff})"

if [ -d "$STAGE_DIR" ]; then
    find "$STAGE_DIR" -maxdepth 1 -type f \( -name '*.part' -o -name '*.json' -o -name 'exec-*.out' \) \
        -mmin "+${STAGE_STALE_MIN}" -delete 2>/dev/null
    find "$STAGE_DIR/locks" -maxdepth 1 -type d \( -name 'slot*' -o -name 'user-*' \) \
        -mmin "+${LOCK_STALE_MIN}" -exec rmdir {} + 2>/dev/null
fi

exit 0
