import json, datetime

now = datetime.datetime.now(datetime.UTC)
def ts(mins): return (now - datetime.timedelta(minutes=mins)).isoformat()

def art(slug, title, ticker, sector, summary, category, tags, imageAlt, body, gen):
    return {
        "slug": slug, "title": title, "kind": "stock-idea", "ticker": ticker,
        "sector": sector, "topic": None, "summary": summary, "eyebrow": "STOCK IDEA",
        "category": category, "imageUrl": None, "imageAlt": imageAlt, "draft": False,
        "sponsored": False, "tags": tags, "featuredTickers": [ticker] if ticker else [],
        "generatedAt": gen,
        "body": body, "imagePrompt": None, "iqsAtGeneration": None,
        "inputSnapshot": None, "updatedAt": gen,
    }

nvda = art(
 "stock-idea-nvda-2026-08-28",
 "NVIDIA (NVDA) Slides 4.6% as AI-Chip Leaders Cool",
 "NVDA", "Semiconductors",
 "NVIDIA fell 4.6% on the day and led chips lower, yet our Form 4 record shows no insider buying the dip.",
 "MARKET MOVER",
 ["NVDA","nvidia","semiconductor","ai","insider-buying"],
 "NVIDIA logo over a semiconductor and market-data backdrop",
 """<h3>Key points</h3>
<ul>
<li>NVIDIA (NVDA) fell 4.6% on the day, the largest decliner among Friday's most-active names.</li>
<li>Our Form 4 record shows no open-market purchases by NVIDIA insiders during the pullback.</li>
<li>The transaction timeline below shows exactly what insiders have, and have not, filed.</li>
</ul>
<p>NVIDIA (NVDA) closed near $217.55 on Friday, down 4.6% on the day and leading the semiconductor complex lower as traders trimmed exposure to the year's most-crowded trade. The stock is still the largest company on the tape, so a single-session move of this size pulls the broad indexes with it.</p>
<p>CNBC and other outlets tied the slide to profit-taking across AI-infrastructure names rather than any company-specific news. Chip peers weakened in sympathy through the session.</p>
<div data-viz="insider-timeline" data-ticker="NVDA"></div>
<p>For a stock this widely held, the insider tape is where conviction shows up. Reviewed by InsiderBuying.com, NVIDIA's Form 4 filings carry no open-market purchase by an officer or director during the decline, and the timeline above makes that absence explicit rather than hiding it. When insiders neither buy the dip nor sell into strength, the read is simply that management is standing pat.</p>
<p>The absence is itself information. Through the sector's prior wobbles this year, our record shows insider conviction concentrated in smaller, less-covered names rather than the megacap leaders, where officers already hold large equity stakes and rarely add on weakness. A dip in NVIDIA is a market event; it is not, on this evidence, an insider one.</p>
<p>What to watch: a first open-market purchase by a named NVIDIA officer would be the cleanest sign that insiders see value at these levels. Track real-time insider activity on the <a href="/companies/NVDA">NVIDIA company page</a>, or compare conviction across names with our <a href="/premium">Insider Score</a> tools.</p>""",
 ts(7))

