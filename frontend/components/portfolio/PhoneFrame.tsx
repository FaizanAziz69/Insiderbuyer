"use client";

import { useEffect, useState } from "react";
import { MOCKUP_CSS, retina, themed } from "@/components/premium/MockupLightbox";

/**
 * The SMS-alert phone mockup on the portfolio upsell — the SAME device frame
 * and the SAME light/dark retina captures as the subscribe page's phone slot
 * (`/sales/mockups/alert-phone[-dark][@2x].jpg`, `mk-phone` frame from
 * MockupLightbox). Client 2026-08-29: "exactly same as we have in subscribe
 * page", and the capture must follow the theme like it does there.
 *
 * Before this it was a hand-built CSS phone with the four brief SMS strings
 * typed into bubbles — a different look from the sales page.
 */
const SRC = "/sales/mockups/alert-phone.jpg";

/** Live site theme — mirrors `useSiteTheme` on the subscribe page. */
function useSiteTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const read = () =>
      setTheme(
        document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
      );
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

export function PhoneFrame() {
  const theme = useSiteTheme();
  const src = themed(SRC, theme);
  return (
    <div className="pf-wrap">
      <div className={`mk-phone mk-${theme}`}>
        <div className="mk-phone-notch" aria-hidden="true" />
        <div className="mk-phone-screen">
          <img
            src={src}
            srcSet={`${src} 1x, ${retina(src)} 2x`}
            alt="Three IQS insider-buy alerts arriving as text messages on a phone"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
      <p className="pf-caption">Example alerts. Delivered by SMS to subscribers.</p>
      <style>{MOCKUP_CSS + CSS}</style>
    </div>
  );
}

const CSS = `
.pf-wrap { display: flex; flex-direction: column; align-items: center; }
.pf-caption { font-size: 11.5px; color: var(--text-mute); margin-top: 14px; text-align: center; }
`;
