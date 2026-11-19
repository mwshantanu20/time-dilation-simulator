# Deploying the Time Dilation Simulator to a public URL

This project is a **static frontend**: `index.html`, `style.css`, `app.js`, `lab.js`, `intro.css`, and `intro.js`. There is no build step and no server-side code required.

Upload only these files (plus `README.md` / `DEPLOY.md` if you want them visible):

```text
index.html
style.css
app.js
lab.js
intro.css
intro.js
```

You do **not** need `node_modules`, `package.json`, `package-lock.json`, or the verification harness for hosting.

Before publishing: open `lab.js` and change `OWNER_PIN` to your own PIN. The live deployment already uses a non-default value, but you should still set one you control before giving students access.

---

## Option 1 — GitHub Pages (free)

1. Create a GitHub account at <https://github.com/signup>.
2. Create a new repository, e.g. `time-dilation-simulator`, set **Public**, and choose **Add a README file**.
3. On your computer, inside this project folder, run:

   ```powershell
   git init
   git add index.html style.css app.js lab.js intro.css intro.js
   git commit -m "Publish virtual relativity lab"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/time-dilation-simulator.git
   git push -u origin main
   ```

   Replace `YOUR_USERNAME` with your GitHub username.

4. In the repository, go to **Settings → Pages**.
5. Under **Build and deployment**, set:
   - **Source:** `GitHub Actions`
6. This folder already includes `.github/workflows/deploy.yml`. If you pushed the whole folder, no extra work is needed. Its contents are:

   ```yaml
   name: Deploy static site to GitHub Pages

   on:
     push:
       branches: [main]
     workflow_dispatch:

   permissions:
     contents: read
     pages: write
     id-token: write

   jobs:
     deploy:
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/configure-pages@v5
         - uses: actions/upload-pages-artifact@v3
           with:
             path: .
         - id: deployment
           uses: actions/deploy-pages@v4
   ```

7. Commit that workflow and push. The **Actions** tab shows deployment progress.
8. Your public URL will be:

   ```text
   https://YOUR_USERNAME.github.io/time-dilation-simulator/
   ```

> Alternative: **Settings → Pages → Source: Deploy from a branch → main / root** also works, but the Actions method is the current recommended flow.

---

## Option 2 — Vercel (free hobby tier)

1. Sign up at <https://vercel.com/signup> and connect your GitHub account.
2. Push the project to a GitHub repository as in Option 1.
3. In Vercel, click **Add New → Project**, then **Import** that repository.
4. Leave the framework preset as **Other** / static. No build command is needed.
5. Click **Deploy**.
6. Vercel gives you a URL such as:

   ```text
   https://time-dilation-simulator.vercel.app
   ```

An optional `vercel.json` is included in this folder. It enables clean URLs and simple caching headers; Vercel works without it too.

---

## Option 3 — Netlify (free starter tier)

### Drag-and-drop (quickest)

1. Sign up at <https://app.netlify.com/signup>.
2. Open <https://app.netlify.com/drop>.
3. Drag this project folder onto the drop zone.
4. Netlify deploys it immediately and shows a random public URL like:

   ```text
   https://random-name-123456.netlify.app
   ```

5. Rename it under **Site settings → Site details → Change site name**.

### Git-connected deployment

1. Push the project to GitHub/GitLab/Bitbucket.
2. In Netlify, click **Add new site → Import an existing project**.
3. Choose your provider and repository.
4. Build settings:
   - **Base directory:** leave empty
   - **Build command:** leave empty
   - **Publish directory:** `.` (or leave the default)
5. Click **Deploy site**.

An optional `netlify.toml` is included with `publish = "."` and cache headers.

---

## Important: data storage caveat

Everything in the notebook and billing window uses browser `localStorage`:

- `tds.virtualLab.readings.v1`
- `tds.virtualLab.billing.v1`

That means:

- Records stay on the **same browser/device/profile** that created them.
- A student on their phone will not see readings logged on a lab desktop.
- Clearing browser storage deletes the records.
- The PIN is client-side only — it prevents casual clicks, not determined access.

If you need **central, multi-device billing**, replace the `saveJSON`/`loadJSON` calls in `lab.js` with API calls to a shared backend, for example:

- **Firebase Firestore** + Firebase Auth for owner/student roles
- **Supabase** Postgres tables + Row Level Security
- A small Node/Express API backed by SQLite/Postgres

The `billing` object is already structured as `{ settings, sessions[] }`, so it maps cleanly to a `sessions` table with columns such as `id`, `user`, `started_at`, `ended_at`, `total_seconds`, `active_seconds`, `paid`, and `amount`.

---

## Custom checks after deployment

1. Open the public URL on your phone or another computer.
2. Confirm the 3D canvas loads and the intro can be skipped/completed.
3. Open **LAB NOTEBOOK**, click **LOAD PRESET**, **LOG READING**, **EXPORT CSV**, and **PRINT EXPERIMENT**.
4. Open **LAB USAGE / BILLING**, enter your new PIN, start the simulation briefly, and verify **Active** time increases.
5. Check the browser console for errors (`F12 → Console`).
