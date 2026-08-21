import type { Metadata } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://insiderbuying.com";

/** Per-URL <title> + meta description supplied by the SEO team
 *  (pre-launch technical audit, "On Page Optimizations" sheet, 2026-08-15).
 *  Keyed by pathname. Dynamic routes fall back to a generated template
 *  when a slug is not in this map. */
export type SeoEntry = { t: string; d: string };

export const SEO_META: Record<string, SeoEntry> = {
  "/": { t: "Real-Time Insider Buying Activity & Signals | Insider Buyers", d: "Track C-suite insider buying activity, SEC Form 4 filings, and proprietary IQS stock signals in real time to make smarter investment decisions." },
  "/about": { t: "About Us | Real-Time Insider Trade Tracking | Insider Buyers", d: "Learn how Insider Buyers empowers retail investors with real-time SEC Form 4 insider trade tracking, proprietary IQS analytics, and market research." },
  "/advertorials/biotech-insider": { t: "Biotech Insider Buying: Top Stocks & Signals", d: "Discover biotech and healthcare stocks seeing massive executive insider buying. Access real-time Form 4 filing data, catalysts, and IQS ratings." },
  "/advertorials/gold-insider": { t: "Gold Stock Insider Buying: Top Trades & Signals", d: "See which gold mining executives and precious metal insiders are buying shares right now. Get real-time Form 4 disclosures and market research." },
  "/advertorials/silver-insider": { t: "Silver Stock Insider Buying Reports & Signals", d: "Track top silver mining stocks receiving heavy insider buys from executives and major shareholders. Explore real-time SEC Form 4 trade disclosures." },
  "/advertorials/tech-insider": { t: "Tech Stock Insider Buying: C-Suite Trades & AI", d: "Uncover tech stocks and AI companies seeing major C-suite insider buying. Track real-time Form 4 filings, executive buys, and market trends." },
  "/advertorials/this-time-is-different": { t: "Contrarian Market Analysis: Insider Signals | Insider Buyers", d: "Explore our deep-dive macro analysis on why executive insider buying patterns signal major opportunities in today's volatile stock market." },
  "/alerts": { t: "Real-Time Insider Trading Alerts & Notifications", d: "Get instant real-time alerts when company executives, directors, and major shareholders buy or sell stock. Set up custom Form 4 notifications." },
  "/analyst-ratings": { t: "Stock Analyst Ratings, Upgrades & Price Targets", d: "Browse the latest Wall Street analyst upgrades, downgrades, and price targets. Combine institutional consensus with insider buying data." },
  "/analyst-stocks": { t: "Top Analyst-Recommended Stocks & Ratings", d: "Explore top-rated stocks backed by Wall Street analyst strong buy ratings and executive insider purchases. Screen high-upside equities today." },
  "/business": { t: "Business News & Corporate Financial Insights", d: "Stay updated with breaking corporate business news, executive moves, and financial analysis. Discover how macro business trends impact stock performance." },
  "/companies": { t: "Company Directory & Stock Ticker Database | Insider Buyers", d: "Browse our comprehensive directory of publicly traded companies. Track stock tickers, C-suite Form 4 transactions, and insider ownership data." },
  "/congressional-trades": { t: "Congressional Stock Trades & Disclosures | Insider Buyers", d: "Track stock purchases and sales by politicians in real time. Access House and Senate financial disclosures to see where politicians invest." },
  "/contact": { t: "Contact Us & Customer Support | Insider Buyers", d: "Get in touch with the Insider Buyers team. Have questions, feedback, or media inquiries? Contact our editorial and support staff today." },
  "/disclaimer": { t: "Financial & Legal Disclaimer | Insider Buyers", d: "Read the official financial and legal disclaimers for Insider Buyers. Our platform provides data-driven research and SEC Form 4 summaries." },
  "/dividends": { t: "Stock Dividend Calendar & Insider Yields | Insider Buyers", d: "Track upcoming stock dividend dates, dividend yields, and payouts. Discover high-yielding dividend stocks favored by corporate insiders." },
  "/earnings": { t: "Earnings Reports, EPS Surprises & Calendar | Insider Buyers", d: "Track real-time stock earnings reports, EPS actuals vs. estimates, and post-earnings price swings combined with insider trading signals." },
  "/editorial": { t: "Editorial Guidelines & Research Standards | Insider Buyers", d: "Learn about our rigorous financial editorial standards, methodology, and commitment to objective SEC Form 4 data analysis and reporting." },
  "/government-contracts": { t: "Federal Government Contracts & Stock Impact | Insider Buyers", d: "Track US government contract awards to public companies. Analyze how federal Defense and IT contracts correlate with insider buying activity." },
  "/heatmaps/market": { t: "Real-Time Market Heatmap & Sector Trends | Insider Buyers", d: "Visualize stock market performance and sector momentum in real time with interactive heatmaps. Spot insider concentration across industries." },
  "/insiders/buy-sell": { t: "Insider Buying vs Selling Activity & Ratios | Insider Buyers", d: "Analyze real-time insider buying vs. selling ratios and Form 4 transaction trends. See whether C-suite executives are accumulating or dumping shares." },
  "/insiders/hot": { t: "Hot Insider Stocks & Top Executive Trades | Insider Buyers", d: "Discover hot stocks experiencing high-conviction C-suite insider buying. Track top executive trades, cluster buys, and surging Form 4 activity today." },
  "/insights": { t: "Market Insights & Insider Trading Research | Insider Buyers", d: "Read data-backed market insights, macro analysis, and forensic insider trade breakdowns. Make informed investments with deep-dive financial research." },
  "/insights/ceo-buying-tracker-2026-08-12": { t: "CEOs Put $438K Into Their Own Stocks in One Week", d: "Six CEOs buy their own shares on the same day. Here's what it may signal." },
  "/insights/daily-briefing-2026-07-16": { t: "Perfect Insider Scores Lead Today's Briefing: Apparel, Energy Diverge", d: "Two stocks hit 100.00 Insider Score as energy and retail cluster among top movers." },
  "/insights/editorial-trump-3b-critical-minerals-2026-08-08": { t: "Trump's $3 Billion Critical-Minerals Bet: The Defense Supply-Chain Names in Focus", d: "Speaking to more than 200 mining executives at the State Department, President Trump announced roughly $3 billion in federal loans across lithium, scandium…" },
  "/insights/stock-idea-dbgi-2026-07-16": { t: "DBGI Insiders Step Up Their Buying | Insider Buying", d: "A single insider has deployed $698,716 on Digital Brands Group stock, pushing the Insider Score to a perfect 100." },
  "/insights/stock-idea-gof-2026-07-16": { t: "Insider Money Is Piling Into GOF | Insider Buying", d: "A fund insider just made a six-figure purchase, signaling conviction in the closed-end fund's strategic direction." },
  "/insights/stock-idea-inr-2026-07-16": { t: "INR: Executives Are Putting Their Own Money to Work", d: "Two insiders at Infinity Natural Resources have purchased shares totaling $449,615, signaling confidence in the crude and natural gas producer." },
  "/insights/stock-idea-nrdy-2026-07-16": { t: "Why NRDY Insiders Are Quietly Buying | Insider Buying", d: "One insider just deployed nearly $450K into Nerdy Inc. A high Insider Score suggests conviction. Investors may want to monitor." },
  "/insights/stock-idea-tgs-2026-07-16": { t: "The Smart Money Keeps Accumulating TGS | Insider Buying", d: "An insider at Gas Transporter of the South just bought $136,915 in stock, signaling conviction in the utility's fundamentals amid energy sector volatility." },
  "/insights/ticker-deep-dive-dbgi-2026-07-16": { t: "DBGI Insider Spent $698K on 618K Shares in June. Here's the Setup.", d: "A single insider made a sizable bet on a micro-cap apparel stock." },
  "/insights/ticker-deep-dive-gof-2026-07-16": { t: "A Director at GOF Just Bought $50K in a Single Day. Here's What It Signals", d: "A single insider's $50K buy in GOF on one day raises questions about conviction." },
  "/insights/ticker-deep-dive-nrdy-2026-07-16": { t: "NRDY's CFO Made Two $250K Buys in 5 Days. Here's What That Tells Us", d: "NRDY's CFO just spent half a million on stock near 52-week lows." },
  "/insights/ticker-deep-dive-tgs-2026-07-16": { t: "A Insider Just Bought $136K of TGS at $29.26 — What the Filing Shows", d: "One insider bought nearly $137K of TGS in June. Here's what Form 4 reveals." },
  "/insights/top-iqs-picks-2026-07-16": { t: "5 Stocks With the Highest Insider Conviction Right Now", d: "Insiders are buying heavily. Here are the five stocks with perfect or near-perfect conviction scores." },
  "/insights/topic-ai-nvda-2026-08-12": { t: "NVIDIA Stays Flat as AI Sector Tests New Direction in Late Summer Rally", d: "NVDA flat amid broader AI rally. Where insiders stand matters." },
  "/insights/topic-biotech-abbv-2026-07-03": { t: "AbbVie Stock Rises on Biotech Strength; Insider Activity Warrants Monitoring", d: "ABBV climbs 3.99% as biotech sector gains traction; insider trading patterns may offer insight into management confidence." },
  "/insights/topic-biotech-amgn-2026-07-03": { t: "Amgen Stock Rises 3.55% Amid Biotech Momentum and Institutional Interest", d: "Amgen shares climb 3.55% as the biotech giant maintains its defensive positioning in a volatile sector landscape." },
  "/insights/topic-biotech-mrk-2026-07-03": { t: "Merck Stock Gains 3.34% as Biotech Sector Eyes Pharmaceutical Giant", d: "Merck advances 3.34% amid broader biotech momentum, drawing investor attention to the pharma leader's pipeline and market positioning." },
  "/insights/topic-biotech-pfe-2026-07-03": { t: "Pfizer Shares Rise Amid Biotech Portfolio Momentum and Insider Activity", d: "Pfizer gains 1.84% as biotech sector dynamics shift; insider transactions and portfolio positioning deserve monitoring." },
  "/insights/topic-etf-2026-07-03": { t: "SEC Opens Public Comment Period on Novel Exchange-Traded Funds Structures", d: "SEC seeks investor input on novel ETF structures as flows reshape major index and commodity funds amid mixed market sentiment." },
  "/insights/topic-etf-gld-2026-07-03": { t: "GLD Advances 2% as SEC Signals Fresh ETF Oversight Framework", d: "GLD rises 2% amid SEC scrutiny of novel ETF structures and regulatory momentum on exchange-traded fund governance." },
  "/insights/topic-etf-iemg-2026-07-03": { t: "IEMG Falls as SEC Proposes Novel ETF Framework Amid Regulatory Scrutiny", d: "IEMG slides 0.98% as SEC moves to regulate novel exchange-traded funds with fresh public comment period." },
  "/insights/topic-etf-ivv-2026-07-03": { t: "IVV Core S&P 500 ETF Flat as SEC Weighs Novel Fund Structure Rules", d: "IVV edges down 0.09% as SEC signals new regulatory scrutiny on emerging exchange-traded fund structures." },
  "/insights/topic-etf-slv-2026-07-03": { t: "Silver ETF SLV Climbs 2.69% as SEC Initiates Novel Fund Review", d: "SLV gains 2.69% as SEC opens public comment period on novel exchange-traded funds, potentially affecting commodity ETF structure and transparency." },
  "/insights/topic-etf-spy-2026-07-03": { t: "SPY Edges Lower as SEC Signals Fresh Focus on Novel ETF Regulation", d: "SPY declines 0.13% amid SEC moves to solicit public comment on novel ETF structures and regulatory oversight." },
  "/insights/topic-etf-tlt-2026-07-03": { t: "TLT Treasury ETF Holds Steady as SEC Signals Novel ETF Review", d: "TLT treasury fund flat as SEC opens public comment period on novel ETF products, signaling heightened regulatory scrutiny." },
  "/insights/topic-ev-2026-07-03": { t: "Tesla Shares Drop as EV Market Consolidation Pressures Legacy Automakers", d: "Tesla slides 7.5% amid EV volatility; Rivian gains as legacy automakers adjust battery strategy." },
  "/insights/topic-ev-alb-2026-07-03": { t: "Albemarle Stock Slides as Lithium Sector Grapples with Demand Headwinds", d: "Albemarle shares drop 0.38% as the lithium producer navigates EV market uncertainty and competitive pricing pressures in the critical battery-materials sector." },
  "/insights/topic-ev-f-2026-07-03": { t: "Ford Motor Company Navigates EV Transition Amid Session Decline", d: "Ford shares slip 2.05% as the automaker continues its electric vehicle expansion and capital allocation strategy." },
  "/insights/topic-ev-fcx-2026-07-03": { t: "Freeport-McMoRan Advances Copper Supply Chain for Electric Vehicles", d: "FCX plays a critical role in the EV supply chain as a major copper producer, essential for battery and motor components." },
  "/insights/topic-ev-gm-2026-07-03": { t: "GM Accelerates EV Push as Legacy Automaker Navigates Market Transition", d: "General Motors advances electric-vehicle strategy amid competitive pressures, with stock gaining 0.64% in latest session." },
  "/insights/topic-ev-rivn-2026-07-03": { t: "Rivian Stock Rises 8.44% as EV Market Sentiment Shifts", d: "Rivian Automotive gains ground as market reassesses EV growth prospects and insider activity patterns emerge." },
  "/insights/topic-ev-tsla-2026-07-03": { t: "Tesla Stock Falls 7.49% as EV Market Weighs on Leadership Position", d: "Tesla shares decline sharply as investors reassess the company's dominance in a crowded electric vehicle market." },
  "/insights/topic-ma-2026-07-03": { t: "Tech Giants Lead M&A Activity as Deal-Making Shapes Mid-Year Market", d: "Major technology and financial services firms remain active in M&A market as dealmakers navigate mid-year volatility and strategic repositioning." },
  "/insights/topic-ma-avgo-2026-07-03": { t: "Broadcom Stock Declines as M&A Uncertainty Clouds Semiconductor Sector", d: "Broadcom shares fall 2.41% amid M&A headwinds affecting the semiconductor and infrastructure software landscape." },
  "/insights/topic-ma-googl-2026-07-03": { t: "Alphabet Navigates M&A Strategy Amid Market Pressure and Antitrust Scrutiny", d: "GOOGL trades lower as competitive M&A dynamics and regulatory headwinds shape Alphabet's acquisition strategy outlook." },
  "/insights/topic-ma-gs-2026-07-03": { t: "Goldman Sachs Maintains M&A Advisory Edge as Deal Flow Stabilizes", d: "Goldman Sachs stands as a key M&A advisor amid stabilizing deal flow; insiders and market sentiment may signal confidence in the firm's advisory franchise…" },
  "/insights/topic-ma-jpm-2026-07-03": { t: "JPM's Strategic Positioning in M&A Market Amid Banking Consolidation Signals", d: "JPM remains central to M&A advisory and financing as banking consolidation signals persist across the sector." },
  "/insights/topic-ma-msft-2026-07-03": { t: "Microsoft's M&A Strategy Shapes Tech Consolidation Amid Market Momentum", d: "Microsoft's acquisition track record and strategic focus position it as a key player in tech consolidation as stock momentum builds." },
  "/insights/topic-ma-orcl-2026-07-03": { t: "Oracle Navigates M&A Strategy as Stock Dips on Market Volatility", d: "Oracle stock declines 1.56% amid broader market moves; M&A positioning remains a key strategic lever for cloud and AI expansion." },
  "/insights/topic-macro-2026-07-03": { t: "Fed Stress Test Signals Banking Resilience Amid Macro Uncertainty", d: "Fed confirms large banks resilient in stress tests; enforcement actions reshape compliance landscape as rate environment stabilizes." },
  "/insights/topic-macro-bac-2026-07-03": { t: "Bank of America Gains Ground as Fed Tightens Enforcement on Smaller Regional Banks", d: "BAC edges higher as Federal Reserve enforcement actions target smaller banks, potentially benefiting larger institutional players." },
  "/insights/topic-macro-gs-2026-07-03": { t: "Goldman Sachs Navigates Regulatory Scrutiny as Fed Issues Bank Enforcement Actions", d: "Goldman Sachs edges higher as Federal Reserve escalates bank enforcement actions, signaling heightened regulatory focus on the financial sector." },
  "/insights/topic-macro-jpm-2026-07-03": { t: "JPMorgan Chase Navigates Fed Enforcement Shift Amid Broader Banking Oversight", d: "JPMorgan Chase edges higher as Federal Reserve shifts enforcement posture, terminating actions on select banks while tightening oversight elsewhere." },
  "/insights/topic-macro-nee-2026-07-03": { t: "NextEra Energy Gains as Regulatory Environment Shifts on Fed Actions", d: "NEE rises 2.28% as Federal Reserve enforcement actions reshape banking sector dynamics affecting utility financing and capital markets." },
  "/insights/topic-macro-wmt-2026-07-03": { t: "Walmart Stock Gains as Retail Sector Navigates Federal Reserve Policy Shift", d: "Walmart rises 2.78% amid Fed enforcement actions and emerging monetary policy signals that may benefit consumer-focused retailers." },
  "/insights/topic-macro-xom-2026-07-03": { t: "XOM Gains as Energy Sector Navigates Fed Regulatory Clarity", d: "Exxon Mobil rises 0.59% as Fed enforcement actions signal regulatory focus on banking oversight, potentially easing energy sector sentiment." },
  "/insights/topic-markets-2026-07-03": { t: "U.S. Equity Markets Post Mixed Signals as Regulators Tighten Reporting Frameworks", d: "Tech leads morning action as Fed economic projections and SEC rule proposals reshape market structure oversight and swap-market transparency." },
  "/insights/topic-markets-aapl-2026-07-03": { t: "Apple Gains 4.84% as Markets Digest SEC and Fed Policy Signals", d: "Apple rallies 4.84% as broader markets respond to SEC market structure updates and Fed economic projections." },
  "/insights/topic-markets-amzn-2026-07-03": { t: "Amazon Stock Edges Higher as Markets Navigate Regulatory Clarity on Data Reporting", d: "AMZN rises 0.40% as SEC and Fed updates shape market expectations; investors monitor regulatory landscape." },
  "/insights/topic-markets-jpm-2026-07-03": { t: "JPM Steadies as Regulatory Scrutiny on Market Infrastructure Intensifies", d: "JPM edges up 0.12% amid SEC and Fed regulatory activity that could reshape market data and swap reporting frameworks." },
  "/insights/topic-markets-meta-2026-07-03": { t: "Meta Platforms Slides 4.90% Amid Broader Tech Volatility and Market Uncertainty", d: "Meta Platforms drops 4.90% as tech sector faces headwinds from regulatory scrutiny and macroeconomic uncertainty." },
  "/insights/topic-markets-msft-2026-07-03": { t: "Microsoft Stock Climbs 1.62% Amid Regulatory Focus on Market Structure", d: "MSFT rallies 1.62% as SEC regulatory updates on IPOs, swaps, and market structure reshape investor sentiment in tech." },
  "/insights/topic-markets-nvda-2026-07-03": { t: "NVIDIA Stock Falls 1.39% Amid Market Regulatory Scrutiny and Fed Signals", d: "NVIDIA slides 1.39% as SEC and Fed statements influence broader tech market sentiment amid regulatory focus." },
  "/insights/topic-semis-2026-07-03": { t: "Semiconductor Equipment Sector Leads Declines as Chip Complex Pulls Back", d: "Semiconductor equipment makers and memory chips slide on July 3; equipment stocks lead losses as sector reassesses growth outlook." },
  "/insights/topic-semis-amd-2026-07-03": { t: "AMD Falls 4.26% as Semiconductor Sector Navigates Market Volatility", d: "Advanced Micro Devices shares decline sharply in today's session amid broader semiconductor sector turbulence." },
  "/insights/topic-semis-avgo-2026-07-03": { t: "Broadcom Falls 2.4% as Semiconductor Sector Watches AVGO Momentum", d: "Broadcom slides 2.4% amid broader semiconductor sector volatility; insiders and analysts watching positioning closely." },
  "/insights/topic-semis-mu-2026-07-03": { t: "Micron Technology Stock Drops 5.5% as Memory Chip Cycle Faces Headwinds", d: "Micron Technology slides on sector volatility; investors monitoring insider moves and memory-chip demand signals." },
  "/insights/topic-semis-nvda-2026-07-03": { t: "NVIDIA Stock Slides 1.39% as Semiconductor Sector Navigates Valuation Pressure", d: "NVDA declines 1.39% amid broader semiconductor volatility; investors monitor insider activity for conviction signals." },
  "/insights/topic-semis-qcom-2026-07-03": { t: "QUALCOMM Stock Falls 3.12% Amid Semiconductor Sector Pressure", d: "QUALCOMM shares decline 3.12% as semiconductor momentum faces headwinds; investors may want to monitor insider activity for conviction signals." },
  "/insights/topic-semis-txn-2026-07-03": { t: "Texas Instruments Falls 1.79% Amid Semiconductor Sector Pressure", d: "Texas Instruments trades lower as semiconductor stocks face headwinds; investors monitor insider activity for sentiment signals." },
  "/ipos": { t: "Upcoming IPOs Calendar & Insider Tracking | Insider Buyers", d: "Track upcoming initial public offerings (IPOs), filing dates, and insider lockup expirations. Monitor executive activity for newly public companies." },
  "/learn/insider-buying": { t: "How to Use Insider Buying Data to Trade | Insider Buyers", d: "Learn how to read SEC Form 4 filings, spot high-conviction executive stock buys, and use insider trading data to improve your stock market returns." },
  "/market-data/top-gainers": { t: "Top Gaining Stocks Today & Insider Activity | Insider Buyers", d: "See today's top gaining stocks in real time. Combine price momentum with SEC Form 4 insider buying signals to spot breakout stock opportunities." },
  "/market-data/top-losers": { t: "Top Losing Stocks Today & Insider Buys | Insider Buyers", d: "Track today's biggest stock price drops and dip-buying C-suite executives. Discover contrarian stock opportunities backed by Form 4 filings." },
  "/movers": { t: "Daily Stock Market Movers & Insider Trades | Insider Buyers", d: "Monitor daily stock market movers, volume surges, and executive trading activity. Track where smart money and corporate insiders are positioning." },
  "/premium": { t: "Insider Buyers Premium | Real-Time IQS Alerts & Data", d: "Upgrade to Insider Buyers Premium for real-time IQS trade alerts, deep-dive Form 4 research, historical insider win rates, and custom portfolio tracking." },
  "/reports": { t: "Insider Trading Reports & Stock Research | Insider Buyers", d: "Access in-depth insider trading reports, Form 4 market breakdowns, and sector analyses. Discover executive sentiment across top public equities." },
  "/reports/cta/AAPL": { t: "Apple (AAPL) Insider Buying Report & Analysis", d: "Get the full insider trading report for Apple Inc. (AAPL). Track C-suite Form 4 buys, executive holdings, and proprietary IQS stock signals." },
  "/reports/cta/KGC": { t: "Kinross Gold (KGC) Insider Trade Report | Insider Buyers", d: "Review real-time insider buying and selling activity for Kinross Gold Corp (KGC). Access Form 4 disclosures, executive transactions, and IQS ratings." },
  "/reports/cta/MRNA": { t: "Moderna (MRNA) Insider Buying Report & Data | Insider Buyers", d: "Analyze Moderna Inc. (MRNA) insider trade activity and SEC Form 4 filings. Track executive buys, insider ownership changes, and IQS stock signals." },
  "/reports/cta/NVDA": { t: "NVIDIA (NVDA) Insider Buying Report & Analysis", d: "Track Nvidia Corp (NVDA) insider trading activity and SEC Form 4 filings. Review executive buys, C-suite holdings, and real-time IQS stock signals." },
  "/reports/cta/PAAS": { t: "Pan American Silver (PAAS) Insider Report | Insider Buyers", d: "Analyze Pan American Silver Corp (PAAS) executive insider buys and sales. Access real-time Form 4 disclosures, C-suite trades, and IQS ratings." },
  "/reports/cta/TOP5": { t: "Top 5 Insider Buying Stocks Report | Insider Buyers", d: "Discover the top 5 stocks seeing heavy C-suite insider buying this month. Access detailed SEC Form 4 analysis, executive conviction, and IQS ratings." },
  "/reports/cta/TSLA": { t: "Tesla (TSLA) Insider Buying Report & Signals", d: "Get the full insider trading report for Tesla Inc. (TSLA). Track C-suite Form 4 transactions, executive share accumulation, and real-time IQS data." },
  "/reports/monthly/2026-01": { t: "January 2026 Insider Buying Monthly Report | Insider Buyers", d: "Review top executive insider trades and Form 4 filing trends from January 2026. Analyze high-conviction C-suite purchases across all major sectors." },
  "/reports/monthly/2026-02": { t: "February 2026 Insider Buying Monthly Report | Insider Buyers", d: "Explore executive stock purchases and SEC Form 4 transaction trends for February 2026. Discover top insider buys, cluster activity, and market insights." },
  "/reports/monthly/2026-03": { t: "March 2026 Insider Trading Monthly Report | Insider Buyers", d: "Access the March 2026 insider trading report. Analyze C-suite stock accumulation, major Form 4 disclosures, and sector-wide executive sentiment." },
  "/reports/monthly/2026-04": { t: "April 2026 Insider Buying Monthly Report | Insider Buyers", d: "Review executive stock buying trends and SEC Form 4 filings from April 2026. Spot high-conviction insider trades and top-performing equities." },
  "/reports/monthly/2026-05": { t: "May 2026 Insider Trading Monthly Report | Insider Buyers", d: "Explore C-suite executive trades and SEC Form 4 filings for May 2026. Access detailed insider buying analysis, sector trends, and IQS ratings." },
  "/screener": { t: "Insider Buying Stock Screener & Filter | Insider Buyers", d: "Filter and screen public stocks by C-suite insider buying, Form 4 transaction sizes, executive roles, and proprietary IQS ratings in real time." },
  "/sectors": { t: "Market Sectors & Industry Insider Buying | Insider Buyers", d: "Explore insider buying and selling trends across major market sectors. Track C-suite transaction activity in Tech, Healthcare, Energy, and Finance." },
  "/short-interest": { t: "High Short Interest Stocks & Insider Buys | Insider Buyers", d: "Discover heavily shorted stocks seeing unexpected C-suite insider buying. Track high short interest equities backed by Form 4 executive accumulation." },
  "/short-squeeze": { t: "Short Squeeze Candidates with Insider Buying", d: "Spot potential short squeeze stocks driven by heavy insider buying, high short float, and SEC Form 4 filings. Identify contrarian trading setups." },
  "/stock-lists": { t: "Curated Insider Stock Lists & Screeners | Insider Buyers", d: "Browse curated stock lists filtered by C-suite insider buying, sector focus, dividend yield, and market cap. Discover high-conviction equities." },
  "/stock-lists/biotech": { t: "Biotech Stock List: Top Insider Buys & Trades", d: "Track biotech and clinical-stage stocks experiencing executive insider accumulation. Access real-time Form 4 filings and pipeline updates." },
  "/stock-lists/blue-chip": { t: "Blue Chip Stocks with Executive Insider Buys", d: "Explore top-tier blue chip stocks seeing significant C-suite insider purchases. Combine balance sheet stability with high-conviction executive buys." },
  "/stock-lists/blue-sky": { t: "Blue Sky Stocks & All-Time High Insider Buys", d: "Track blue sky breakout stocks making new all-time highs with active executive insider buying. Spot momentum equities backed by Form 4 filings." },
  "/stock-lists/canada": { t: "Canadian Stocks Insider Buying & TSX Trades | Insider Buyers", d: "Monitor insider buying and selling activity across Canadian stocks on the TSX and TSXV. Track Form 4 and SEDI executive trade disclosures." },
  "/stock-lists/eric-sprott": { t: "Eric Sprott Stock Portfolio & Mining Trades | Insider Buyers", d: "Track billionaire investor Eric Sprott's stock holdings and mining disclosures. See recent gold and silver stock purchases and insider stakes." },
  "/stock-lists/faang": { t: "FAANG Stock Insider Trading & Big Tech Buys | Insider Buyers", d: "Track executive insider buying and selling across FAANG and major Big Tech stocks. Review C-suite Form 4 filings for Meta, Apple, Nvidia, and more." },
  "/stock-lists/germany": { t: "German Stocks Insider Buying & BaFin Trades | Insider Buyers", d: "Monitor insider buying and selling across German stocks. Track BaFin director dealings and executive trade disclosures on the Frankfurt exchange." },
  "/stock-lists/gold": { t: "Gold Stocks Insider Buying & Mining Trades | Insider Buyers", d: "Discover gold mining stocks seeing significant executive insider purchases. Access real-time SEC Form 4 trade disclosures and industry trends." },
  "/stock-lists/hot-sectors": { t: "Hot Sectors with Heavy Insider Buying | Insider Buyers", d: "Explore market sectors experiencing concentrated C-suite insider buying. Track industry-wide executive sentiment and Form 4 trade clusters." },
  "/stock-lists/iqs-top-picks": { t: "IQS Top Stock Picks & Insider Ratings | Insider Buyers", d: "Discover top-rated stocks selected by our proprietary IQS scoring system. Combine high-conviction C-suite insider buying with quantitative data." },
  "/stock-lists/jeff-bezos": { t: "Jeff Bezos Stock Trades & Amazon Holdings | Insider Buyers", d: "Track Jeff Bezos' stock transactions, Amazon (AMZN) Form 4 disclosures, and insider selling activity. Stay updated on executive stock moves." },
  "/stock-lists/large-cap": { t: "Large-Cap Stocks with C-Suite Insider Buys | Insider Buyers", d: "Monitor large-cap stocks seeing high-conviction executive insider buying. Track S&P 500 C-suite Form 4 filings and corporate sentiment." },
  "/stock-lists/metals-and-mining": { t: "Metals & Mining Stocks Insider Buying | Insider Buyers", d: "Track insider buying across metals and mining stocks. Review Form 4 filings for gold, silver, copper, and critical mineral mining executives." },
  "/stock-lists/oil": { t: "Oil & Energy Stocks Insider Buying | Insider Buyers", d: "Discover oil and gas stocks seeing heavy executive insider buying. Track C-suite Form 4 transactions across the energy sector in real time." },
  "/stock-lists/penny-stocks": { t: "Penny Stocks with Heavy Insider Buying | Insider Buyers", d: "Find low-priced penny stocks experiencing significant C-suite insider accumulation. Filter micro-cap equities by Form 4 buys and IQS scores." },
  "/stock-lists/politicians": { t: "Politician Stock Trades & Congressional Buys", d: "Track stock trades by US politicians, senators, and representatives. Access congressional financial disclosures and compare returns in real time." },
  "/stock-lists/ray-dalio": { t: "Ray Dalio Stock Portfolio & Bridgewater Trades", d: "Track billionaire Ray Dalio's stock portfolio and Bridgewater Associates 13F filings. Monitor major stock purchases, sales, and sector allocations." },
  "/stock-lists/reits": { t: "REITs with Insider Buying & Real Estate Trades", d: "Discover Real Estate Investment Trusts (REITs) seeing heavy executive insider buying. Track Form 4 filings across commercial and residential REITs." },
  "/stock-lists/silver": { t: "Silver Stocks Insider Buying & Mining Trades", d: "Track silver mining stocks experiencing high-conviction C-suite insider buying. Review SEC Form 4 trade disclosures and silver market trends." },
  "/stock-lists/small-cap": { t: "Small-Cap Stocks with C-Suite Insider Buys | Insider Buyers", d: "Find promising small-cap stocks seeing significant executive insider accumulation. Filter high-upside equities by Form 4 transactions and IQS ratings." },
  "/stock-lists/tech": { t: "Tech Stocks Insider Buying & C-Suite Trades | Insider Buyers", d: "Track technology stocks and software companies receiving major executive insider buys. Review real-time Form 4 filings and C-suite accumulation." },
  "/stock-lists/trump-family": { t: "Trump Family Stock Trades & Financial Filings", d: "Track stock trades, investments, and disclosures associated with the Trump family and inner circle. Access real-time financial tracking data." },
  "/stock-lists/warren-buffett": { t: "Warren Buffett Stock Portfolio & 13F Trades | Insider Buyers", d: "Track Warren Buffett's stock portfolio and Berkshire Hathaway 13F filings. Monitor top holdings, recent stock purchases, and insider activity." },
  "/trades": { t: "Real-Time Insider Trades & SEC Form 4 Filings", d: "Browse the master feed of real-time C-suite insider trades, Form 4 filings, and congressional disclosures. Filter by trade value, ticker, and role." },
  "/watchlist": { t: "Custom Stock Watchlist & Insider Trade Alerts", d: "Build a personalized stock watchlist to track executive insider buying across your favorite companies. Get real-time Form 4 notifications and alerts" },
};

export function seoEntry(path: string): SeoEntry | undefined {
  return SEO_META[path];
}

/** Metadata for a fixed route: mapped title/description plus a canonical,
 *  OpenGraph and Twitter card pointing at the production URL. */
export function pageMetadata(
  path: string,
  fallback?: { title: string; description: string },
): Metadata {
  const e = SEO_META[path];
  const title = e?.t ?? fallback?.title ?? "Insider Buying — Live SEC Form 4 + Congressional Trades";
  const description =
    e?.d ??
    fallback?.description ??
    "Track insider buys and sells in real-time. SEC Form 4 analysis reveals where smart money is accumulating.";
  const url = `${SITE}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Insider Buying",
      type: "website",
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}

/** Branded link-preview card (client 2026-08-22: shared links must show the
 *  logo). Absolute URL — WhatsApp/Slack/Twitter don't resolve relative ones. */
export const OG_IMAGE = {
  url: `${SITE}/og-image.png`,
  width: 1200,
  height: 859,
  alt: "Insider Buying",
};

/** Turn a URL slug into readable words for fallback titles. */
export function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
