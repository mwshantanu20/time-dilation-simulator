# Deploying the Time Dilation Simulator to a public URL

This project is a **static frontend**: `index.html`, `style.css`, `app.js`, `lab.js`, `intro.css`, and `intro.js`. There is no build step and no server-side code required.

## Live deployment

| Route | URL |
|---|---|
| Public virtual lab | <https://mwshantanu20.github.io/time-dilation-simulator/?view=lab> |
| Owner usage / billing | <https://mwshantanu20.github.io/time-dilation-simulator/?view=owner&key=RLO-4825-owner> |

- Repository: <https://github.com/mwshantanu20/time-dilation-simulator>
- Owner PIN: **`4825`**
- Owner URL key: **`RLO-4825-owner`** (read from `?view=owner&key=…` and prefilled into the owner gate)
- Pages build type: **GitHub Actions** (`.github/workflows/deploy.yml`)

The owner key and PIN are client-side constants in `lab.js`. They prevent casual access only; use a real authenticated backend for strong security. Change them before sharing with students if you need a different guard.

Asset URLs in `index.html` use `?v=4` query strings. Bump that number when publishing changes so returning browsers do not serve cached files.

---

## Files to upload

```text
index.html
style.css
app.js
lab.js
intro.css
intro.js
```

You do **not** need `node_modules`, `package.json`, `package-lock.json`, or the verification harness for hosting. `README.md` / `DEPLOY.md` and `.github/workflows/deploy.yml` are useful to keep in the repo.

---

## Option 1 — GitHub Pages (used by the live site)

1. Push the project files to the `main` branch of `github.com/mwshantanu20/time-dilation-simulator`.
2. In **Settings → Pages**, set **Build and deployment → Source: GitHub Actions**.
3. `.github/workflows/deploy.yml` uploads the repo root as the Pages artifact and deploys it. The **Actions** tab shows progress.
4. Open the two URLs above. On the owner route the billing modal opens automatically, the key is prefilled, and entering PIN `4825` reveals the console.

> Alternative: **Settings → Pages → Source: Deploy from a branch → main / root** also works, but the Actions method is the current recommended flow.

---

## Option 2 — Vercel (free hobby tier)

1. Sign up at <https://vercel.com/signup> and connect your GitHub account.
2. Import the repository.
3. Leave the framework preset as **Other** / static. No build command is needed.
4. Click **Deploy**. An optional `vercel.json` with clean URLs and caching headers is included.

---

## Option 3 — Netlify (free starter tier)

### Drag-and-drop (quickest)

1. Sign up at <https://app.netlify.com/signup>.
2. Open <https://app.netlify.com/drop>.
3. Drag this project folder onto the drop zone and rename the site under **Site settings → Site details → Change site name**.

### Git-connected deployment

1. Import the repository into Netlify.
2. Build command: empty. Publish directory: `.`
3. Click **Deploy site**. An optional `netlify.toml` with `publish = "."` is included.

---

## Two-route lab flow

- **`/ ?view=lab`** — public route. The owner button is hidden. Save an email via **USER PROFILE** first: START, LOG READING and NOTE READING all require it. **NOTE READING** opens a dedicated modal and saves the current clocks/configuration plus your comment as an email-tagged row. CSV and print reports include the Email column.
- **`/ ?view=owner&key=RLO-4825-owner`** — private route. The cinematic intro is skipped and the billing modal opens; enter PIN `4825` to unlock. The console shows a **Totals by User Profile** table aggregated by email plus the session table, billing settings, CSV export and reset.

---

## Important: data storage caveat

Everything in the notebook, profile and billing windows uses browser `localStorage`:

- `tds.virtualLab.profile.v1`, `tds.virtualLab.profiles.v1`
- `tds.virtualLab.readings.v1`
- `tds.virtualLab.billing.v1`

That means:

- Records stay on the **same browser/device/profile** that created them.
- A student on their phone will not see readings logged on a lab desktop.
- Clearing browser storage deletes the records.
- The PIN/key guard is client-side only — it prevents casual clicks, not determined access.

### Optional shared storage

`lab.js` has a `REMOTE_SYNC_ENDPOINT` constant (empty by default). Set it to an endpoint such as `'https://your-api.example.com/lab-state'`:

- `LabStorage.set()` mirrors each write with `POST { key, value }`.
- `LabStorage.pullAll()` fetches the full state when the owner unlocks the console, merging remote readings, sessions and profiles.

Endpoint responses should be JSON shaped like `{ readings: [...], billing: { settings, sessions }, profiles: [...] }`. For production multi-device billing, use Firebase Firestore + Auth, Supabase + Row Level Security, or a Node/Express API backed by SQLite/Postgres with real owner/student roles.

The `billing` object is already structured as `{ settings, sessions[] }`, so it maps cleanly to a `sessions` table with columns such as `id`, `user`, `started_at`, `ended_at`, `total_seconds`, `active_seconds`, `paid`, and `amount`.

---

## Custom checks after deployment

1. Open the public URL; confirm the 3D canvas and intro load, then sign in with an email and click START.
2. Click **NOTE READING**, type a note and **SAVE READING**; verify the readings table shows the email and note. Check **EXPORT CSV** and **PRINT EXPERIMENT** include Email.
3. Open the owner URL; the billing modal should open with the key prefilled. Enter PIN `4825` and verify the email summary and session tables render.
4. Check the browser console for errors (`F12 → Console`).
5. If assets look stale, append `?v=5` (or higher) to the asset URLs in `index.html` and redeploy.
