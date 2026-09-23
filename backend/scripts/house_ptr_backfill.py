#!/usr/bin/env python3
"""
House Clerk Periodic Transaction Reports -> JSONL, for the years FMP does not
carry (Brief v7 §2.1: "as far back as the disclosure record allows").

Measured 2026-09-23: FMP's congressional record reaches 2012 for the Senate but
starts around 2017 for most House members (its by-name endpoint ignores `page`,
and house-latest caps at page 100 ~ 2022), so the pre-2017 House record has to
come from the Clerk.

Source, all public, no key:
  index  https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{YEAR}FD.zip
         -> {YEAR}FD.txt, tab-delimited: Prefix Last First Suffix FilingType
            StateDst Year FilingDate DocID   (FilingType 'P' = PTR)
  filing https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{YEAR}/{DocID}.pdf

The PDFs are generated forms, so the text layer is real and pypdf reads it; a
scanned paper filing yields no text and is reported as unparsed rather than
guessed at. Kerning in the text layer is erratic ("Corporatio n (UNP)S"), so the
parse anchors on the shapes that survive it: a ticker in parentheses, the
transaction letter, two dates, and the dollar band.

This runs on a laptop, not in production: the output is a committed dataset the
backend loads once. Nothing here is on a request path.

  python3 house_ptr_backfill.py 2014 2015 2016 --out ../data/house-ptr
"""
import argparse, io, json, os, re, subprocess, sys, time, zipfile

UA = "InsiderBuyingBot/1.0 (+https://insiderbuying.com)"
INDEX = "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{y}FD.zip"
PDF = "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{y}/{doc}.pdf"

# (TICKER) then the transaction letter, an optional "(partial)", two dates and
# the amount band. Whitespace is greedy because the text layer scatters it.
TX = re.compile(
    r"\(([A-Z][A-Z0-9.\-]{0,9})\)\s*"          # ticker
    r"([PSE])\s*"                               # P purchase / S sale / E exchange
    r"(\(partial\))?\s*"
    r"(\d{1,2}/\d{1,2}/\d{4})\s*"               # transaction date
    r"(\d{1,2}/\d{1,2}/\d{4})\s*"               # notification date
    r"\$([\d,]+)\s*-\s*\$?([\d,]+)",            # amount band
    re.I,
)
OWNER = re.compile(r"\b(SP|DC|JT)\b")
OWNER_MAP = {"SP": "spouse", "DC": "dependent", "JT": "joint"}


def fetch(url, tries=3):
    """curl, not urllib: python on the build machine has no CA bundle and every
    https call fails CERTIFICATE_VERIFY_FAILED (the same workaround the rest of
    this project uses)."""
    for n in range(tries):
        r = subprocess.run(
            ["curl", "-sS", "--fail", "-m", "90", "-A", UA, url],
            capture_output=True,
        )
        if r.returncode == 0 and r.stdout:
            return r.stdout
        if n == tries - 1:
            raise RuntimeError(f"{url}: curl {r.returncode} {r.stderr[:120].decode('utf-8','replace')}")
        time.sleep(2 * (n + 1))


def index_rows(year):
    raw = fetch(INDEX.format(y=year))
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        name = next(n for n in z.namelist() if n.upper().endswith("FD.TXT"))
        text = z.read(name).decode("utf-8", "replace")
    out = []
    for line in text.splitlines()[1:]:
        f = line.split("\t")
        if len(f) < 9 or f[4].strip().upper() != "P":
            continue
        out.append({
            "last": f[1].strip(), "first": f[2].strip(), "suffix": f[3].strip(),
            "state_dst": f[5].strip(), "filing_date": f[7].strip(), "doc_id": f[8].strip(),
        })
    return out


def parse_pdf(data):
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    text = "\n".join((p.extract_text() or "") for p in reader.pages)
    if not text.strip():
        return None, []
    rows = []
    for m in TX.finditer(text):
        ticker, kind, partial, tdate, ndate, lo, hi = m.groups()
        # The owner code sits ahead of the asset; take the nearest one in the
        # 220 characters before the match, else the filer holds it themselves.
        before = text[max(0, m.start() - 220):m.start()]
        owners = OWNER.findall(before)
        rows.append({
            "ticker": ticker.upper(),
            "type": {"P": "Purchase", "S": "Sale", "E": "Exchange"}[kind.upper()],
            "partial": bool(partial),
            "transaction_date": norm_date(tdate),
            "disclosure_date": norm_date(ndate),
            "amount_min": int(lo.replace(",", "")),
            "amount_max": int(hi.replace(",", "")),
            "owner": OWNER_MAP.get(owners[-1].upper(), "self") if owners else "self",
        })
    return text, rows


def norm_date(d):
    m, day, y = d.split("/")
    return f"{int(y):04d}-{int(m):02d}-{int(day):02d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("years", nargs="+", type=int)
    ap.add_argument("--out", default="../data/house-ptr")
    ap.add_argument("--limit", type=int, default=0, help="filings per year, for a dry run")
    ap.add_argument("--sleep", type=float, default=0.25)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    for year in args.years:
        filings = index_rows(year)
        if args.limit:
            filings = filings[: args.limit]
        path = os.path.join(args.out, f"{year}.jsonl")
        ok = empty = failed = txs = 0
        with open(path, "w") as fh:
            for i, f in enumerate(filings, 1):
                try:
                    data = fetch(PDF.format(y=year, doc=f["doc_id"]))
                    text, rows = parse_pdf(data)
                except Exception as e:
                    failed += 1
                    print(f"  {year} {f['doc_id']}: FAIL {e}", file=sys.stderr)
                    continue
                if text is None:
                    empty += 1            # scanned paper filing, no text layer
                elif rows:
                    ok += 1
                    txs += len(rows)
                else:
                    empty += 1            # text, but no transaction shaped like one
                fh.write(json.dumps({
                    "year": year, "doc_id": f["doc_id"], "last": f["last"], "first": f["first"],
                    "suffix": f["suffix"], "state_dst": f["state_dst"], "filing_date": f["filing_date"],
                    "url": PDF.format(y=year, doc=f["doc_id"]),
                    "no_text": text is None, "transactions": rows,
                }) + "\n")
                if i % 50 == 0:
                    print(f"  {year}: {i}/{len(filings)} filings, {txs} transactions", flush=True)
                time.sleep(args.sleep)
        print(f"{year}: {len(filings)} filings -> {ok} parsed, {empty} no usable text, {failed} failed, {txs} transactions -> {path}")


if __name__ == "__main__":
    main()
