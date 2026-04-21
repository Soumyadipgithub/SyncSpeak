<!-- ⚠️  PRODUCTION RELEASE — This PR goes from `develop` to `main`.
     ⚠️  Title format:  release: vX.Y.Z — <short theme>
     ⚠️  Bump the version in package.json, tauri.conf.json, Cargo.toml,
         website softwareVersion, and CHANGELOG.md BEFORE opening this PR.
     ⚠️  The Branch Name Check is skipped for develop → main PRs; all
         other CI jobs must still pass. -->

## Release: v_._._

<!-- e.g. v3.0.0 — Public Launch, or v3.1.0 — Tamil support -->

## What's in this release

<!-- Group commits by theme. Link each feature to its merged PR. -->

### Desktop app
- 
- 

### Website
- 
- 

### CI / infra
- 
- 

### Fixes
- 
- 

## Version bump

- [ ] `package.json` updated
- [ ] `src-tauri/tauri.conf.json` updated
- [ ] `src-tauri/Cargo.toml` updated
- [ ] `website/src/pages/index.astro` `softwareVersion` updated
- [ ] `CHANGELOG.md` has a new entry for this version
- [ ] `docs/architecture.md` version reference updated (if changed)

## Pre-release checks

- [ ] Tested desktop app end-to-end with `npm run dev` — translation pipeline works
- [ ] Tested website preview URL (copy from Version History) — all 9 pages load
- [ ] No personal data / credentials / TODOs leaked in the diff
- [ ] No file over 5 MB in the diff
- [ ] All required CI jobs pass (branch-name skipped intentionally for develop→main)
- [ ] Sitemap still lists all pages correctly
- [ ] Links in README and docs still valid

## Rollout plan

<!-- What goes live, in what order -->

1. Merge this PR → `main` updates
2. Cloudflare auto-deploys website to `syncspeak.soumg.workers.dev` (~1 min)
3. GitHub Actions builds desktop binaries and publishes to GitHub Releases (manual trigger if needed)
4. Create git tag: `git tag vX.Y.Z && git push --tags`
5. Open the sync-back PR: `main → develop` to keep develop in sync

## Smoke tests (after merge, before announcing)

- [ ] Open `https://syncspeak.soumg.workers.dev` — home page loads, version shows correctly
- [ ] `/features`, `/how-it-works`, `/download`, `/faq`, `/developers`, `/docs`, `/privacy` all load
- [ ] Download button on `/download` points at the latest GitHub release
- [ ] `robots.txt` accessible, `sitemap-index.xml` accessible
- [ ] Desktop app binary runs on a clean machine (or verified via a tester)

## Rollback plan

<!-- If something breaks in production, how do we recover fast? -->

- **Website**: Cloudflare → Workers → Deployments → click previous version → **Promote to production** (≤1 min)
- **Desktop app**: previous release binaries remain on GitHub Releases — users can re-download
- **Config / APIs**: no server-side state to revert; each user has their own local config

## Announcement (post-merge)

- [ ] Update GitHub repo **Releases** page with CHANGELOG notes
- [ ] Pin release PR comment: "This version is live at syncspeak.soumg.workers.dev"
- [ ] Optional: social post / launch announcement
