# Physical-iPad baseline (production acceptance)

> **Status (owner, 2026-10-14): deferred.** The owner has no iPad, so this no longer blocks Phase 4 or its demo review gate. Run it — plus zoom, A/B, an image export and the same steps on an iPhone — as part of production acceptance before selling or deploying. The procedure below is unchanged.

Measures today's Studio on a real iPad in Safari before zoom, A/B and image export are built (plan: Phase 4, "Before the UI work", item 3). The same procedure, plus zoom, A/B and an export, is repeated at the Phase 4 gate. About 30–40 minutes.

You need: the iPad, this Mac, both on the same Wi-Fi, a USB-C (or Lightning) cable, Safari on the Mac.

## A. One-time setup

**On the Mac** (Terminal):

```sh
export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
cd "/Users/ibrahimi/Door & Floor Visualizer"
pnpm build
pnpm lan-https:cert
pnpm preview:lan
```

- `pnpm lan-https:cert` makes a private test certificate authority that can only vouch for this Mac's own name and address (name-constrained, valid 30 days), in the git-ignored `.lan-https/`. Service workers (offline saving) need HTTPS on the iPad.
- `pnpm preview:lan` prints two addresses, e.g. `https://Ibrahimis-MacBook-Air.local:4443/sq/` and `http://Ibrahimis-MacBook-Air.local:4080/porta-dev-ca.crt`. Keep it running. If macOS asks whether `node` may accept incoming connections, choose **Allow**.
- If the Mac's Wi-Fi address changed since the certificate was made, `pnpm lan-https:cert` makes a new one and says so; install it on the iPad again (A1–A3).

**On the iPad:**

1. Safari → open `http://Ibrahimis-MacBook-Air.local:4080/porta-dev-ca.crt` → "This website is trying to download a configuration profile" → **Allow** → Close.
2. Settings → **Profile Downloaded** (near the top) → Install → enter passcode → Install → Done.
3. Settings → General → About → **Certificate Trust Settings** → turn on "Porta Dysheme local test CA (…)" → Continue.
4. Settings → Apps → Safari → Advanced → turn on **Web Inspector**. (Older iPadOS: Settings → Safari → Advanced.)
5. Close every other Safari tab. Turn off Low Power Mode. Battery above 50 % or charging.
6. Note the model: Settings → General → About → **Model Name**, and **iPadOS Version**.

**On the Mac:** Safari → Settings → Advanced → turn on **Show features for web developers**. Connect the iPad with the cable; tap **Trust** on the iPad if asked.

## B. Run 1 — landscape, first visit (no offline pack)

1. Hold the iPad in **landscape**. In Safari open:
   `https://Ibrahimis-MacBook-Air.local:4443/sq/studio/?debug=1&baseline=1`
   The room appears, with a small box at the bottom left: **Baseline · idle · 0/46**. (If Safari says the connection is not private, step A3 was missed.)
2. Mac Safari → **Develop** menu → your iPad → the Studio page. Web Inspector opens.
3. Web Inspector → **Timelines** tab. If **Memory** is not in the list of instruments on the left, click **Edit** (bottom of the list) and tick Memory. Click the **record** button (●).
4. In Web Inspector press **⌘R** (reloads the page on the iPad, so the first load is recorded). Wait until the room image is sharp.
5. On the iPad tap **Run baseline**. Do not touch the iPad until the box says **Baseline · done · 46/46** (2–5 minutes). It opens every room, makes 20 room switches, 8 door-model switches, 9 floor switches and 2 direction switches by itself.
6. Click record again to **stop**. Click the **Memory** row. Note the highest value of the total memory (the peak in the memory graph / "Max Comparison"), and take a screenshot of that view (⇧⌘4).
7. Start a **new recording** (●). On the iPad tap **Timed offline save**. Wait for **Offline: ready** and the line "last ready in N s". Stop the recording and note its memory peak.
8. Tap **Copy results** and paste them into a note, or tap **Share results** → AirDrop to the Mac. (Copy run 1 **before** step C2.)

## C. Run 2 — portrait, with the offline pack saved

1. Turn the iPad to **portrait**.
2. In the box tap **Reset**.
3. Web Inspector: new recording (●) → **⌘R** → wait for the sharp room → tap **Run baseline** → wait for **done · 46/46** → stop recording → note the memory peak and take a screenshot.
4. **Copy results** / **Share results** again.

## D. If something goes wrong

- **The page reloads by itself, or Safari shows "A problem repeatedly occurred"**: that is the failure this test looks for. Note when it happened. On the reloaded page the box says **interrupted** and lists a "reload" row. Tap **Resume** to finish the run, then copy the results as usual.
- **A step hangs**: the runner gives up after 60 s and records a timeout; let it continue.
- **The box shows "Offline: unsupported"**: the page is not on HTTPS or the certificate is not trusted (A1–A3).

## E. Send back

1. Results text from run 1 and run 2 (Copy results).
2. Memory peaks: run 1, the offline save, run 2 (MB), plus the screenshots.
3. Offline save time and outcome (from the box).
4. iPad model name and iPadOS version.
5. Anything you saw: blank or frozen room, reloads, slow steps, heat.

## F. Afterwards

- Mac: stop the server with Ctrl-C.
- iPad: Settings → General → VPN & Device Management → the "Porta Dysheme local test CA" profile → **Remove Profile** (it stays valid for at most 30 days anyway).
