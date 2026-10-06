# Local patches to upstream-tracked files

Patches here modify files that live inside the upstream checkout
(/sbbs/repo) and therefore cannot move into /sbbs/mods the way shadowed
libraries can. Each patch stays APPLIED in the live working tree; the .patch
file is the durable record so the change survives upstream syncs.

## Current patches

- `go-for-explore-bridge.patch` - adds load_startup_target() to
  xtrn/go-for/go-for.js: consumes a one-shot node_dir/go-for-startup.json
  (written by fshell_ts, src/runtime/sbbs.ts) so an Explore bookmark opens
  a specific gopher document directly. We don't develop the gopher door
  independently, so a patch beats a forked copy.

## Upstream sync / promotion flow

Uncommitted local changes block a merge that touches the same file, so:

    git -C /sbbs/repo checkout -- <patched files>     # drop local copies
    git -C /sbbs/repo merge <qualified upstream pin>  # real merge
    for p in /sbbs/mods/patches/*.patch; do
        git -C /sbbs/repo apply "$p"                  # re-apply local work
    done

The evergreen qualifier (/sbbs/evergreen/qualify.sh) checks every patch
here against each merge candidate with `git apply --check` and fails the
report (verdict PATCH-STALE) if one no longer applies, so patch rot is
caught weekly instead of mid-promotion.