intc = art(
 "stock-idea-intc-2026-08-28",
 "Intel's (INTC) CEO Just Bought $10 Million of Stock",
 "INTC", "Semiconductors",
 "Intel CEO Lip-Bu Tan made a roughly $10 million open-market purchase, the highest-conviction insider signal there is.",
 "INSIDER ALERT",
 ["INTC","intel","semiconductor","semis","insider-buying"],
 "Intel and a semiconductor wafer over market data",
 """<h3>Key points</h3>
<ul>
<li>Intel (INTC) CEO Lip-Bu Tan made a roughly $10 million open-market purchase on August 11.</li>
<li>A chief executive buying eight figures of his own stock is the highest-conviction insider signal there is.</li>
<li>Shares still fell 2.9% on the day, tracking the broader chip pullback.</li>
</ul>
<p>Intel (INTC) chief executive Lip-Bu Tan disclosed an open-market purchase of about $9,999,985 in company stock on August 11, one of the larger chief-executive buys on our tape this month. A CEO putting roughly $10 million of personal capital into the stock he runs is the signal insider analysts weight most heavily.</p>
<p>The stock has not rewarded the move yet. INTC fell 2.9% on the day to about $89.47, tracking a broad semiconductor pullback. CNBC noted chip stocks weakened across the session.</p>
<div data-viz="price-markers" data-ticker="INTC"></div>
<p>Reviewed by InsiderBuying.com, the Form 4 confirms the transaction was an open-market purchase, not an option exercise or a grant, which is what separates a conviction buy from routine compensation. The price-marker chart above places the purchase against Intel's trading range so the timing is easy to judge.</p>
<p>Context matters for how much weight to give the buy. Tan took the top job during a difficult turnaround, and a purchase of this size aligns his personal balance sheet with the recovery he is selling to the market. That is exactly the alignment the Insider Score is built to detect, whatever the stock does next.</p>
<p>What to watch: whether other Intel officers or directors follow the CEO with purchases of their own, which would turn one signal into a cluster. Track real-time insider activity on the <a href="/companies/INTC">Intel company page</a>, and see how the buy scores with our <a href="/premium">Insider Score</a>.</p>""",
 ts(4))

iren = art(
 "stock-idea-iren-2026-08-28",
 "IREN (IREN) Drops 12.5% in Bitcoin-Miner Selloff",
 "IREN", "Technology",
 "IREN fell 12.5% on the day with Bitcoin, and no insider has stepped in to buy the drop, per our Form 4 record.",
 "MARKET MOVER",
 ["IREN","bitcoin","crypto","insider-buying"],
 "IREN over a Bitcoin and data-center backdrop",
 """<h3>Key points</h3>
<ul>
<li>IREN (IREN) fell 12.5% on the day, the steepest drop among the most-active names.</li>
<li>The decline tracked a broad pullback in Bitcoin and crypto-linked equities.</li>
<li>Our Form 4 record shows no open-market insider purchases at IREN during the slide.</li>
</ul>
<p>IREN (IREN), the Bitcoin-mining and data-center operator, fell 12.5% on the day to about $35.45, the sharpest decliner on Friday's most-active list. The move came as Bitcoin itself slipped and the ProShares Bitcoin ETF (BITO) traded lower alongside the miners.</p>
<p>Reuters and other outlets tied the crypto weakness to rising Treasury yields after hawkish Federal Reserve commentary. Miners, which carry leverage to the coin price, tend to amplify those moves in both directions.</p>
<div data-viz="insider-timeline" data-ticker="IREN"></div>
<p>Reviewed by InsiderBuying.com, IREN's filings show no open-market purchase by an officer or director during the decline, and the timeline above states that absence plainly rather than drawing a blank. For a high-volatility name, an insider stepping in on a 12.5% down day would be a notable vote of confidence; none has, so far.</p>
<p>The pattern is worth keeping in view. Miners often see insider buying cluster near cycle lows rather than during momentum runs, so the filings can lead the equity. So far the tape at IREN is quiet in both directions, which leaves the coin price, not management, as the driver of the next move.</p>
<p>What to watch: a first open-market purchase from IREN management, or a stabilization in Bitcoin, either of which could change the tape. Track real-time insider activity on the <a href="/companies/IREN">IREN company page</a>, or screen crypto-linked names with our <a href="/premium">Insider Score</a>.</p>""",
 ts(5))

