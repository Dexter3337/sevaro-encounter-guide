# Contributing

Start from `main`, create a feature branch, and open a pull request. Never commit patient information, provider keys, `.env.local`, dependency folders or generated builds.

```sh
git switch main
git pull --ff-only
git switch -c feature/your-change
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

Run browser checks for interaction changes. Keep hospital policy in the deterministic engine; AI drafts require clinician review and validated source excerpts. Add synthetic tests for new triggers, time windows, imports and completion conditions.

Netlify previews can be deployed from a feature branch without merging. The production submission is `main`. Historical sprint branches were removed only after their commits were reachable from main.
