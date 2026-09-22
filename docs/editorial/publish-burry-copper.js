/**
 * Publish the Michael Burry / Ero Copper top story.
 *
 * Body lives in burry-copper.html so the HTML is reviewable on its own; this
 * script only carries the row. Run it through the app's own node so the
 * credentials never leave the server:
 *
 *   ssh … 'cd /opt/insider/app/backend && node -' < publish-burry-copper.js
 *   (APPLY=1 to write; without it you get a dry run)
 */
const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config();

const BODY = process.env.BODY_B64
  ? Buffer.from(process.env.BODY_B64, 'base64').toString('utf8')
  : fs.readFileSync(__dirname + '/burry-copper.html', 'utf8');

const P = {
  slug: 'editorial-michael-burry-copper-ero-position-2026-09-22',
  title: 'Michael Burry Goes Long Copper With a New Stake in Ero Copper',
  sector: 'Basic Materials',
  ticker: 'ERO',
  featuredTickers: ['ERO', 'QXO', 'SFM', 'ZTS'],
  category: 'MARKET MOVER',
  summary:
    'The Big Short investor says he is ignoring the AI "woo-hoos" and has taken a mid-sized position in a Brazilian copper miner up more than 110% in a year. Form 4 filings reviewed by InsiderBuying.com show no insider has bought a share on the open market at any of his US-listed picks.',
  imageAlt: 'Michael Burry, who has disclosed a new position in copper miner Ero Copper',
  tags: ['michael-burry', 'copper', 'ero-copper', 'qxo', 'sprouts', 'zoetis', 'ai', 'insider-selling'],
  snapshot: {
    source: 'manual-editorial',
    tip: 'Client screenshot: @StockSavvyShay X post, 2026-09-21 3:43 PM, 155K views',
    disclosure: 'Michael Burry, Cassandra Unchained (Substack), disclosed 2026-09-21',
    dataChecked: 'ERO/QXO/SFM/ZTS Form 4 record + 1y prices, InsiderBuying feed 2026-09-22',
    playbook: 'v2',
  },
};

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  if (process.env.APPLY !== '1') {
    const cur = await c.query('select slug, draft, "generatedAt" from blog_posts where slug=$1', [P.slug]);
    console.log('DRY RUN. existing row:', JSON.stringify(cur.rows));
    console.log('body chars:', BODY.length, '| title:', P.title);
    await c.end();
    return;
  }
  await c.query(
    `INSERT INTO blog_posts
       (slug, title, kind, ticker, sector, topic, summary, body,
        "imagePrompt", "imageUrl", "imageAlt", category, eyebrow, draft, sponsored,
        "iqsAtGeneration", tags, "featuredTickers", "inputSnapshot", "generatedAt", "updatedAt")
     VALUES ($1,$2,'editorial',$3,$4,NULL,$5,$6,
             NULL,NULL,$7,$8,$8,false,false,
             NULL,$9::jsonb,$10::jsonb,$11::jsonb,NOW(),NOW())
     ON CONFLICT (slug) DO UPDATE SET
       title=EXCLUDED.title, summary=EXCLUDED.summary, body=EXCLUDED.body,
       ticker=EXCLUDED.ticker, sector=EXCLUDED.sector, "imageAlt"=EXCLUDED."imageAlt",
       eyebrow=EXCLUDED.eyebrow, category=EXCLUDED.category,
       draft=false, sponsored=false,
       tags=EXCLUDED.tags, "featuredTickers"=EXCLUDED."featuredTickers",
       "inputSnapshot"=EXCLUDED."inputSnapshot", "updatedAt"=NOW()`,
    [P.slug, P.title, P.ticker, P.sector, P.summary, BODY, P.imageAlt, P.category,
     JSON.stringify(P.tags), JSON.stringify(P.featuredTickers), JSON.stringify(P.snapshot)]);
  const r = await c.query(
    'select slug, draft, category, ticker, length(body) as body_chars, "generatedAt" from blog_posts where slug=$1',
    [P.slug]);
  console.log('APPLIED:', JSON.stringify(r.rows[0]));
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
