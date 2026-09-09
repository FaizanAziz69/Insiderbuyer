/**
 * press.insiderbuying.com — Brief v3 (2026-09-08) configuration.
 *
 * Everything on the B2B page that George owns as an OPEN ITEM (§8) lives here,
 * so it can be filled in without touching the page:
 *   - package figures marked `verified: false` render as "pending partner
 *     confirmation" placeholders and NEVER as numbers (§6: "Do not ship a
 *     claim we can't evidence");
 *   - outlets render on the logo wall only when `confirmed: true` (§4.2);
 *   - the sample report modal opens empty until SAMPLE_REPORT_URL is set;
 *   - testimonials render only with three or more real, permissioned quotes;
 *   - hero placement screenshots render only once client sign-off exists.
 */

export interface PackageStat {
  label: string;
  /** The value to print once verified. */
  value: string;
  /** false = placeholder copied from the reference; do not show the number. */
  verified: boolean;
}

export interface PressPackageConfig {
  key: "authority" | "ultimate";
  name: string;
  priceUsd: number;
  positioning: string;
  highlighted: boolean;
  stats: PackageStat[];
  /** What WE deliver on our own properties — every line here is inventory we
   *  control, so it needs no partner confirmation. */
  deliverables: string[];
  /** Feature checklist lines that are ours and already true. */
  features: string[];
}

export const PRESS_PACKAGES: PressPackageConfig[] = [
  {
    key: "authority",
    name: "Authority",
    priceUsd: 4700,
    positioning: "Best for SEO & Rankings",
    highlighted: false,
    stats: [
      { label: "Premium News Sites", value: "6", verified: false },
      { label: "Monthly Reach", value: "152.3m", verified: false },
      { label: "Max DA", value: "94", verified: false },
      { label: "Day Delivery", value: "5", verified: false },
    ],
    deliverables: [
      "Editorial-format article on InsiderBuying.com, edited by our desk",
      "Homepage Top Stories placement",
      "Listed on your ticker's company page and in the News & Analysis feed",
      "Syndication to partner news sites — the outlet list is shared before you approve",
      "Results report with live links and SEO data",
      "Published by the Sunday after you approve the copy",
    ],
    features: [
      "“As seen on” Badge",
      "AI Mention Potential",
      "Featured on InsiderBuying.com + emailed to 50,000+ investor subscribers",
    ],
  },
  {
    key: "ultimate",
    name: "Ultimate",
    priceUsd: 9700,
    positioning: "Best for Max Exposure",
    highlighted: true,
    stats: [
      { label: "News Sites", value: "400", verified: false },
      { label: "Monthly Reach", value: "172.6m", verified: false },
      { label: "Max DA", value: "94", verified: false },
      { label: "Day Delivery", value: "7", verified: false },
    ],
    deliverables: [
      "Editorial-format article on InsiderBuying.com, edited by our desk",
      "Homepage Top Stories placement — priority slot",
      "Listed on your ticker's company page and in the News & Analysis feed",
      "Syndication to partner news sites — the outlet list is shared before you approve",
      "Follow-up mention in the weekly insider-buying email",
      "Results report with live links and SEO data",
      "Published by the Sunday after you approve the copy",
    ],
    features: [
      "“As seen on” Badge",
      "Maximized AI Discovery",
      "Featured on InsiderBuying.com + emailed to 50,000+ investor subscribers + social amplification",
    ],
  },
];

export interface OutletConfig {
  name: string;
  /** §4.2: a logo appears ONLY if our network can genuinely place on that outlet. */
  confirmed: boolean;
  /** InsiderBuying.com gets visual prominence. */
  prominent?: boolean;
  /** Network stats strip (§2 row 4). Unverified → chip shows "pending". */
  domainAuthority: number | null;
  monthlyVisits: string | null;
  verified: boolean;
}

/** George named these five in §4.2; the remaining outlets come from the
 *  distribution partner contract. Set `confirmed: true` per outlet once the
 *  contract lists it. */
export const OUTLETS: OutletConfig[] = [
  { name: "InsiderBuying.com", confirmed: true, prominent: true, domainAuthority: null, monthlyVisits: null, verified: false },
  { name: "Business Insider", confirmed: false, domainAuthority: null, monthlyVisits: null, verified: false },
  { name: "AP News", confirmed: false, domainAuthority: null, monthlyVisits: null, verified: false },
  { name: "Yahoo Finance", confirmed: false, domainAuthority: null, monthlyVisits: null, verified: false },
  { name: "Barchart", confirmed: false, domainAuthority: null, monthlyVisits: null, verified: false },
];

/** Our own properties — where every package is guaranteed to run. They fill
 *  the GET SEEN ON wall until partner outlets are contracted (§4.2 rule: a
 *  logo appears only where we can genuinely place). */
