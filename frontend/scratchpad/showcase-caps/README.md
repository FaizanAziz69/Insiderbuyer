# Showcase / benefit source captures

Kept here on purpose. These are the raw UI captures the Subscribe page's
visuals are composed from, and the previous set was LOST when a session
scratchpad was cleaned up — which meant every image had to be recaptured from
scratch (premium account, dark/light both, right columns, no toast, no cursor).
Don't delete them.

    light/            showcase sources, light theme
    dark/             showcase sources, dark theme
    benefits-light/   "What's included" card sources, light theme
    benefits-dark/    "What's included" card sources, dark theme

Rebuild the showcase visuals:

    node scripts/showcase-compose.mjs scratchpad/showcase-caps/light
    node scripts/showcase-compose.mjs scratchpad/showcase-caps/dark dark

The benefit thumbnails are cropped straight from benefits-*/ into
public/sales/benefits (see BENEFITS in app/premium/PageClient.tsx); bump
BENEFIT_SHOT_V there whenever one is replaced.

Capture notes that cost time:
  * Log in as a PREMIUM account or every score shows the 56.0 decoy.
  * `window.scrollTo` is ignored on these pages — scroll with real wheel events.
  * Hide the fixed "LIVE Insider Bought" toast before capturing.
  * Park the mouse off-frame; the cursor lands in the capture otherwise.
  * Dark theme: set `data-theme="dark"` on <html>; localStorage alone doesn't
    take effect on an already-rendered page.
