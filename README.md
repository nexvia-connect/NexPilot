# NexPilot (Chrome Extension)

Private, company-internal Chrome extension for **Nexvia** support workflows.

## What this is

NexPilot injects small helpers on specific websites (Imm otop / AtHome / Wortimmo, Easy, etc.) to automate repetitive actions and to show a consistent in-page UI (NexPilot cards + bottom pill) with a unified look.

## Local development (load unpacked)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the folder: `nexvia-novia/extension` (or your clone path + `/extension`)

## Project structure

- `extension/manifest.json`: Manifest V3
- `extension/src/background/service-worker.js`: service worker (MV3)
- `extension/src/content/`: per-site helpers (content scripts)
- `extension/src/ui/`: shared UI (Shadow DOM overlay + `NexPilotUI` global)
- Toolbar icon is drawn in code: white **hex** on Nexvia blue, plus a count when tools are active

## Shipping privately

Recommended options (pick one):

- **Google Admin (Managed Chrome)**: publish privately to your Workspace org (best for company-wide).
- **Self-hosted CRX**: internal distribution for a smaller team (more manual).
- **Developer mode**: for internal testers only.

## Notes

- The in-page UI uses a Shadow DOM “overlay” so site CSS does not break our popups, and our styles do not leak onto host pages.
- The global API exposed to content scripts is `window.NexPilotUI` (`createCard`, `getBody`, `revealCard`, `minimizeFromCard`, `icons`).
