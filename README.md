# Time Dilation Simulator — Virtual Relativity Lab

An interactive Three.js laboratory for exploring **general relativity** (Schwarzschild time dilation) and **special relativity** (Lorentz time dilation) near a stellar-mass black hole.

> **Important:** All inputs are physics-driven. Wi‑Fi signal strength, network mode, and RSSI-to-distance mappings have been removed. The distance is `r / r_s`, mass is `0.1–5 M☉`, velocity is `v / c`, and the Earth reference observer is **26,500 light-years** away.

---

## Features

### Physics simulation
- Real-time Schwarzschild gravity factor `√(1 − r_s/r)` using distance in Schwarzschild radii.
- Special-relativistic Lorentz factor `γ = 1/√(1 − v²/c²)` with a `0 → 1 c` velocity slider.
- Combined proper-time rate `dτ/dt = √(1 − r_s/r) × √(1 − v²/c²)`.
- Three clocks: LOCAL (real browser time), REFERENCE (Earth observer at 26,500 ly), PROBE (moving observer).
- Mass range `0.1–5 M☉`; `r_s = 2GM/c²` gives `≈ 14.77 km` at `5 M☉`.
- Advanced visual effects: gravitational/kinematic redshift, tidal spaghettification, relativistic aberration, frame dragging, Shapiro delay, and photon-sphere ghost images.
- Preset scenarios: baseline, event horizon approach, velocity freeze, combined gravity + velocity, photon sphere.

### Virtual lab
- **LAB NOTEBOOK** — log timestamped readings with all three clocks, `r/r_s`, mass, velocity, `r_s (km)`, time rate, and an observation note.
- Readings table with per-row delete, clear-all, and CSV export.
- **PRINT EXPERIMENT** — builds a clean print view with user name, session date, configuration, equations, all readings, and total active lab time.
- In-panel stopwatch for elapsed experiment time.

### Owner usage & billing
- **LAB USAGE / BILLING** button, protected by an owner PIN configured as `OWNER_PIN` in `lab.js`. The published deployment uses a non-default PIN; change it to your own before sharing with students.
- Tracks per-session:
  - Total connected/open time
  - Active simulation running time (`STATE.isRunning === true`)
  - Billable time and calculated amount
- Multiple user/session entries, configurable currency, rate/hour, rate/minute, billable-time source, and minimum billing increment.
- Mark paid/delete sessions, reset all data, and export billing CSV.
- Data is stored in `localStorage` under `tds.virtualLab.readings.v1` and `tds.virtualLab.billing.v1`, structured for a future backend/API.

---

## Run locally

No build step and no backend are required. Open the folder with a local static server so browser module/asset paths resolve correctly:

```powershell
# From this folder
python -m http.server 8000
```

Then visit <http://localhost:8000>.

Alternative with Node (if you prefer not to use Python):

```bash
npx serve .
```

> Opening `index.html` directly with `file://` is not recommended; use a local server.

---

## Controls

| Control | Effect |
|---|---|
| START / PAUSE | Runs or freezes the simulated clocks and stopwatch |
| RESET | Returns sliders, clocks, and camera to defaults |
| DISTANCE (r/rₛ) | Probe distance in Schwarzschild radii (`1` = event horizon, `50` = far slider limit) |
| MASS | Black hole mass, `0.1–5 M☉`; changes physical `r_s` in km |
| SPEED | Simulation playback rate for the clocks |
| VELOCITY | Probe speed `0–1 c`; `1 c` freezes its clock |
| BLACK HOLE SPIN | Kerr-like spin parameter `a`, `0–0.99` |
| PHYSICS DETAILS | Equations, assumptions, and scale notes |
| LAB NOTEBOOK | Readings, presets, stopwatch, CSV, print report |
| LAB USAGE / BILLING | Owner-only session tracking and billing |

---

## How the lab features work

- **Reading logging:** `lab.js` snapshots the live DOM clock strings plus `STATE` values. Each row is appended to an in-memory array and saved to `localStorage`.
- **Print report:** `buildPrintReport()` writes a dedicated `#printReport` element and calls `window.print()`. A `@media print` rule hides the simulator and shows only the report.
- **Session/billing tracking:** A one-second interval increments wall-clock connected time always, and active time only while `STATE.isRunning` is true. Settings and sessions are persisted as JSON. Billable minutes are rounded up to the configured increment, then multiplied by the per-minute rate (derived from rate/minute if set, otherwise rate/hour ÷ 60).

---

## Physics & scale notes

- `r_s = 2GM/c²`, with `M = mass × M☉`.
- Distance is normalized to `r/r_s`, so the event horizon is always at scene radius `1` and the gravity factor is mass-independent at a fixed `r/r_s`.
- The 3D scene is compressed into Schwarzschild-radii units for WebGL readability. Earth's glyph at scene radius `30` is a **visual proxy**; its physical clock rate is computed at **26,500 ly**, where `r_s/r < 8×10⁻¹⁷` and dilation is effectively zero.
- At the `30 r_s` visual baseline the probe reads `√(1 − 1/30) ≈ 0.9831×` the Earth reference. This is physically correct because the probe is far closer to the hole than Earth.
- `r = r_s` or `v = c` gives a proper-time rate of exactly `0`.

---

## Verification

```bash
npm test
```

The harness extracts the real physics functions from `app.js`, checks mass/horizon/light-speed behavior, advanced effect equations, removal of Wi‑Fi references, and DOM wiring for all lab/billing elements.

---

## Publishing to a public URL

See **[DEPLOY.md](DEPLOY.md)** for step-by-step GitHub Pages, Vercel, and Netlify instructions.

> `localStorage` is per-browser and per-device. Readings and billing records will **not** sync across students or machines. For central multi-device billing, connect `lab.js` to a shared backend such as Firebase, Supabase, or a small REST API + database.
