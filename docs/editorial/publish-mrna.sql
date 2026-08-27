-- Editorial Playbook v2 §11, rewritten and fact-checked 2026-08-27.
-- Passes the §10 checklist (see docs/editorial-playbook-v2.md).
-- RUN THIS ONLY AFTER the deploy that adds blog_posts.category / .image_alt.
INSERT INTO blog_posts
  (slug, title, kind, ticker, sector, topic, summary, body,
   "imagePrompt", "imageUrl", "imageAlt", category, eyebrow,
   "iqsAtGeneration", tags, "featuredTickers", "inputSnapshot", "generatedAt", "updatedAt")
VALUES (
  $slug$editorial-moderna-insider-absence-cancer-vaccine-2026-08-27$slug$,
  $t$Moderna Nearly Tripled. No Insider Has Bought a Share.$t$,
  'editorial',
  $k$MRNA$k$,
  $s$Healthcare$s$,
  NULL,
  $sum$Moderna closed 177% higher on August 19. Form 4 filings show no open-market purchases at all — before the move or since.$sum$,
  $body$<h3>Key points</h3>
<ul>
<li><strong>Moderna (MRNA) closed at $174.38 on August 19</strong>, up 177% from the previous session's $62.96, after its Merck-partnered mRNA cancer vaccine cleared a key trial test.</li>
<li><strong>Not one insider has bought a share on the open market</strong> — before the move or since. Our Form 4 record for Moderna contains no open-market purchases at all.</li>
<li><strong>The company itself raised the money instead:</strong> on August 27 Moderna proposed a $2.0 billion private placement of convertible senior notes.</li>
</ul>

<p>Moderna (MRNA) delivered one of the largest single-session gains in its history on August 19, closing at $174.38 against $62.96 the day before. The move followed news that the personalised mRNA cancer vaccine it developed with Merck had cleared a key trial test. The stock has held most of it: after falling back the following session, it closed at $158.83 on August 25, and the shares are up 496% over the past year.</p>

<p>That is the part every outlet reported. The Wall Street Journal, Barron's and the wires all covered the trial result within hours, and Wolfe Research upgraded the stock on August 26 citing the same data. What none of them looked at is the filing record underneath it.</p>

<div data-viz="insider-timeline" data-ticker="MRNA" data-months="12"></div>

<p>According to SEC Form 4 filings reviewed by InsiderBuying.com, there are no open-market purchases of Moderna stock on record — not in the 30 days before August 19, and not in the days since. The only filings in the window belong to CEO Stéphane Bancel, and they run the other way: an option exercise on August 5 and a second on August 6, alongside four sales the same week totalling $28.7 million. An exercise-and-sale is compensation being converted to cash. It is not a decision to invest, and it carries no signal about what comes next.</p>

<div data-viz="pull-quote">Zero open-market purchases on file. The stock closed at $62.96 on August 18 and at $174.38 on August 19.</div>

<p>This does not make the move less real. It means the gain was driven entirely by the public market repricing disclosed clinical data — not foreshadowed by the kind of insider accumulation that often precedes an outsized move in the companies we track. The absence is the finding, and it cuts against the easy narrative that somebody always knows first.</p>

<p>The August 27 convertible note offering sharpens the point. Faced with a share price that had nearly tripled in a week, the company chose to raise $2.0 billion against it rather than watch its executives put personal money in at the new level. Analyst consensus on the stock currently sits at Hold.</p>

<p>The filings worth watching now are the ones that have not arrived. If Bancel or any board member files an open-market purchase in the $140–$175 range in the coming weeks, that is a forward signal from people who know what the rest of the pipeline looks like. If the next Form 4 is another exercise-and-sale, that is a signal too. Either way, the record is public and dated, which is more than can be said for most of what will be written about this stock this week.</p>

<p>Track real-time insider activity at Moderna (MRNA) and 9,000+ companies on our <a href="/companies/MRNA">Moderna filing page</a>, or see every scored company with <a href="/premium">Premium</a>.</p>$body$,
  NULL,
  $img$/editorial-thumbs/insiders-most-money.jpg$img$,
  $alt$Trading floor screens during a volatile session$alt$,
  $cat$MARKET MOVER$cat$,
  $cat$MARKET MOVER$cat$,
  NULL,
  $tags$["MRNA", "Moderna", "healthcare", "insider buying", "cancer vaccine"]$tags$::jsonb,
  $ft$["MRNA"]$ft$::jsonb,
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
FROM blog_posts WHERE slug = $slug$editorial-moderna-insider-absence-cancer-vaccine-2026-08-27$slug$;
