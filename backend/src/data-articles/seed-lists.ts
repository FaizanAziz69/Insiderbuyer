/**
 * List articles — George, 2026-09-23.
 *
 *   "New data article based on this [a 52-week-lows table] … The entire
 *    article is this visual plus a simple breakdown via List style, including
 *    stock charts and financial snapshots for each. Insider score. Analyst
 *    rating and upside etc. Bullish and bearish notes."
 *   "Then we can do the same for hit 52 week highs."
 *   Plus: top insider buys of 2026, top performing hedge funds, top performing
 *   analysts, top ranked stocks by analyst targets, best performing IPOs.
 *
 * Two of those — top performing analysts and top performing hedge funds —
 * already shipped as data articles in the launch set, so they are not repeated
 * here; they inherit the new per-stock template through the same view.
 *
 * Copy stays neutral and factual (George's standing rule; brief §2.4: no
 * projections, no "follow these picks" language). Every figure in the body is
 * a {{placeholder}} filled from the live payload, so the prose cannot go stale
 * between refreshes.
 */

import type { ArticleSeed } from './seed';

const CTA_BODY =
  'Premium members see the full ranked table beyond the names shown here, the Insider Score behind every row, and an alert when a new open-market buy is filed in a company they follow.';

export const LIST_ARTICLES: ArticleSeed[] = [
  {
    slug: 'stocks-at-52-week-lows',
    headline: 'These stocks just hit 52-week lows',
    dek: 'Large and mid-cap companies trading within touching distance of their lowest price in a year, ranked by their year-to-date fall — with the insider, analyst and balance-sheet picture for each one.',
    category: 'Market Screens',
    refresh: 'weekly',
    chart: 'market-lows',
    periods: ['30d'],
    sections: {
      takeaways: [
        '{{matched}} companies above $2bn are trading within 3% of their 52-week low.',
        '{{top1.ticker}} leads the fall at {{top1.ytd}} year to date, last traded at {{top1.price}} against a 52-week low of {{top1.yearLow}}.',
        'The screen runs across {{universe}} listed companies — not only the ones whose insiders file.',
        'A new low is a fact about price. Whether it is an opportunity is what the breakdown below is for.',
      ],
      body: [
        {
          heading: 'What this screen looks at',
          html: '<p>Every NYSE, NASDAQ and AMEX-listed company above $2&nbsp;billion in market value, checked against its own highest and lowest print of the last year. A company qualifies when its last price sits within 3% of that 52-week low. The table is then ordered by the year-to-date move, which is the column shown on each bar.</p>',
        },
        {
          heading: 'Why a 52-week low is worth a second look',
          html: '<p>A one-year low is the cleanest evidence that the market has changed its mind about a company. It says nothing about whether the market is right. Two businesses can hit the same low for opposite reasons — one because earnings genuinely fell apart, one because a sector rotated out of favour — and the only way to tell them apart is to look at what each company is actually doing.</p>',
        },
        {
          heading: 'The breakdown below each name',
          html: '<p>For every company on the list you get a one-year price chart, a snapshot of revenue, earnings, cash flow and debt from the latest filed period, our Insider Score, the published analyst targets and the upside those imply, and a short bull and bear case. Each line in those cases is generated from a figure we hold and carries the source of that figure — none of it is written prose.</p>',
        },
        {
          heading: 'What insiders do at the lows matters more than usual',
          html: '<p>Officers and directors buying their own stock while it makes new lows are doing the one thing that costs them money to be wrong about. Where the breakdown shows open-market purchases, it shows who bought, how much, and whether the current price is above or below what they paid. Where it shows none, it says so — an absence of buying is not a sale, and we do not dress it up as one.</p>',
        },
        {
          heading: 'How to read the analyst column',
          html: '<p>The upside figure compares the average published target over the last 180 days with the last close. Targets are opinions with dates on them; they lag price badly on the way down, which is exactly why a stock at a 52-week low often shows a large apparent upside. Treat a big number as a question, not an answer.</p>',
        },
        {
          heading: 'What this page does not do',
          html: '<p>It does not rank these companies as buys, and it does not screen out businesses in genuine trouble — some of the names here deserve to be where they are. It also cannot see anything filed after the refresh below. This is a starting list, not a conclusion.</p>',
        },
        {
          heading: 'How often this updates',
          html: '<p>The screen is rebuilt every Friday after the close, and the &ldquo;Updated&rdquo; date at the top of this page is the timestamp of that rebuild. The companion list of <a href="/data/stocks-at-52-week-highs">stocks at 52-week highs</a> is built the same way, from the same universe, on the same schedule.</p>',
        },
      ],
      pullQuote: {
        text: 'A 52-week low tells you what the market thinks. What the people running the company do next tells you whether the market is right.',
        attribution: 'InsiderBuying.com editorial standard',
      },
      whatItMeans: [
        { audience: 'Long-term investors', text: 'Start with the balance-sheet lines in each breakdown. A company with positive free cash flow at a 52-week low is a different proposition from one losing money with net debt above half its market value.' },
        { audience: 'Active traders', text: 'The distance from the 52-week low and the year-to-date move are both shown per name, so you can separate a stock that just broke down from one that has been falling all year.' },
        { audience: 'Researchers and journalists', text: 'Every number traces to a source named in the breakdown — Form 4 filings, published analyst targets, or company filings with the period end stated.' },
      ],
      cta: { headline: 'See the insider picture behind every name', body: CTA_BODY },
    },
  },
  {
    slug: 'stocks-at-52-week-highs',
    headline: 'These stocks just hit 52-week highs',
    dek: 'The large and mid-cap companies trading at the top of their one-year range, ranked by year-to-date gain — with the insider, analyst and balance-sheet picture for each one.',
    category: 'Market Screens',
    refresh: 'weekly',
    chart: 'market-highs',
    periods: ['30d'],
    sections: {
      takeaways: [
        '{{matched}} companies above $2bn are trading within 3% of their 52-week high.',
        '{{top1.ticker}} leads at {{top1.ytd}} year to date, last traded at {{top1.price}} against a 52-week high of {{top1.yearHigh}}.',
        'The screen runs across {{universe}} listed companies, screened on price alone before any of our own scoring is applied.',
        'Strength is not a recommendation. The breakdown below shows what is behind each move.',
      ],
      body: [
        {
          heading: 'What this screen looks at',
          html: '<p>The same universe as the <a href="/data/stocks-at-52-week-lows">52-week lows</a> screen — every NYSE, NASDAQ and AMEX company above $2&nbsp;billion — filtered to those whose last price is within 3% of their highest print of the year, then ordered by the year-to-date move.</p>',
        },
        {
          heading: 'Why highs are harder to read than lows',
          html: '<p>A stock at a one-year high has already rewarded everyone who owned it. The useful question is no longer &ldquo;is this cheap&rdquo; but &ldquo;is the business doing something that justifies the re-rating, and are the people who know it best still buying?&rdquo; The breakdown under each name is there to answer the second half of that.</p>',
        },
        {
          heading: 'Insider buying at a high is a stronger statement',
          html: '<p>Insiders buy far more often after a fall than after a rise — purchases into strength are rarer and, by definition, made at prices the buyer could have paid less for months earlier. Where the breakdown shows open-market purchases on a name in this list, it is worth reading who made them.</p>',
        },
        {
          heading: 'Where the analyst column tends to sit',
          html: '<p>Expect small or negative upside on many of these names: targets follow price upward with a lag, so a stock at a high frequently trades above the published consensus. That is information about the analysts as much as about the company.</p>',
        },
        {
          heading: 'What this page does not do',
          html: '<p>It does not identify momentum that will continue, and a company can appear here on a single strong session. Nothing on this page is a recommendation to buy at these levels.</p>',
        },
        {
          heading: 'How often this updates',
          html: '<p>Rebuilt every Friday after the close, from the same universe refresh as the lows screen.</p>',
        },
      ],
      pullQuote: {
        text: 'Anyone can buy a stock after it has gone up. The people worth watching are the ones who buy their own at a high.',
        attribution: 'InsiderBuying.com editorial standard',
      },
      whatItMeans: [
        { audience: 'Long-term investors', text: 'Check whether the financial snapshot has moved with the price. A high on improving cash flow is a different signal from a high on multiple expansion alone.' },
        { audience: 'Active traders', text: 'The year-to-date column separates names that have run all year from ones that just broke out.' },
        { audience: 'Researchers and journalists', text: 'The universe and the 3% threshold are both stated on the page, so the screen is reproducible.' },
      ],
      cta: { headline: 'See who is still buying at the highs', body: CTA_BODY },
    },
  },
  {
    slug: 'top-insider-buys-2026',
    headline: 'The top insider buys of 2026',
    dek: 'Where company officers and directors have spent the most of their own money on open-market purchases this year, rebuilt every week from SEC Form 4 filings.',
    category: 'Insider Buying',
    refresh: 'weekly',
    chart: 'insider-buys-ytd',
    periods: ['30d'],
    sections: {
      takeaways: [
        'Insiders have disclosed {{total}} of open-market purchases across {{companies}} companies so far this year.',
        '{{top1.ticker}} leads at {{top1.value}}, with {{top1.insiders}} insider(s) buying at an average of {{top1.avgPrice}}.',
        'The names shown account for {{top15Share}} of all disclosed open-market buying this year.',
        'Year to date, not a rolling window — the list only resets when the year does.',
      ],
      body: [
        {
          heading: 'What counts as an insider buy here',
          html: '<p>SEC Form 4 transaction code <b>P</b> only: an open-market purchase the insider paid for. Purchases under a pre-arranged 10b5-1 plan, option exercises, stock awards and dividend reinvestments are all excluded, because none of them involves choosing to buy at today&rsquo;s price.</p>',
        },
        {
          heading: 'Why the calendar year',
          html: '<p>Rolling 30- and 90-day windows answer &ldquo;what is happening now&rdquo;, and we publish those separately. This page answers a different question — where the year&rsquo;s conviction has actually gone — and a company that made one enormous purchase in February stays on it.</p>',
        },
        {
          heading: 'The leader: {{top1.name}}',
          html: '<p>{{top1.ticker}} tops the year at {{top1.value}} across {{top1.trades}} filings from {{top1.insiders}} insider(s), at a volume-weighted average of {{top1.avgPrice}}. The breakdown below carries the full picture for the name, including where the price sits against what those insiders paid.</p>',
        },
        {
          heading: 'Size is not the same as signal',
          html: '<p>The largest dollar figures tend to come from the largest companies and the wealthiest executives. A $50&nbsp;million purchase by a founder can be a smaller personal commitment than a $200,000 purchase by a division head. Our Insider Score, shown per name in the breakdown, is the attempt to weigh that; the ranking on this page is deliberately the raw number.</p>',
        },
        {
          heading: 'What the list does not show',
          html: '<p>It does not net off sales, so a company can appear here while other insiders sell. It also depends on what has been filed — Form 4s are due within two business days, so the most recent week is always the least complete.</p>',
        },
        {
          heading: 'How often this updates',
          html: '<p>Rebuilt every Friday after the close.</p>',
        },
      ],
      pullQuote: {
        text: 'Insiders sell for many reasons. They buy on the open market for one.',
        attribution: 'InsiderBuying.com editorial standard',
      },
      whatItMeans: [
        { audience: 'Long-term investors', text: 'A company that holds its place on this list across several refreshes is showing sustained buying, not a single filing.' },
        { audience: 'Active traders', text: 'Compare the average insider price in each breakdown with the current price before assuming the move is still ahead.' },
        { audience: 'Researchers and journalists', text: 'Every row traces to public Form 4 filings; the company page lists each one with its SEC link.' },
      ],
      cta: { headline: 'See the score behind every buy', body: CTA_BODY },
    },
  },
  {
    slug: 'top-ranked-stocks-analyst-targets',
    headline: 'Top ranked stocks by analyst price targets',
    dek: 'The companies where Wall Street&rsquo;s published price targets sit furthest above the current price, filtered to names with real analyst coverage and refreshed every week.',
    category: 'Analyst Ratings',
    refresh: 'weekly',
    chart: 'analyst-targets',
    periods: ['30d'],
    sections: {
      takeaways: [
        '{{matched}} companies carry at least {{minAnalysts}} published targets from the last {{windowDays}} days that sit above the current price.',
        '{{top1.ticker}} shows the largest gap: {{top1.upside}} to an average target of {{top1.target}} from {{top1.analysts}} analysts.',
        'Coverage floor applied — a single analyst&rsquo;s target is not a consensus.',
        'A price target is an opinion with a date on it, not a forecast this site endorses.',
      ],
      body: [
        {
          heading: 'How the ranking is built',
          html: '<p>Every published price target from the last 180 days is averaged per company. A company needs at least four analysts in that window to appear, which removes the thinly covered names where one outlying target would otherwise dominate the list. The ranking is the gap between that average and the last close, as a percentage.</p>',
        },
        {
          heading: 'Why the biggest upside is rarely the best idea',
          html: '<p>Targets lag price. When a stock falls hard, the published targets stay where they were until each analyst gets round to revising, so the apparent upside widens precisely when confidence in the company is lowest. The largest numbers on this page are often stocks the market has already rejected — which is why the breakdown below each name shows the price chart and the balance sheet, not just the target.</p>',
        },
        {
          heading: 'Where insiders agree and disagree',
          html: '<p>The most interesting rows are the ones where the analyst view and the insider view point the same way: a wide gap to consensus <i>and</i> officers buying on the open market. The breakdown shows both, so the two can be read against each other rather than in isolation.</p>',
        },
        {
          heading: 'What the range tells you',
          html: '<p>Each breakdown carries the highest and lowest target as well as the average. A tight range means analysts broadly agree; a wide one means they do not, and the average is hiding a real argument about the company.</p>',
        },
        {
          heading: 'How often this updates',
          html: '<p>Rebuilt every Friday after the close, from targets published in the preceding 180 days.</p>',
        },
      ],
      pullQuote: {
        text: 'A price target tells you what one analyst was willing to publish on one day. It is a data point about the analyst as much as about the company.',
        attribution: 'InsiderBuying.com editorial standard',
      },
      whatItMeans: [
        { audience: 'Long-term investors', text: 'Use the target range, not the average. Disagreement among analysts is usually more informative than the midpoint of their views.' },
        { audience: 'Active traders', text: 'Check the date of the most recent target in each breakdown; a consensus built on stale targets describes a price that no longer exists.' },
        { audience: 'Researchers and journalists', text: 'The firms behind each consensus are named in the breakdown, with the count and the window stated.' },
      ],
      cta: { headline: 'See where insiders agree with the street', body: CTA_BODY },
    },
  },
  {
    slug: 'best-performing-ipos-2026',
    headline: 'The best performing IPOs of 2026',
    dek: 'Every company that listed this year, ranked by its return from the offer price — with the financial, insider and analyst picture behind each debut.',
    category: 'IPOs',
    refresh: 'weekly',
    chart: 'ipos-ytd',
    periods: ['30d'],
    sections: {
      takeaways: [
        '{{listings}} companies have listed this year with a published offer price.',
        '{{aboveOfferPct}} of them trade above that offer price today.',
        '{{top1.ticker}} leads at {{top1.return}}, listed {{top1.listed}} at {{top1.ipoPrice}} and last traded at {{top1.price}}.',
        'Return is measured from the offer price — a price most investors could not buy at.',
      ],
      body: [
        {
          heading: 'What "return from the offer price" means',
          html: '<p>The offer price is what the underwriters priced the deal at the night before trading. Allocations at that price go to institutions and to the bank&rsquo;s clients. Most people bought at the first public print, which is frequently well above it — so the figures on this page are the best case, not the typical one.</p>',
        },
        {
          heading: 'Why the first year matters',
          html: '<p>A newly listed company has no long trading history, limited analyst coverage and, usually, no insider buying at all — officers and directors are typically locked up for six months and hold shares they were granted rather than bought. That is why several breakdowns on this page will show no Form 4 purchases; it is a feature of the lock-up, not a verdict.</p>',
        },
        {
          heading: 'What to look for in the breakdown',
          html: '<p>With no insider history and thin coverage, the financial snapshot does most of the work here: revenue, whether the company earns anything, and what the cash position looks like. A debut that has doubled on no revenue is a different object from one that has doubled on growing free cash flow.</p>',
        },
        {
          heading: 'When lock-ups expire',
          html: '<p>The first insider selling in a newly listed company usually arrives at the lock-up expiry, roughly six months after listing. A name that appears strong here early in the year may face that supply later in it.</p>',
        },
        {
          heading: 'How often this updates',
          html: '<p>Rebuilt every Friday after the close.</p>',
        },
      ],
      pullQuote: {
        text: 'The IPO pop belongs to whoever got an allocation. Everyone else bought the second price of the day.',
        attribution: 'InsiderBuying.com editorial standard',
      },
      whatItMeans: [
        { audience: 'Long-term investors', text: 'Read the financial snapshot before the return. A large gain from the offer price says more about how the deal was priced than about the business.' },
        { audience: 'Active traders', text: 'Note the listing date in each breakdown — the six-month lock-up expiry is the supply event that matters most in a first year.' },
        { audience: 'Researchers and journalists', text: 'Offer prices and listing dates come from the listings feed; current prices are quoted as of the refresh timestamp on this page.' },
      ],
      cta: { headline: 'Track insider activity from day one', body: CTA_BODY },
    },
  },
];
