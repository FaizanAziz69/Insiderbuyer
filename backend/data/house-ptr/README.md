# House Clerk Periodic Transaction Reports (pre-vendor years)

One JSONL per year, written by `backend/scripts/house_ptr_backfill.py` and
loaded by `HouseArchiveService`. This is a committed dataset, not a live feed:
the filings never change, so they are parsed once on a build machine rather
than giving the production box a PDF toolchain.

## Why it exists

Measured 2026-09-23 against our FMP key: the vendor carries the Senate back to
2012 but starts around 2017 for most House members. Its `*-trades-by-name`
endpoints ignore `page` (Pelosi returns the same 139 rows on every page), and
`house-latest` caps at page 100, which reaches only September 2022. So the
House side of the STOCK Act era is not obtainable from the feed.

The Clerk of the House publishes it:

- index  `financial-pdfs/{YEAR}FD.zip` -> tab-delimited, `FilingType` `P` = PTR
- filing `ptr-pdfs/{YEAR}/{DocID}.pdf`

## What is in here, and what is not

Electronically-filed PTRs carry a real text layer and parse cleanly. Filings
submitted on paper are scans with no text layer; they are recorded with
`no_text: true` and an empty `transactions` array. **They are deliberately not
OCR'd** — a misread digit in a dollar band is worse than an absent row, so the
gap is counted and reported rather than guessed at.

Each line: the filer as the Clerk spells them, the source URL, and the parsed
transactions (ticker, type, both dates, dollar band, owner).
