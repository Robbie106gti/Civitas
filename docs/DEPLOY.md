# Deploying Civitas (Vercel + Supabase)

## Architecture

| Piece | Host |
| ----- | ---- |
| Frontend (Vite/Svelte PWA) | Vercel |
| Database + API | Supabase (`bmnjagwxrlklsalehdqr`) |
| SQL migrations | Supabase GitHub integration (`supabase/` on `main`) |

## Option A — GitHub Actions → Vercel (this repo)

Workflow: [`.github/workflows/deploy-vercel.yml`](../.github/workflows/deploy-vercel.yml)

Triggers on every push to **`main`** (and manual **workflow_dispatch**).

### One-time setup

1. **Create a Vercel project** (empty is fine) for `Robbie106gti/Civitas`, or import the repo once in the Vercel dashboard to get IDs.
2. **Vercel token:** [Account → Tokens](https://vercel.com/account/tokens) → create token.
3. **Org & project IDs:** from the Vercel project → **Settings → General**, or run locally after `vercel link`:
   - `VERCEL_ORG_ID` → `.vercel/project.json` → `orgId`
   - `VERCEL_PROJECT_ID` → `.vercel/project.json` → `projectId`
4. **GitHub repo secrets** ([Settings → Secrets and variables → Actions](https://github.com/Robbie106gti/Civitas/settings/secrets/actions)):

   | Secret | Value |
   | ------ | ----- |
   | `VERCEL_TOKEN` | Vercel token |
   | `VERCEL_ORG_ID` | Team/user org ID |
   | `VERCEL_PROJECT_ID` | Project ID |
   | `VITE_SUPABASE_URL` | `https://bmnjagwxrlklsalehdqr.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Supabase **anon** key (Project Settings → API) |

5. **Avoid double deploys:** If you use this workflow, turn off Vercel’s automatic “Git push” deploy for the same repo (**Project → Settings → Git →** disconnect or disable auto-deploy). Use **either** Actions **or** Vercel’s native Git integration, not both.

6. **Supabase Auth URLs** (when you add login): set **Site URL** and **Redirect URLs** to your Vercel production URL under [Auth URL configuration](https://supabase.com/dashboard/project/bmnjagwxrlklsalehdqr/auth/url-configuration).

### Verify

Push to `main` → **Actions** tab → “Deploy to Vercel” should succeed → open the production URL from Vercel → play and check **Table Editor → `city_saves`** for a new row.

## Option B — Vercel Git integration only (no Actions)

Connect `Robbie106gti/Civitas` in the Vercel dashboard, set the same `VITE_*` env vars in **Project → Environment Variables**, production branch `main`. Vercel deploys on each push without a workflow file.

## Local development

```bash
cp .env.example .env.local
# fill VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

`.env.local` is gitignored; never commit keys.
