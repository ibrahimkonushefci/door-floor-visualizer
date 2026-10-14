# Pitch kit

Everything needed to show the Studio to a showroom owner or importer (plan Phase 6). It uses the **Porta & Dysheme** demo brand until a target showroom is chosen.

| File | What it is |
|---|---|
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | The 3-minute demo: what to tap, what they see, what to say (SQ + EN), recovery, honest answers to likely questions |
| [OFFER.md](OFFER.md) | One-page offer draft in SQ and EN. **All prices and terms are blank for the owner to decide** |
| [REBRAND_CHECKLIST.md](REBRAND_CHECKLIST.md) | What to collect from the chosen showroom and how to put their brand, products and décors in |

In the app: the presenter sheet (press and hold the logo for about a second, or open any page with `?presenter=1`) has a **3-minute demo** list. Each of its four stops opens one scripted room and combination (data: `brand/demo-route.json`). Customers never see the sheet.

## Before every demo

On the laptop, from the project folder:

```sh
pnpm build && pnpm preview
```

Then:

1. Open `http://127.0.0.1:4173/sq/studio/` (or `/en/studio/`) in Chrome or Safari. Browser zoom 100 %, other tabs closed, laptop on power.
2. Open the presenter sheet. If it says "A new version is ready" (after every rebuild), press **Update now** first; the page reloads. Then press **Save for offline use** (about 31 MB). Wait for "Ready for offline use." The demo now runs without Wi-Fi.
3. Tap each of the four demo stops once, so every room has been opened (first opens are the slowest).
4. Tap stop **1 · Living room — start** and close the sheet. You are ready.

### Showing the QR code on a real phone

From `pnpm preview` the QR code points to this laptop (127.0.0.1), which a phone cannot open; the dialog says so. Either explain that the live site opens on the customer's phone, or run the LAN preview: `pnpm lan-https:cert` once, then `pnpm preview:lan`, and install the test certificate on your own phone first ([../plan/IPAD_BASELINE.md](../plan/IPAD_BASELINE.md), section A). Only scan with your own phone.

## What is true today (say only this)

- All products, prices and contacts are **demo content**. The floor décors are real Kronotex products, but the images have **no reuse licence**: show them in private conversations only, and get written permission before any customer use.
- The **own-room photo tool's AI has an unresolved commercial-use licence** (non-commercial research/evaluation licence; see the [README licensing reminder](../../README.md#licensing-reminder)). It is not part of the script or the offer. Do not assume a sales demonstration is permitted; review the licence or replace the model first.
- Tested in a desktop browser at laptop, iPad and iPhone sizes. **Not yet tested on a physical iPad or iPhone** (production acceptance).
- Not deployed. Nothing is sent: in demo mode the WhatsApp/Viber request is shown as a preview.

## Status

Phase 6 in [../plan/STUDIO_REALISM_PLAN.md](../plan/STUDIO_REALISM_PLAN.md). Deferred until a customer opportunity: the 20-photo test of the photo tool, the AI licence/replacement decision, the real rebrand, pricing, production acceptance on devices, and deployment.
