#!/usr/bin/env python3
"""
Fill insider_transactions.filedAt from the SEC's quarterly Form 345 bulk data.

WHY A SCRIPT AND NOT AN ENDPOINT. Going forward the ingestion stores the filing
date itself — the SEC client has always carried it and only the column was
missing. This is the one-time repair of the 243,457 rows written before that,
and it reads the SEC's quarterly ZIPs, which is the only source that maps every
accession to its filing date without one HTTP request per accession. At ten
requests a second that would be seven hours; this is a few minutes a quarter.

Each quarterly archive holds SUBMISSION.tsv with ACCESSION_NUMBER and
FILING_DATE. The dumps run about a quarter behind, so the most recent months
are filled by the live ingestion rather than from here.

    python3 backfill-form4-filed-dates.py 2015q1 2026q2
"""
import io
import os
import re
import sys
import urllib.request
import zipfile

import psycopg2

UA = os.environ.get("SEC_USER_AGENT", "InsiderBuying devs@insiderbuying.com")
# 2026q2 was published under a different prefix; both are tried before failing.
BASES = [
    "https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/",
    "https://www.sec.gov/files/datastandardsinnovation/",
]


def quarters(start: str, end: str):
    ys, qs = int(start[:4]), int(start[5])
    ye, qe = int(end[:4]), int(end[5])
    while (ys, qs) <= (ye, qe):
        yield f"{ys}q{qs}"
        qs += 1
        if qs > 4:
            qs, ys = 1, ys + 1


def fetch(quarter: str) -> bytes | None:
    for base in BASES:
        url = f"{base}{quarter}_form345.zip"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except Exception:
            continue
    return None


def filing_dates(blob: bytes) -> dict[str, str]:
    """ACCESSION_NUMBER -> FILING_DATE, read straight out of SUBMISSION.tsv."""
    out: dict[str, str] = {}
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        name = next((n for n in z.namelist() if n.upper().endswith("SUBMISSION.TSV")), None)
        if not name:
            return out
        with z.open(name) as fh:
            header = fh.readline().decode("utf-8", "replace").rstrip("\n").split("\t")
            try:
                i_acc = header.index("ACCESSION_NUMBER")
                i_date = header.index("FILING_DATE")
            except ValueError:
                return out
            for line in fh:
                parts = line.decode("utf-8", "replace").rstrip("\n").split("\t")
                if len(parts) <= max(i_acc, i_date):
                    continue
                acc, d = parts[i_acc].strip(), parts[i_date].strip()
                # The dumps write dates as DD-MON-YYYY; Postgres wants ISO.
                m = re.match(r"^(\d{2})-([A-Z]{3})-(\d{4})$", d.upper())
                if m:
                    mon = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                           "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].index(m.group(2)) + 1
                    d = f"{m.group(3)}-{mon:02d}-{m.group(1)}"
                elif not re.match(r"^\d{4}-\d{2}-\d{2}$", d):
                    continue
                if acc:
                    out[acc] = d
    return out


def main() -> None:
    start, end = (sys.argv[1], sys.argv[2]) if len(sys.argv) > 2 else ("2015q1", "2026q2")
    url = next(
        l.split("=", 1)[1].strip().strip('"')
        for l in open("/opt/insider/app/backend/.env", encoding="utf-8").read().splitlines()
        if l.startswith("DATABASE_URL=")
    )
    conn = psycopg2.connect(url, sslmode="require")
    conn.autocommit = True
    total = 0
    for q in quarters(start, end):
        blob = fetch(q)
        if not blob:
            print(f"{q}: not available", flush=True)
            continue
        dates = filing_dates(blob)
        if not dates:
            print(f"{q}: no SUBMISSION rows", flush=True)
            continue
        # One statement per quarter: the map goes in as arrays and Postgres does
        # the join, rather than a round trip per accession.
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE insider_transactions t
                   SET "filedAt" = m.filed::date
                  FROM (SELECT unnest(%s::text[]) AS acc, unnest(%s::text[]) AS filed) m
                 WHERE t."accessionNumber" = m.acc AND t."filedAt" IS NULL
                """,
                (list(dates.keys()), list(dates.values())),
            )
            n = cur.rowcount
        total += n
        print(f"{q}: {len(dates)} accessions, +{n} rows (running total {total})", flush=True)

    with conn.cursor() as cur:
        cur.execute(
            'SELECT count(*) FILTER (WHERE "filedAt" IS NOT NULL), count(*) FROM insider_transactions'
        )
        got, all_rows = cur.fetchone()
    print(f"\ndone: {got}/{all_rows} rows carry a filing date")


if __name__ == "__main__":
    main()
