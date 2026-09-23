import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { User } from '../entities/user.entity';
import { BillingService } from '../billing/billing.service';
import { EmailFlowsService } from '../email-flows/email-flows.service';
import { SIGNOFF_ALERTS } from '../email-flows/content/types';

/**
 * "Alerts on a tracked person's new filing" — Brief v7 §5, listed under
 * Premium.
 *
 * A reader follows a member, and when that member's next disclosure lands they
 * hear about it. Three things make this honest rather than noisy:
 *
 *  - it fires on the DISCLOSURE, not on the trade. A periodic transaction
 *    report can arrive 45 days after the trade, and telling someone about a
 *    six-week-old purchase as though it were news would misrepresent it, so
 *    the email states both dates plainly.
 *  - a member who files twenty rows at once produces one email, not twenty.
 *  - every send is recorded, so a restart, a re-ingest or an amendment cannot
 *    send the same filing twice.
 */

@Injectable()
export class FilingAlertsService {
  private readonly log = new Logger(FilingAlertsService.name);

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly billing: BillingService,
    private readonly emailFlows: EmailFlowsService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    await this.q(`CREATE TABLE IF NOT EXISTS wt_follows (
      user_id uuid NOT NULL,
      bioguide text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, bioguide)
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS wt_follows_member_idx ON wt_follows (bioguide)`);
    await this.q(`CREATE TABLE IF NOT EXISTS wt_alerts_sent (
      user_id uuid NOT NULL,
      bioguide text NOT NULL,
      disclosure_date date NOT NULL,
      sent_at timestamptz NOT NULL DEFAULT now(),
      trades int NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, bioguide, disclosure_date)
    )`);
  }

  async follow(userId: string, bioguide: string): Promise<{ ok: boolean }> {
    await this.ensureTables();
    await this.q(`INSERT INTO wt_follows (user_id, bioguide) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, bioguide]);
    return { ok: true };
  }

  async unfollow(userId: string, bioguide: string): Promise<{ ok: boolean }> {
    await this.ensureTables();
    await this.q(`DELETE FROM wt_follows WHERE user_id = $1 AND bioguide = $2`, [userId, bioguide]);
    return { ok: true };
  }

  async following(userId: string): Promise<any[]> {
    await this.ensureTables();
    return this.q<any[]>(
      `SELECT f.bioguide, coalesce(m.fmp_name, m.name) AS name, m.party, m.chamber, m.state, m.photo_url,
              to_char(s.last_trade,'YYYY-MM-DD') AS last_trade
       FROM wt_follows f
       JOIN wt_members m ON m.bioguide = f.bioguide
       LEFT JOIN wt_member_stats s ON s.bioguide = f.bioguide
       WHERE f.user_id = $1 ORDER BY m.last`,
      [userId],
    );
  }

  /**
   * One pass: for each follower, any filing dated since their last alert that
   * they have not been told about.
   */
  async dispatch(opts: { lookbackDays?: number; dryRun?: boolean } = {}): Promise<any> {
    await this.ensureTables();
    const lookback = opts.lookbackDays ?? 7;
    const rows = await this.q<any[]>(
      `SELECT f.user_id, f.bioguide, to_char(t.disclosure_date,'YYYY-MM-DD') AS disclosure_date,
              count(*)::int AS trades,
              min(to_char(t.transaction_date,'YYYY-MM-DD')) AS first_trade,
              max(to_char(t.transaction_date,'YYYY-MM-DD')) AS last_trade,
              coalesce(m.fmp_name, m.name) AS member,
              sum(CASE WHEN t.side = 'buy' THEN 1 ELSE 0 END)::int AS buys,
              sum(CASE WHEN t.side = 'sell' THEN 1 ELSE 0 END)::int AS sells,
              string_agg(DISTINCT t.ticker, ', ' ORDER BY t.ticker) FILTER (WHERE t.ticker IS NOT NULL) AS tickers
       FROM wt_follows f
       JOIN wt_trades t ON t.bioguide = f.bioguide
       JOIN wt_members m ON m.bioguide = f.bioguide
       LEFT JOIN wt_alerts_sent a
         ON a.user_id = f.user_id AND a.bioguide = f.bioguide AND a.disclosure_date = t.disclosure_date
       WHERE t.disclosure_date IS NOT NULL
         AND t.disclosure_date >= current_date - $1::int
         AND a.user_id IS NULL
       GROUP BY f.user_id, f.bioguide, t.disclosure_date, m.fmp_name, m.name
       ORDER BY t.disclosure_date DESC`,
      [lookback],
    );
    if (!rows.length) return { candidates: 0, sent: 0, skippedNotPremium: 0 };

    let sent = 0;
    let notPremium = 0;
    for (const r of rows) {
      const user = await this.users.findOne({ where: { id: r.user_id } });
      if (!user?.email) continue;
      // §5 lists this under Premium, so entitlement is checked at send time
      // rather than only at subscribe time.
      let premium = false;
      try {
        premium = !!(await this.billing.status(user)).premium;
      } catch {
        premium = false;
      }
      if (!premium) {
        notPremium++;
        continue;
      }
      if (opts.dryRun) {
        sent++;
        continue;
      }
      const lag =
        r.last_trade && r.disclosure_date
          ? Math.round((new Date(r.disclosure_date).getTime() - new Date(r.last_trade).getTime()) / 86_400_000)
          : null;
      const what =
        r.buys && r.sells ? `${r.buys} purchase${r.buys === 1 ? '' : 's'} and ${r.sells} sale${r.sells === 1 ? '' : 's'}`
          : r.buys ? `${r.buys} purchase${r.buys === 1 ? '' : 's'}`
            : `${r.sells} sale${r.sells === 1 ? '' : 's'}`;
      const slug = encodeURIComponent(r.member);
      await this.emailFlows.sendOneOff(user.email, {
        id: `wt-${r.bioguide}-${r.disclosure_date}`,
        offsetMinutes: 0,
        brand: 'INSIDER ALERTS',
        subjects: [{ subject: `${r.member} just disclosed ${what}`, preview: r.tickers ? `In ${r.tickers}.` : undefined }],
        body: [
          `<p><strong>${r.member}</strong> filed a periodic transaction report on ${r.disclosure_date}, covering ${what}${r.tickers ? ` in ${r.tickers}` : ''}.</p>`,
          // The lag is stated rather than buried: a disclosure is not the
          // same event as the trade, and a reader acting on it should know.
          `<p>The trades themselves were dated ${r.first_trade === r.last_trade ? r.first_trade : `${r.first_trade} to ${r.last_trade}`}${lag != null ? `, disclosed ${lag} day${lag === 1 ? '' : 's'} later` : ''}. Members have up to 45 days to file, so a disclosure is news about a trade that has already happened.</p>`,
          `<p><a href="https://insiderbuying.com/politicians/${slug}" style="color:#e02b2b;font-weight:600;text-decoration:underline;">See the filing and what it does to their portfolio</a></p>`,
        ],
        signoffTitle: SIGNOFF_ALERTS,
        footerKind: 'requested',
      });
      await this.q(
        `INSERT INTO wt_alerts_sent (user_id, bioguide, disclosure_date, trades) VALUES ($1,$2,$3::date,$4)
         ON CONFLICT DO NOTHING`,
        [r.user_id, r.bioguide, r.disclosure_date, r.trades],
      );
      sent++;
    }
    this.log.log(`tracker filing alerts: ${rows.length} candidates, ${sent} sent, ${notPremium} skipped (not premium)`);
    return { candidates: rows.length, sent, skippedNotPremium: notPremium };
  }

  @Cron('50 7 * * *')
  async nightly(): Promise<void> {
    if (process.env.VERCEL) return;
    try {
      await this.dispatch({});
    } catch (e: any) {
      this.log.error(`filing alerts failed: ${e?.message || e}`);
    }
  }

  async status(): Promise<any> {
    await this.ensureTables();
    const [f] = await this.q<any[]>(`SELECT count(*)::int AS follows, count(DISTINCT user_id)::int AS users, count(DISTINCT bioguide)::int AS members FROM wt_follows`);
    const [s] = await this.q<any[]>(`SELECT count(*)::int AS sent, to_char(max(sent_at),'YYYY-MM-DD HH24:MI') AS last_sent FROM wt_alerts_sent`);
    return { follows: f, alerts: s };
  }
}
