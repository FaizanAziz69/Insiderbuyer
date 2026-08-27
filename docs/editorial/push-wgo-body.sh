set -euo pipefail
cd /opt/insider/app/backend
getenv() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"; }
CONN="$(getenv DATABASE_URL)"
[ -z "$CONN" ] && CONN="postgresql://$(getenv DB_USER):$(getenv DB_PASSWORD)@$(getenv DB_HOST):$(getenv DB_PORT)/$(getenv DB_NAME)"
psql "$CONN" -v ON_ERROR_STOP=1 <<'SQLEOF'
UPDATE blog_posts SET
  body = $body$<h3>Key points</h3>
<ul>
<li><strong>Gold near US$4,650/oz sits above the US$4,500 upside case in White Gold's own PEA</strong>, built on a US$3,600 base.</li>
<li><strong>White Gold Corp (TSXV: WGO) is up roughly 340% over the past year</strong>, against +72% for junior gold miners and +34% for gold.</li>
<li><strong>Agnico Eagle owns 19% by the company's own disclosure</strong>, Kinross roughly 15%, and Eric Sprott reportedly about 46% fully diluted.</li>
</ul>

<p>Gold near US$4,650 an ounce lifts every explorer in the Yukon. It does not explain why one returned roughly 340% over the past year while junior gold miners returned 72% and gold 34%. Among Yukon peers over the same period, Banyan Gold is up about 228%, Snowline Gold about 96% and Sitka Gold about 40%.</p>

<p>The metal delivered a third of the move; sector beta doubled that. The rest is company-specific, and it has a date on it.</p>

<p>On August 10 White Gold published its maiden Preliminary Economic Assessment: a C$1,911 million after-tax NPV at a 5% discount rate, a 38% IRR and a 1.7-year payback, on a 9.4-year open pit averaging 188,000 ounces a year.</p>

<p>The assumption underneath matters more. The base case takes US$3,600 gold, the upside case US$4,500. Spot trades above that upside case, making a study published two and a half weeks ago already conservative.</p>

<p>North of 60 Mining News called it a robust Yukon mine; analyst consensus is a Strong Buy at an average target of C$5.18.</p>

<p>According to SEDI and SEC Form 4 filings reviewed by InsiderBuying.com, our platform holds no record of an open-market purchase of White Gold stock by an insider: the company reports to Canada's SEDI system, which we do not ingest. The ownership picture below comes from its disclosure, not our filing record.</p>

<p>Agnico Eagle owns 19% by White Gold's own disclosure. Kinross Gold, which sold the properties into the company at its 2016 formation, holds roughly 15%. Larger than either, Eric Sprott is reported to hold about 46% fully diluted. Published figures for the producers range 15%–19.9% by source and date, because every placement moves them.</p>

<p>David D'Onofrio is Chief Executive Officer and also CFO of PowerOne Capital Markets, the merchant bank he joined in 2009 and which has backed White Gold since inception. The geology sits with co-founder Shawn Ryan, the prospector the district is named for, and VP Exploration Dylan Langille, formerly of Great Bear.</p>

<div data-viz="sector-table" data-days="30" data-rows="6"></div>

<p>The table is the closest comparable our data supports: average Insider Score and cluster buying by sector among SEC filers, screenable with <a href="/premium">Premium</a>.</p>

<p>Two things cut the other way. Initial capital of C$1,050 million against a C$521 million market cap means the project cannot be built without substantial dilution, a partner, or both — the producers being obvious candidates. And a PEA is the earliest economic study, carrying inferred material with no demonstrated viability.</p>

<p>The critical-minerals spin-out is the near-term catalyst. Shareholders approved moving six Yukon properties into W2 Critical Minerals Corp on August 11; court and TSX Venture Exchange approval are outstanding. W2 shares go out one per five WGO shares held immediately prior to the effective date — not the June 29 record date, which governed only voting — and no effective date is announced.</p>

<p>Watch for that announcement, and how the C$1,050 million is funded. Track insider activity across the companies we do cover on <a href="/insiders/hot">Top Insider Scores</a> and the <a href="/screener">IQS Screener</a>.</p>

<p><em>Not investment advice. White Gold figures are drawn from the company's own filings and disclosure and from cited market data; it reports to SEDI and is not covered by our SEC Form 4 record.</em></p>$body$,
  "updatedAt" = NOW()
WHERE slug = 'editorial-white-gold-corp-wgo-yukon-team-2026-08-27';
SELECT slug, draft, sponsored, length(body) AS body_chars FROM blog_posts
 WHERE slug = 'editorial-white-gold-corp-wgo-yukon-team-2026-08-27';

SQLEOF
sudo rm -rf /var/cache/nginx/api/* /var/cache/nginx/html/* 2>/dev/null || true
echo 'caches flushed'
