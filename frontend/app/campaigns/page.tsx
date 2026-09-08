import Link from "next/link";
import { CALENDLY_URL, CAMPAIGN_TIERS } from "@/lib/press-config";

/** Brief v3 §7: "The three current agency tiers move to a linked /campaigns
 *  subpage rather than dying." Same three tiers and copy as the old press page. */
export default function CampaignsPage() {
  return (
    <main className="b2b3 b2b3-doc">
      <div className="b2b3-wrap" style={{ maxWidth: 1100, margin: "0 auto" }}>
        <p className="b2b3-kicker">InsiderBuying.com · Agency</p>
        <h1 className="camp-h1">Investor-acquisition campaigns.</h1>
        <p className="camp-lead">
          For companies running a full investor-relations program: press distribution, funnel and traffic,
          and sponsored editorial — built and measured by our team. Every campaign starts with a discovery call.
        </p>
        <div className="camp-grid">
          {CAMPAIGN_TIERS.map((t) => (
            <article key={t.name} className={`camp-card${t.featured ? " camp-card-hot" : ""}`}>
              <p className="camp-kicker">{t.kicker}</p>
              <h2>{t.name}</h2>
              <p className="camp-price">From {t.price}</p>
              <p className="camp-body">{t.body}</p>
              <a href="#book" className="camp-btn">Book a Discovery Call</a>
            </article>
          ))}
        </div>
        <section id="book" className="camp-book">
          <h2>Book a Discovery Call</h2>
          <div className="camp-cal">
            <iframe src={CALENDLY_URL} title="Book a discovery call" width="100%" height="700" frameBorder="0" />
          </div>
          <p className="camp-foot">
            Looking for a single press release with instant checkout?{" "}
            <Link href="/press#pricing">See the self-serve packages →</Link>
          </p>
        </section>
      </div>
      <style>{CSS}</style>
    </main>
  );
}

const CSS = `
.b2b3-doc { min-height: 100vh; background: #F7F9FC; color: #0A1E3C; font-family: var(--b2b-body), system-ui, sans-serif; padding: 56px 20px 80px; }
.b2b3-kicker { font-family: var(--b2b-mono), monospace; font-size: 12px; letter-spacing: 1.6px; text-transform: uppercase; color: #C9A227; font-weight: 600; margin: 0 0 10px; }
.camp-h1 { font-family: var(--b2b-display), sans-serif; font-weight: 800; font-size: clamp(30px, 4vw, 44px); letter-spacing: -0.6px; margin: 0 0 10px; }
.camp-lead { font-size: 17px; line-height: 1.6; color: #2B3A4F; max-width: 720px; margin: 0 0 32px; }
.camp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.camp-card { background: #fff; border: 1px solid #E3E8F0; border-radius: 16px; padding: 26px 24px; display: flex; flex-direction: column; }
.camp-card-hot { background: #0A1E3C; color: #fff; border-color: #0A1E3C; }
.camp-card-hot .camp-kicker { color: #C9A227; } .camp-card-hot .camp-body { color: #C8D3E3; } .camp-card-hot h2 { color: #fff; }
.camp-kicker { font-family: var(--b2b-mono), monospace; font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; color: #5C6B7F; margin: 0 0 8px; }
.camp-card h2 { font-family: var(--b2b-display), sans-serif; font-size: 22px; font-weight: 800; margin: 0 0 6px; color: #0A1E3C; }
.camp-price { font-family: var(--b2b-mono), monospace; font-size: 15px; font-weight: 600; color: #0E9F6E; margin: 0 0 12px; }
.camp-body { font-size: 14.5px; line-height: 1.6; color: #2B3A4F; margin: 0 0 18px; flex: 1; }
.camp-btn { display: inline-block; text-align: center; background: #C9A227; color: #0A1E3C; font-weight: 800; padding: 12px 18px; border-radius: 10px; text-decoration: none; }
.camp-book { margin-top: 56px; }
.camp-book h2 { font-family: var(--b2b-display), sans-serif; font-size: 28px; font-weight: 800; margin: 0 0 16px; }
.camp-cal { border: 1px solid #E3E8F0; border-radius: 14px; overflow: hidden; background: #fff; }
.camp-cal iframe { display: block; border: 0; }
.camp-foot { margin-top: 18px; font-size: 14px; color: #2B3A4F; } .camp-foot a { color: #0E9F6E; font-weight: 700; text-decoration: none; }
@media (max-width: 900px) { .camp-grid { grid-template-columns: 1fr; } }
`;
