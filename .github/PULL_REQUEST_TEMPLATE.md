<!-- ⚠️  TARGET BRANCH: This PR must target `develop`, not `main`.
     ⚠️  BRANCH NAME:  Must follow the format in CONTRIBUTING.md:
          feat/issue-42-short-description
          fix/issue-7-brief-name
          docs/update-pipeline-diagram
     CI will block the PR automatically if the branch name is wrong. -->

## What this PR does

<!-- One paragraph. Link the issue it closes: "Closes #123" -->

## How to test

<!-- Steps the reviewer can follow to verify the change works and nothing is broken. -->

1. 
2. 
3. 

## Checklist

- [ ] Branch targets `develop` (not `main`)
- [ ] Branch name follows the `<type>/issue-<n>-<description>` convention
- [ ] Read [CLAUDE.md](../CLAUDE.md) before making changes
- [ ] Behaviour is unchanged or the change is intentional and described above
- [ ] Key behaviours are not broken: TTS feedback flag, VAD pre-buffer, WASAPI reinit, device fallback
- [ ] Glass design rules followed (no solid backgrounds, no Tailwind)
- [ ] No hardcoded API keys, paths, or credentials
- [ ] Tested manually with `npm run dev`

## Screenshots (if UI changed)

<!-- Before / After screenshots help reviewers understand visual changes -->