export const OWNED_CHANNELS: { name: string; note: string }[] = [
  { name: "InsiderBuying.com", note: "Homepage Top Stories" },
  { name: "Insider Alerts", note: "investor email list" },
  { name: "News & Analysis", note: "editorial feed" },
  { name: "Company pages", note: "your ticker's page" },
  { name: "Social channels", note: "amplification" },
];

/** §7 sample report. Until a client-approved campaign PDF exists, the modal
 *  opens our own report page rendered from a REAL published editorial story
 *  (live links, real SEO data) — the same format every order receives. */
export const SAMPLE_REPORT_URL: string | null = "/press/sample-report";
export const SAMPLE_REPORT_SLUG = "editorial-lulu-burry-buy-under-100-2026-09-05";

/** Real, permissioned client quotes only (§7). Section hides below three. */
export const TESTIMONIALS: { quote: string; name: string; title: string; company: string }[] = [];

/** Hero collage (§2 row 2). Client campaign screenshots need sign-off (§8);
 *  until then the collage shows REAL placements on our own properties —
 *  captured from the live site 2026-09-09. Swap in client placements here. */
export const HERO_PLACEMENTS: { src: string; alt: string; caption: string }[] = [
  { src: "/press/placements/home-top-story-v2.webp", alt: "InsiderBuying.com homepage with the day's Top Story", caption: "Homepage · Top Stories" },
  { src: "/press/placements/article-burry-lulu-v2.webp", alt: "A published editorial article page on InsiderBuying.com", caption: "Editorial article page" },
  { src: "/press/placements/news-feed-v2.webp", alt: "The News & Analysis feed on InsiderBuying.com", caption: "News & Analysis feed" },
];

/** §5 approved copy — the audience figure is George's; see the subscribe-page
 *  canonical-stats item if it ever changes. */
export const AUDIENCE_LINE = "50,000+";

export const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendly.com/george-insiderbuying/30min";

/** The three agency tiers that used to sit on the press page (§7: move to /campaigns). */
export const CAMPAIGN_TIERS = [
  { name: "Essentials", price: "$4,889", kicker: "Press Release Distribution", body: "We transform your insider buying activity into professionally crafted press releases — distributed to the wire, emailed to our full subscriber list, and amplified across social media. This is not hype. This is signal amplification." },
  { name: "Conviction Campaign", price: "$14,889", kicker: "IR Campaigns", featured: true, body: "We build the funnel, write the copy, drive the traffic, and deliver qualified retail investors to your company's story. We measure everything. You see every dollar working." },
  { name: "Go Viral", price: "$48,889", kicker: "Editorial Features", body: "A published interview or editorial piece on InsiderBuying.com, distributed to our audience of investors who specifically follow what insiders are doing. Your story, in the right room." },
];

/** §2 row 10 — 8–10 questions incl. guarantee terms and disclosure policy. */
export const PRESS_FAQ: { q: string; a: string }[] = [
  { q: "What exactly do I get?", a: "Your press release published across our distribution network and on InsiderBuying.com itself, emailed to our investor subscribers, an “As seen on” badge for your site, and a report with live links and SEO data when the campaign is complete. The Ultimate package adds social amplification and the wider network." },
  { q: "How long does it take?", a: "Order today and your story is typically published by Sunday. Each package lists its delivery window; the clock starts when you approve the final copy." },
  { q: "Do I need to write the release?", a: "No. Submit your investor press kit, or switch on “write it for me” at intake and our editors draft it from your materials. You review and approve before anything is published." },
  { q: "Is the coverage labeled as paid?", a: "Yes. Published pieces are labeled as sponsored or paid distribution according to each outlet's rules and our own disclosure policy. We say so openly because the readers we serve expect it." },
  { q: "Does buying a package affect my company's Insider Score or ranking?", a: "Never. Paid placement has no effect on Insider Scores, Trade Grades or any editorial ranking on InsiderBuying.com. The scoring runs on SEC filings alone and the editorial desk is firewalled from the press desk." },
  { q: "What does the Money Back Guarantee cover?", a: "If we do not publish your approved release within the package's delivery window, you get a full refund. Terms, what qualifies and the refund window are written out on the guarantee page linked from every pricing card." },
  { q: "Who reads InsiderBuying.com?", a: "Investors, financial advisors and analysts who follow insider conviction — people who open an alert because a CEO just bought stock with their own money. Your story lands in that room, not in a generic news feed." },
  { q: "Can I see a sample report?", a: "Yes. Every pricing card and the hero have a View Sample Report button that opens a real report from a past campaign, with live links and SEO data." },
  { q: "What if I run a larger investor-relations program?", a: "Our agency campaigns start at $4,889 and run to full investor-acquisition programs. Book a discovery call from the enterprise section or see the campaign tiers page." },
  { q: "Which payment methods do you accept?", a: "Checkout is handled by Stripe: all major cards, Apple Pay and Google Pay. Every package is a one-time payment — no subscription." },
];
