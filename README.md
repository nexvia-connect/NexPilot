# Nexvia Novia (Chrome Extension)

Private, company-internal Chrome addon for Nexvia support workflows.

## What this is

This extension injects small helpers on specific websites (Imm otop / AtHome / Wortimmo, etc.) to automate annoying repetitive actions and to show consistent UI popups/command centers with a unified style.

## Local development (load unpacked)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the folder: `nexvia-novia/extension`

## Project structure

- `extension/manifest.json`: Manifest V3
- `extension/src/background/service-worker.js`: service worker (MV3)
- `extension/src/content/`: per-site helpers (content scripts)
- `extension/src/ui/`: shared UI system (single CSS + JS helper)
- `extension/assets/`: icons

## Shipping privately

Recommended options (pick one):

- **Google Admin (Managed Chrome)**: publish privately to your Workspace org (best for company-wide).
- **Self-hosted CRX**: internal distribution for a smaller team (more manual).
- **Developer mode**: for internal testers only.

## Notes

- This repo currently contains scaffolding + ports of the first two Tampermonkey scripts you provided.
- The UI is built with a Shadow DOM “overlay” so website CSS won’t break our popups, and our styles won’t leak onto websites.

