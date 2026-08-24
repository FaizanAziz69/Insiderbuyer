# Editorial thumbnails (client-supplied)

## FIXED SIZE: 1606 x 1000 (client, 2026-08-24)

Every thumbnail in this folder must be exactly **1606x1000** — the size the
client's own 25 exports use. Card and article-hero geometry follows the image,
so a one-off size changes the layout of whatever section it lands in; that is
the bug the client reported twice. When a new graphic arrives at a different
aspect, DO NOT crop it to fit: the graphics are text-tight at the edges, so
cropping clips the headline or the ticker band. Extend the frame instead
(stretch/blur the top and bottom edge rows into the new space) and resize to
1606x1000 — nothing is lost and the size stays constant.

Legacy exceptions, left as they are because padding them to 1.606 would add
visible bars: anthropic-ipo-filing, tomlee-record-highs (1200x546),
gates-four-seasons-msft, jensen-huang-2026 (1200x672), tom-lee-rally
(1170x596), bill-ackman-letter (680x453).

Drop the 25 JPGs from the client's Google Drive folder here, keeping their
original names. `frontend/lib/editorial-thumbs.ts` matches each article to the
best-fitting image by keyword (ticker / persona / topic); any name below that
is missing simply falls back to the curated sector photo — nothing breaks.

Expected files:
1 Zefiro Methane Corp CEO, Talal Debs.jpg
2 Chamath Palihapitiya Is Backing Perimeter Medical Imaging AI.jpg
3 Ryan Cohen reportedly has a $1 billion bet on Chinese tech giant Alibaba.jpg
4 Ryan Cohen reportedly has a $1 billion bet on Chinese tech giant Alibaba.jpg
5 Vimeo Executives Make Bold Moves with Major Stock Purchases.jpg
6 How to invest like a Pelosi.jpg
7 Nancy Pelosi's husband made $38M worth of stock trades in weeks leading up to Trump inauguration.jpg
8 Eric and Donald Trump Jr. Gave a Trump Bump to This Hot Stock.jpg
9 Cathie Wood Goes Bargain Hunting 3 Stocks She Just Bought.jpg
10 Carl Icahn Is Buying Up Stock in This Fertilizer Producer.jpg
11 Bill Ackman reveals he's been building a more than $2 billion stake in Uber.jpg
12 Trump's FBI Pick Kash Patel Took Up to $5M in Stock From Chinese Ecommerce Giant Shein.jpg
13 Elon Musk Questions Congress Members Wealth.jpg
14 Warren Buffett Just Bought 1 Stock Wall Street Thinks Could Soar Over 40%.jpg
15 Abu Dhabi Wealth Fund Buy $437 Millions Worth Of BlackRock's Bitcoin ETF.jpg
16 Warren Buffett Just Added $1 Billion Worth of This Beaten-Down Value Stock to Berkshire Hathaway's Portfolio.jpg
17 Bill Ackman raises bid for Howard Hughes, says he will turn it into 'modern-day Berkshire'.jpg
18 Lutnick Taps Two Sons, Three Business Heads to Run Cantor.jpg
19 Trump sending fewer market moving social media posts than previous term, study shows.jpg
20 Stocks Insiders Spent The Most Money On Recently.jpg
21 Jamie Dimon calls U.S. government 'inefficient' and says Elon Musk's DOGE effort 'needs to be done'.jpg
22 Apple plans $500 billion in US investment, 20,000 research jobs in next four years.jpg
23 Warren Buffett's Annual Letter Shares 4 of the Most Chilling Words Investors Will Ever Witness.jpg
24 Super Stocks Billionaires Are Piling Into Now.jpg
25 Billionaire Israel Englander Sold Nvidia and Piled Into a BlackRock ETF That MicroStrategy's Michael Saylor.jpg