nem = art(
 "stock-idea-nem-2026-08-28",
 "Newmont (NEM) Dips as Gold's Second-Half Rally Builds",
 "NEM", "Basic Materials",
 "Newmont slipped 3.3% even as strategists called for a stronger second-half gold rally, widening the gap between metal and miners.",
 "SECTOR SPOTLIGHT",
 ["NEM","newmont","gold","materials","metals-and-mining","insider-buying"],
 "Newmont and a gold-mining district map",
 """<h3>Key points</h3>
<ul>
<li>Newmont (NEM) slipped 3.3% on the day even as strategists called for a stronger second-half gold rally.</li>
<li>Gold miners have lagged the metal's move, leaving a gap between bullion and the equities.</li>
<li>Our Form 4 record shows no recent open-market purchases by Newmont insiders.</li>
</ul>
<p>Newmont (NEM), the world's largest gold producer, fell 3.3% on the day to about $127.98, even as several strategists argued the second-half gold rally is just getting started. The pullback widened the familiar gap between the metal and the miners that dig it out of the ground.</p>
<p>Barron's and other outlets have framed gold's strength as a hedge against sticky inflation and rate uncertainty. When bullion runs and the miners lag, the equities can carry more operating leverage to any catch-up.</p>
<div data-viz="sector-table" data-days="30"></div>
<p>Reviewed by InsiderBuying.com, Newmont's Form 4 filings show no recent open-market purchase by an officer or director, so the conviction case here rests on the macro backdrop, not the insider tape. The sector table above shows where insider buying is actually concentrated across the market right now.</p>
<p>The split between metal and miners is the setup to watch. Producers like Newmont convert a higher gold price into cash flow with operating leverage, so a sustained rally tends to reach the equities eventually. Whether insiders start buying ahead of that catch-up is the signal our record is built to surface.</p>
<p>What to watch: an open-market purchase at a major miner would mark the moment management agrees with the bullish macro call. Track real-time insider activity on the <a href="/companies/NEM">Newmont company page</a>, or compare sectors with our <a href="/premium">Insider Score</a> tools.</p>""",
 ts(6))

aapl = art(
 "stock-idea-aapl-2026-08-28",
 "Apple (AAPL) Gains 1.6% as Megacaps Split From Chips",
 "AAPL", "Technology",
 "Apple rose 1.6% while NVIDIA and chips fell, a rotation within megacap tech, though no insider is buying, per our Form 4 record.",
 "MARKET MOVER",
 ["AAPL","apple","technology","insider-buying"],
 "Apple over a market-data and manufacturing backdrop",
 """<h3>Key points</h3>
<ul>
<li>Apple (AAPL) rose 1.6% on the day even as NVIDIA and the chip complex sold off.</li>
<li>The split points to rotation within megacap technology rather than a broad tech retreat.</li>
<li>Our Form 4 record shows no open-market purchases by Apple insiders.</li>
</ul>
<p>Apple (AAPL) gained 1.6% on the day to about $319.70, holding near its highs while NVIDIA and the semiconductor group fell. On a session when the most-crowded AI names came under pressure, the largest company in the market moved the other way, a sign that money rotated within megacap technology rather than leaving it.</p>
<p>Bloomberg and other outlets have pointed to Apple's expanded roughly $500 billion United States investment plan as part of the steadier fundamental story investors are leaning on. That backdrop tends to make the stock a relative haven when higher-beta technology wobbles.</p>
<div data-viz="insider-timeline" data-ticker="AAPL"></div>
<p>Reviewed by InsiderBuying.com, Apple's Form 4 filings show no open-market purchase by an officer or director in the recent window, and the timeline above makes that plain. For a company where executives already hold large equity stakes, the absence of buying is normal rather than bearish, so the insider tape here is neutral, neither confirming nor contradicting the price strength.</p>
<p>The read-through is about positioning. When capital rotates from chips into Apple on a down day for the group, it usually reflects a preference for cash flow and buybacks over momentum, and that is a pattern worth watching across the megacap names rather than in Apple alone.</p>
<p>What to watch: any first open-market purchase by an Apple insider, which would be an unusual and notable signal given how rarely they buy. Track real-time insider activity on the <a href="/companies/AAPL">Apple company page</a>, or compare conviction across megacaps with our <a href="/premium">Insider Score</a> tools.</p>""",
 ts(3))

ideas=[aapl,intc,iren,nem,nvda]
json.dump(ideas, open('scratchpad/stock-ideas-preview.json','w'), indent=1)
print("wrote", len(ideas), "articles")
