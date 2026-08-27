-- Editorial Playbook v2 §11, rewritten and fact-checked 2026-08-27.
-- Passes the §10 checklist (see docs/editorial-playbook-v2.md).
-- RUN THIS ONLY AFTER the deploy that adds blog_posts.category / .image_alt.
INSERT INTO blog_posts
  (slug, title, kind, ticker, sector, topic, summary, body,
   "imagePrompt", "imageUrl", "imageAlt", category, eyebrow,
   "iqsAtGeneration", tags, "featuredTickers", "inputSnapshot", "generatedAt", "updatedAt")
VALUES (
  $slug$editorial-resource-insiders-buying-trade-war-2026-08-27$slug$,
  $t$Canada's Trade War Escalated. Resource Insiders Kept Buying.$t$,
  'editorial',
  $k$AMR$k$,
  $s$Energy$s$,
  NULL,
  $sum$US-Canada trade talks collapsed in the week of August 22. Form 4 filings show $46M of resource-sector insider buying through it.$sum$,
  $body$<h3>Key points</h3>
<ul>
<li><strong>US-Canada trade talks collapsed in the week of August 22</strong>, with the BBC and Politico both reporting an escalation rather than a settlement.</li>
<li><strong>Resource-sector insiders kept buying through it.</strong> Form 4 filings show more than $46 million of open-market purchases across six energy and mining names between August 13 and August 26.</li>
<li><strong>One director bought into a rising price 11 times in five sessions</strong>, paying more each day rather than waiting for a pullback.</li>
</ul>

<p>Canadian Prime Minister Mark Carney and US President Donald Trump spent the week of August 22 moving further apart, not closer together. Trade negotiations broke down, Canada's premiers publicly backed Carney's position, and the BBC reported Trump reframing the dispute around Canada's status altogether. Politico described a trade war escalating. Resource equities are the most exposed corner of the market to that dispute, because they sell physical commodities across the border.</p>

<p>So the question worth asking is not what the headlines say. It is what the people running those companies did with their own money while the headlines were being written.</p>

<div data-viz="tx-compare" data-ticker="AMR" data-days="30"></div>

<p>According to SEC Form 4 filings reviewed by InsiderBuying.com, the answer is that they bought. Kelcy Warren, a director of Energy Transfer (ET), bought 1,000,000 units for $21.3 million across August 18 and 19. Tor Olav Troim, a director of Borr Drilling (BORR), bought 2.2 million shares for $9.1 million between August 13 and August 25. John Raymond, a director of NGL Energy Partners, added $5.5 million between August 21 and August 25.</p>

<p>The most striking pattern is at Alpha Metallurgical Resources (AMR), a metallurgical coal producer. Director Kenneth Courtis filed 11 separate open-market purchases across five sessions from August 20, buying 35,000 shares for $7.1 million. He paid $189.84 on the first day and $216.97 on the last. Fellow director Michael Gorzynski bought $2.1 million on August 21, making it a two-buyer cluster of $9.2 million.</p>

<p>Buying into a price that rises under you is the opposite of bargain hunting. It is what conviction looks like in a filing.</p>

<div data-viz="sector-table" data-days="30"></div>

<p>One Canadian name appears directly. At i-80 Gold (IAUX), a British Columbia-incorporated gold producer, President and CEO Richard Young bought 1,000,000 shares at $1.62 on August 18, and EVP and General Counsel David Savarie filed alongside him the same day.</p>

<p>An honest limit on all of this: we track SEC Form 4 filings, not Canada's SEDI system. Every name above is a US-listed filer. Companies that report only to Canadian regulators sit outside our record, so nothing here should be read as a measurement of TSX-listed insider behaviour — it is a measurement of the resource names that file with the SEC.</p>

<p>What would change the picture is a reversal in the same filings. If these directors start selling into the next leg of the dispute, the conviction reading breaks. Watch the metallurgical coal and midstream names first, since that is where the buying has been concentrated.</p>

<p>Track real-time insider activity at <a href="/companies/AMR">Alpha Metallurgical Resources (AMR)</a> and 9,000+ companies, or screen every scored resource name with <a href="/premium">Premium</a>.</p>$body$,
  NULL,
  NULL,
  $alt$Open-pit mining operation at a North American metallurgical coal site$alt$,
  $cat$SECTOR SPOTLIGHT$cat$,
  $cat$SECTOR SPOTLIGHT$cat$,
  NULL,
  $tags$["AMR", "ET", "BORR", "IAUX", "energy", "materials", "insider buying"]$tags$::jsonb,
  $ft$["AMR", "ET", "BORR"]$ft$::jsonb,
  $snap${"source": "manual-editorial", "playbook": "v2", "checklist": "clean"}$snap$::jsonb,
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
  tags = EXCLUDED.tags,
  "featuredTickers" = EXCLUDED."featuredTickers",
  "inputSnapshot" = EXCLUDED."inputSnapshot",
  "updatedAt" = NOW();

SELECT slug, category, left(title, 60) AS title, length(body) AS body_chars
FROM blog_posts WHERE slug = $slug$editorial-resource-insiders-buying-trade-war-2026-08-27$slug$;
