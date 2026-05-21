# Deploying Civitas (Vercel + Supabase)

## Architecture

| Piece | Host |
| ----- | ---- |
| Frontend (Vite/Svelte PWA) | **Vercel** (Git integration on `main`) |
| Database + API | **Supabase** (`bmnjagwxrlklsalehdqr`) |
| SQL migrations | Supabase GitHub integration (`supabase/` on `main`) |

## Vercel (production frontend)

Project: **civitas** under team **robert-leeuwerink-s-projects**, linked to `Robbie106gti/Civitas`.

- **Production URL:** https://civitas-delta.vercel.app

- **Production branch:** `main`
- **Build:** `npm run build` → output `dist` (see `vercel.json`)
- **Env vars** (set in Vercel project settings or CLI):
  - `VITE_SUPABASE_URL` = `https://bmnjagwxrlklsalehdqr.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = Supabase anon key (Project Settings → API)

Each push to `main` triggers a Vercel production deploy. Preview deploys run for other branches/PRs.

**Do not** re-add a GitHub Actions Vercel workflow — that would double-deploy with this setup.

### Supabase Auth URLs

When login ships, set **Site URL** and **Redirect URLs** to your Vercel production URL in [Auth URL configuration](https://supabase.com/dashboard/project/bmnjagwxrlklsalehdqr/auth/url-configuration).

## Local development

```bash
cp .env.example .env.local
# fill VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

`.env.local` is gitignored; never commit keys.
