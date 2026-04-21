<!-- Automated syncback opened by .github/workflows/auto-syncback.yml.
     If opening manually: gh pr create --template syncback.md --base develop --head main -->

## Syncback: `main` → `develop`

Realigns `develop` with `main`.

**If the diff is empty (0 files changed):** it's a merge-graph-only sync from a release PR. Safe to merge in one click — tick **Merge without waiting for requirements (bypass rules)** and hit merge. CI checks will sit as "Expected" forever because GitHub's anti-loop rule blocks workflows on bot-created PRs; that's expected, not a problem.

**If the diff has file changes:** main has content develop doesn't (hotfix, docs patch, emergency config). Review it before merging.

- [ ] Diff looks correct for the direct-to-main change (if any)
- [ ] No merge conflicts

Empty-diff → one-click bypass-merge. Non-empty → review, then merge.
