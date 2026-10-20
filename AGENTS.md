<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git workflow — `main` only (hard rule)

All work in this repository happens directly on the `main` branch.

- Do not create branches, worktrees or forks of the working copy. Commit straight to `main` with clear messages.
- If your tool or session starts you in a separate branch or worktree, stop and work in the main checkout (`/Users/ibrahimi/Door & Floor Visualizer`, branch `main`) instead.
- Before starting, run `git status -sb` and confirm it says `## main`. If it doesn't, switch back with `git checkout main`.
- Push to GitHub (`origin/main`) only when the owner asks.
