-- WGO draft — UNLISTED. draft = true means: live at its own URL, absent from
-- the homepage, /insights, ticker rails, related-articles and the sitemap, and
-- served noindex. Flip draft to false to publish.
INSERT INTO blog_posts
  (slug, title, kind, ticker, sector, topic, summary, body,
   "imagePrompt", "imageUrl", "imageAlt", category, eyebrow, draft,
   "iqsAtGeneration", tags, "featuredTickers", "inputSnapshot", "generatedAt", "updatedAt")
VALUES (
  $slug$editorial-white-gold-corp-wgo-yukon-team-2026-08-27$slug$,
  $t$Who Is Behind White Gold Corp's Yukon Gold Story?$t$,
  'editorial',
  'WGO',
  'Basic Materials',
  NULL,
  $sum$Agnico Eagle and Kinross each own 17.99%. An August PEA put a C$1.9B NPV on the project. The critical-minerals spin-out is approved but not yet effective.$sum$,
  $body$<h3>Key points</h3>
<ul>
<li><strong>Agnico Eagle and Kinross Gold each hold 17.99% of White Gold Corp (TSXV: WGO)</strong> — two senior producers, equal stakes, on the same junior's register.</li>
<li><strong>A maiden PEA published on August 10 put a C$1.9 billion after-tax NPV on the project</strong>, alongside a 38% IRR and a 1.7-year payback.</li>
<li><strong>The W2 Critical Minerals spin-out is approved by shareholders but not yet effective.</strong> Shares go out one-for-five on holdings immediately before the effective date, which has not been announced.</li>
</ul>

<p>White Gold Corp (TSXV: WGO) is a Yukon gold explorer with an unusual share register. Agnico Eagle Mines and Kinross Gold — two of the largest gold producers in the world — each own 17.99% of it. Those are the kind of positions a senior takes when it wants optionality on a district before that district is proven, and it is rare to see two of them sitting at the same weight on one junior.</p>

<p>On August 10 the company published its maiden Preliminary Economic Assessment: a C$1.9 billion after-tax net present value, a 38% internal rate of return, and a 1.7-year payback. A PEA is an early-stage study and carries the usual caveats about resource categories, capital estimates and permitting. Those are still not marginal numbers for a company at this stage of its life.</p>

<p>Which raises the question this article is actually about. Gold's move has lifted the whole Yukon exploration complex, and a rising metal price is available to every company in the territory. It does not explain why one of them ends up with two senior producers on its register and a PEA of that size. So: who is making the decisions?</p>

<h3>The team</h3>

<p>David D'Onofrio is Chief Executive Officer and a director. His background is corporate finance in natural resources rather than geology — he came out of the PowerOne group, a Canadian merchant banking and junior-resource investment firm that has been involved with White Gold since its inception. PowerOne's model is patient capital in mining, energy and technology, and the firm putting one of its own people into the chief executive's chair is a statement about how it reads the assets on this balance sheet.</p>

<p>The geology sits with two other people, and this is the part of the story that is genuinely hard to replicate. Shawn Ryan — the prospector whose Yukon staking work is the reason the White Gold district carries that name — is co-founder, Chief Technical Advisor and a director. Dylan Langille is VP Exploration; he was part of the core discovery team at the Great Bear project in Red Lake, Ontario, and stayed on to lead exploration there after Kinross acquired it. Hans Smit, a geologist with four decades in the field, joined as a technical advisor in May.</p>

<p>That is a finance chief executive with a discovery team behind him and a merchant bank underwriting the runway. It is a deliberate structure, not an accident of hiring.</p>

<h3>The spin-out, read carefully</h3>

<p>White Gold is moving six critical-mineral properties in west-central Yukon — Bridget, Loonie, Wolf, Hunker, Hayes and Toonie — into a subsidiary called W2 Critical Minerals Corp. The logic is straightforward: copper, molybdenum and tungsten assets sitting inside a gold explorer are worth close to nothing in that company's valuation, and worth something on their own.</p>

<p>Shareholders approved the reorganisation on August 11, with 46.12% of outstanding shares voted. The court hearing for the final order was set for August 13, and the transaction remains subject to final court and TSX Venture Exchange approval.</p>

<p>The distribution mechanism matters more than the vote. W2 shares are to be issued as a dividend-in-kind, one W2 share for every five WGO shares held <em>immediately prior to the effective date</em> — not as of the June 29 record date, which governed only who could vote at the meeting. On the company's own disclosed terms, the entitlement attaches at the effective date, and no effective date has been announced. Both the terms and the timing are the company's to change, so anyone weighing that should read the management information circular rather than this paragraph.</p>

<h3>The district</h3>

<p>The Yukon has drawn a concentration of exploration capital that would have been hard to imagine a decade ago, and White Gold sits in it alongside Snowline Gold, Sitka Gold, Banyan Gold and Western Copper &amp; Gold, with Stakeholder Gold drilling inside the White Gold district itself. Agnico Eagle and Kinross are both active in the territory in their own right, which is part of what makes their positions here worth noting.</p>

<p>One limit, stated plainly: White Gold trades on the TSX Venture Exchange and reports insider transactions to Canada's SEDI system, not to the SEC. Our own Form 4 record does not reach it, so nothing above is an insider-buying reading of this company — every figure comes from White Gold's own filings and press releases. What we can say about the ownership is what the company discloses about it.</p>

<p>What would change the picture is the final order. Watch for the effective-date announcement and the W2 listing, and for whether either senior shareholder adjusts its position once the critical-minerals assets leave the balance sheet.</p>

<p>You can audit the comparable US-listed picture yourself: today's actual open-market buying on <a href="/insiders/hot">Top Insider Scores</a>, the <a href="/screener">IQS Screener</a> for companies where insiders are buying with real conviction, and <a href="/sectors">sector-level insider flows</a> including materials and energy.</p>

<p><em>Not investment advice. White Gold Corp figures are summarized from the company's own public filings, press releases and management disclosure; White Gold reports insider transactions to SEDI and is not covered by our SEC Form 4 record.</em></p>$body$,
  NULL,
  '/editorial-thumbs/white-gold-donofrio-yukon.jpg',
  $alt$White Gold Corp CEO David D'Onofrio with a Yukon geological map$alt$,
  'SECTOR SPOTLIGHT',
  'SECTOR SPOTLIGHT',
  true,
  NULL,
  $tags$["WGO", "White Gold Corp", "Yukon", "gold", "critical minerals", "TSXV"]$tags$::jsonb,
  $ft$[]$ft$::jsonb,
  $snap${"source": "manual-editorial", "playbook": "v2", "state": "draft-for-review"}$snap$::jsonb,
  NOW(), NOW()
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  ticker = EXCLUDED.ticker,
  sector = EXCLUDED.sector,
  "imageUrl" = EXCLUDED."imageUrl",
  "imageAlt" = EXCLUDED."imageAlt",
  category = EXCLUDED.category,
  eyebrow = EXCLUDED.eyebrow,
  draft = EXCLUDED.draft,
  tags = EXCLUDED.tags,
  "featuredTickers" = EXCLUDED."featuredTickers",
  "inputSnapshot" = EXCLUDED."inputSnapshot",
  "updatedAt" = NOW();

SELECT slug, draft, category, length(body) AS body_chars, "imageUrl"
FROM blog_posts WHERE slug = $slug$editorial-white-gold-corp-wgo-yukon-team-2026-08-27$slug$;
