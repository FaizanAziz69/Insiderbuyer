// Advertorial content — 5 pages per "Site revisions.pdf" + George's commands.
// Each entry powers /advertorials/[slug] and is also referenced by AdSlot rotations.

export interface Advertorial {
  slug: string;
  eyebrow: string;
  headline: string;
  kicker: string;
  body: string[];
  bullets: string[];
  primaryTicker: string; // routes the opt-in CTA
  image: string;
}

export const ADVERTORIALS: Record<string, Advertorial> = {
  "this-time-is-different": {
    slug: "this-time-is-different",
    eyebrow: "Market commentary",
    headline: "This Time Is Different — Why The Coming Cycle Won't Look Like 2021",
    kicker:
      "Insiders are positioning for the next leg up before retail catches on. Here's what the Form 4 data is saying.",
    body: [
      "Every cycle has its sceptics, and every cycle the same phrase gets uttered: 'this time is different.' Most of the time it isn't. But the last twelve months of insider buying tell a story you won't see in the price charts — corporate executives are increasing personal stakes in their own companies at the highest rate since the 2009 bottom, with one important twist.",
      "It's not the names you'd expect. The cluster is forming across mid-cap industrials, regional banks with clean loan books, and small-cap energy operators that have already shed their high-yield debt. These aren't the meme stocks of the last cycle. They're the kind of unloved compounders that quietly mint long-term returns when the market rotates.",
      "What follows is our running list of the names where the insider conviction is loudest. We track these in real time on the IQS dashboard, but the headline names from the last 30 days are worth highlighting here.",
    ],
    bullets: [
      "Multi-insider buying across mid-cap industrials",
      "Regional bank insiders adding heavily in Q1 + Q2 2026",
      "Energy executives quietly raising their own stakes",
      "Mid-cap tech insiders selectively buying — not selling — into rallies",
    ],
    primaryTicker: "TOP5",
    image:
      "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&h=675&fit=crop&q=80",
  },
  "tech-insider": {
    slug: "tech-insider",
    eyebrow: "Tech sector",
    headline: "Tech Insider: Can The AI Rally Continue Into 2027?",
    kicker:
      "The semiconductor super-cycle, AI infrastructure spend, and the insider buys that suggest the rally still has legs.",
    body: [
      "Eighteen months into the AI boom, the conversation has shifted from 'is this real' to 'when does it end?' The honest answer: the people closest to the cap-ex cycle — the executives and board members of the chipmakers, hyperscalers, and AI-adjacent industrials — aren't behaving like the music is about to stop.",
      "We track every Form 4 buy and sell across the Russell 3000 in real time. The pattern in 2026 has been unmistakable: net buying among CTOs and operating heads at semiconductor designers, even as the share prices have run hard. That's not the behaviour of insiders who think the cycle has peaked.",
      "Equally telling is what the insiders are NOT doing. The classic top-of-cycle signature — heavy CEO selling, broad-based 10b5-1 plan acceleration, secondaries — has been notably absent. The insider data isn't a guarantee, but it's a strong contrarian filter against the bearish narrative.",
    ],
    bullets: [
      "CTO-level buying at chip designers in Q1+Q2 2026",
      "Hyperscaler insiders adding ahead of cap-ex announcements",
      "AI-adjacent industrials seeing director-level cluster buys",
      "Notable ABSENCE of the classic top-of-cycle insider selling pattern",
    ],
    primaryTicker: "NVDA",
    image:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&h=675&fit=crop&q=80",
  },
  "biotech-insider": {
    slug: "biotech-insider",
    eyebrow: "Biotech",
    headline: "Biotech Insider: The Three Small-Caps Where Executives Just Loaded Up",
    kicker:
      "Insider buying in early-stage biotech is rare. When it happens, it deserves attention.",
    body: [
      "Biotech executives almost never buy their own stock. Their compensation is heavily weighted toward equity grants, the dilution risk from secondaries is real, and clinical trial timing makes most insiders wary of the optics. So when several senior officers and board members at a small-cap biotech file Form 4 buys within days of each other, the signal cuts through the noise.",
      "In the last 90 days we've flagged three small-cap biotechs where the cluster-buy pattern has lit up the IQS scoring system. All three have upcoming Phase II or Phase III readouts in the next nine months. All three have insiders adding meaningful personal stakes — not the token $5,000 director buys, but six-figure positions from C-suite executives.",
      "We can't share the names here. But subscribers get them in their inbox the day the IQS score crosses our internal threshold.",
    ],
    bullets: [
      "Cluster buying at small-cap biotech in last 90 days",
      "Upcoming Phase II / Phase III readouts within 9 months",
      "Six-figure insider stakes — not symbolic director buys",
      "IQS scoring system flagged all three above our threshold",
    ],
    primaryTicker: "MRNA",
    image:
      "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=1200&h=675&fit=crop&q=80",
  },
  "gold-insider": {
    slug: "gold-insider",
    eyebrow: "Precious metals",
    headline: "Gold Insider: The Senior Miners Where Boards Are Buying Aggressively",
    kicker:
      "Gold at $2,300+ has been kind to the miners. But insiders are still adding — which is unusual at these levels.",
    body: [
      "Gold mining insiders typically sell into strength. The capital cycle in the metals industry is brutal, and most management teams treat strong spot prices as an opportunity to lighten personal positions or fund operational reinvestment. So the current pattern — net BUYING among senior officers and board members at the major gold producers — is genuinely unusual.",
      "Looking through the last 180 days of Form 4 filings, we count cluster-buy events at three of the top ten North American gold producers, plus elevated insider activity at a handful of mid-tier silver miners. That's a richer signal than the spot price chart suggests.",
      "Eric Sprott's own portfolio (which we replicate as a stock list on our site) has been adding to position sizes at several of these names. When one of the most respected precious-metals investors in the world is leaning into the same names insiders are buying, the convergence is worth noting.",
    ],
    bullets: [
      "Cluster buys at 3 of the top 10 North American gold majors",
      "Elevated insider activity at mid-tier silver producers",
      "Eric Sprott's portfolio increasing the same positions",
      "Pattern is unusual at $2,300+ spot — usually a selling level for insiders",
    ],
    primaryTicker: "KGC",
    image:
      "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1200&h=675&fit=crop&q=80",
  },
  "silver-insider": {
    slug: "silver-insider",
    eyebrow: "Precious metals",
    headline: "Silver Insider: The Industrial Demand Story Behind The 2026 Squeeze",
    kicker:
      "Silver is a hybrid — half precious metal, half industrial input. Insider buying at the industrial users is the read most investors miss.",
    body: [
      "Silver doesn't just respond to gold. Roughly half of global demand is industrial — solar panels, electronics, EV batteries, medical devices. So while precious-metals investors watch the spot chart, the smarter signal is sitting at the producers and processors who supply industrial buyers.",
      "Our IQS scoring system flagged a cluster of insider buys at silver-heavy polymetallic producers in Q2 2026, alongside coincident buying at a handful of silver-streaming companies. The pattern coincides with rising solar capacity announcements out of Asia and a notable narrowing of the supply / demand balance.",
      "If you only watch the precious-metals narrative, you'll miss the underlying industrial bid. Subscribers to the IQS feed see both sides at once.",
    ],
    bullets: [
      "Cluster insider buying at silver-heavy polymetallic producers",
      "Streaming-company executives adding personal stakes",
      "Solar capacity announcements out of Asia tightening physical balance",
      "Industrial demand half is the read most precious-metals investors miss",
    ],
    primaryTicker: "PAAS",
    image:
      "https://images.unsplash.com/photo-1554200876-56c2f25224fa?w=1200&h=675&fit=crop&q=80",
  },
};

export const ADVERTORIAL_LIST = Object.values(ADVERTORIALS);
