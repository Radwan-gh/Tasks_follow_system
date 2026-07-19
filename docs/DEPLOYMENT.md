# Deployment (Railway)

Both services deploy to [Railway](https://railway.com) using its native GitHub
integration: **every merge into `main` automatically builds a new version and
deploys it**, and each deploy waits for CI to go green first.

## How it fits together

```
merge PR into main
      │
      ▼
GitHub Actions CI  (.github/workflows/ci.yml)
  pnpm install → build → typecheck → test
      │  (checks reported to the main commit)
      ▼
Railway "Wait for CI"  holds the deploy until checks pass
      │
      ▼
Railway builds each service via its Railpack config
  • apps/api   → railpack.api.json  (prisma migrate deploy → seed → start)
  • apps/web   → railpack.web.json  (build → serve static dist)
```

- **Build/deploy commands** live in `railpack.api.json` and `railpack.web.json`
  at the repo root — Railway's Railpack builder reads these. Changing what runs
  at build or start time is a code change here, not a dashboard change.
- **The auto-deploy trigger and the CI gate are Railway dashboard settings** —
  they can't be committed to the repo, so the one-time setup is below.

## One-time Railway setup

Do this once per service (the API and the web app are two Railway services in
the same project).

1. **Connect the repo.** In the Railway project, create/open the service →
   **Settings → Source** → connect `Radwan-gh/Tasks_follow_system`.
2. **Set the deploy branch to `main`.** Settings → Source → **Deployment
   Branch** = `main`. This is what makes every merge into `main` trigger a new
   build + deploy. (Leave "Deploy on push" enabled — it's the default.)
3. **Point each service at its Railpack config.** Settings → Build →
   **Config-as-code path**:
   - API service → `railpack.api.json`
   - Web service → `railpack.web.json`
4. **Gate deploys on CI.** Settings → Deploy → enable **"Wait for CI"**.
   Railway will now hold each `main` deploy until the GitHub checks on that
   commit (the `CI` workflow) succeed, and skip the deploy if they fail.
5. **Set environment variables** on the API service: `DATABASE_URL` (a Railway
   Postgres plugin provides this), the JWT secrets from
   `apps/api/.env.example`, and on the web service `VITE_API_URL` pointing at
   the API service's public URL.

After this, the flow is hands-off: open a PR, CI runs, merge to `main`, CI runs
again on the merge commit, and Railway deploys once it's green.

## Notes

- **PRs are checked too.** The CI workflow also runs on pull requests targeting
  `main`, so problems surface before the merge rather than at deploy time.
- **`pnpm build` / `pnpm test` are the source of truth.** The workflow runs the
  same root Turborepo tasks used locally, so "green in CI" means the same thing
  as "green on your machine".
- **Why "Wait for CI" needs a workflow to exist:** the toggle only waits for
  checks that are actually reported on the commit. `.github/workflows/ci.yml` is
  what produces those checks — without it, "Wait for CI" has nothing to wait on
  and deploys proceed immediately.
