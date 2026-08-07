"use client";
/**
 * Site-wide capture popups (client revision items 4, 9, 10):
 *  - /premium → "New Member Offer" discount popup (captures the email AND
 *    starts the $150-credit email flow).
 *  - everywhere else → alternating one-per-visit popups: the Insider Alerts
 *    email opt-in (exact client copy, email only — no SMS) and the free
 *    Critical Metals Report.
 * Each popup shows at most once per browser (localStorage), never stacks,
 * and never shows to someone who already subscribed via any of them.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { OptInModal, OptInPromo } from "@/components/OptInModal";

const SEEN_KEY = "ib_popup_seen"; // JSON: { [id]: timestamp }
const SUBSCRIBED_KEY = "ib_popup_subscribed";

type PopupId = "new-member-offer" | "insider-alerts" | "critical-metals";

const PROMOS: Record<PopupId, { promo: OptInPromo; header: string; hidePhone: boolean }> = {
  "new-member-offer": {
    header: "New Member Offer",
    hidePhone: true,
    promo: {
      eyebrow: "New Member Offer",
      title: "Your $150 new-member credit is waiting",
      body: "Join today and we'll apply a $150 credit toward your first year of Insider Alerts — full rankings, real-time insider buy alerts, and every premium report. The credit expires soon.",
      note: "Enter your email to claim your credit.",
      cta: "Claim my $150 credit",
    },
  },
  "insider-alerts": {
    header: "Insider Alerts",
    hidePhone: true, // client spec: email opt-in, not SMS
    promo: {
      eyebrow: "Free Insider Alert",
      title: "One Small-Cap Stock That Insiders Won’t Stop Buying",
      body: "If a company’s CEO and CFO were buying shares of their stock, would you want to know?",
      note: "Enter your email below and we’ll send you the name — plus daily alerts when executives buy their own stock.",
      cta: "Send me the stock",
    },
  },
  "critical-metals": {
    header: "Free Resource",
    hidePhone: true,
    promo: {
      eyebrow: "Free Report",
      title: "The Critical Metals Report",
      body: "The mines, refiners and royalty plays positioned for the critical-minerals build-out — and where insiders are already buying. Free for subscribers.",
      note: "Enter your email below to get the free report.",
      cta: "Get the free report",
    },
  },
};

function readSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
  } catch {
    return {};
  }
}
function markSeen(id: string) {
  try {
    const seen = readSeen();
    seen[id] = Date.now();
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* storage unavailable */
  }
}

export function SitePopups() {
  const pathname = usePathname() || "/";
  const [active, setActive] = useState<PopupId | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      if (localStorage.getItem(SUBSCRIBED_KEY)) return;
    } catch {
      return;
    }
    const seen = readSeen();
    let pick: PopupId | null = null;
    if (pathname.startsWith("/premium")) {
      if (!seen["new-member-offer"]) pick = "new-member-offer";
    } else if (!pathname.startsWith("/login") && !pathname.startsWith("/score-explainer")) {
      // Alternate the two site-wide offers across visits.
      if (!seen["insider-alerts"]) pick = "insider-alerts";
      else if (!seen["critical-metals"]) pick = "critical-metals";
    }
    if (!pick) return;
    const t = setTimeout(() => {
      if (!cancelled) {
        setActive(pick);
        markSeen(pick!);
      }
    }, pathname.startsWith("/premium") ? 2500 : 9000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // Re-evaluate only on route change.
  }, [pathname]);

  if (!active) return null;
  const cfg = PROMOS[active];
  return (
    <OptInModal
      open
      onClose={() => setActive(null)}
      promo={cfg.promo}
      source={`popup-${active}`}
      hidePhone={cfg.hidePhone}
      headerLabel={cfg.header}
      onSubscribed={(email) => {
        try {
          localStorage.setItem(SUBSCRIBED_KEY, "1");
        } catch {
          /* ignore */
        }
        // The New Member Offer arms the $150-credit email flow.
        if (active === "new-member-offer") {
          fetch(`${API_BASE}/email-flows/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ flow: "discount", email }),
          }).catch(() => undefined);
        }
      }}
    />
  );
}
