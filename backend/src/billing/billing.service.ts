import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { User } from '../entities/user.entity';
import { EmailFlowsService } from '../email-flows/email-flows.service';

export type Plan = 'monthly' | 'annual';

/** Price catalog — created programmatically in Stripe on first use, matched
 *  by lookup key on every boot after that, so the dashboard needs no manual
 *  setup beyond providing the API key. Amounts follow the subscribe page. */
const CATALOG: Record<Plan, { lookupKey: string; unitAmount: number; interval: 'month' | 'year'; nickname: string }> = {
  monthly: {
    lookupKey: 'ib_premium_monthly',
    unitAmount: 3999, // $39.99 / month
    interval: 'month',
    nickname: 'Insider Premium — Monthly',
  },
  annual: {
    lookupKey: 'ib_premium_annual',
    unitAmount: 19900, // $199 / year
    interval: 'year',
    nickname: 'Insider Premium — Annual',
  },
};

/** What the sales page needs to print a price: the LIVE Stripe amount per
 *  plan. `live` is false when the amounts fell back to the catalog (no Stripe
 *  key, an API error, or prices not created yet). */
export interface BillingPlans {
  configured: boolean;
  live: boolean;
  /** Which Stripe mode the server key is in — the page warns in test mode. */
  mode: 'test' | 'live' | 'unset';
  plans: Array<{
    plan: Plan;
    /** Minor units (cents). */
    amount: number;
    currency: string;
    interval: 'month' | 'year';
  }>;
  /** The $19 Portfolio Intelligence tier, priced live like the others. */
  portfolio?: { amount: number; currency: string; interval: 'month' };
}

/** One-off products (Stripe `mode: 'payment'`), same find-or-create pattern
 *  as the subscription catalog: matched by lookup key, created on first use.
 *  The $3 Top Picks report is the funnel's final downsell (Round-2 brief
 *  Section 2, Step 5). */
const ONE_TIME_CATALOG = {
  'top-picks-report': {
    lookupKey: 'ib_top_picks_report',
    unitAmount: 300, // $3.00 one-time
    productName: 'Stocks You Can Buy Cheaper Than the Insiders Did — Report',
  },
} as const;

export type OneTimeProduct = keyof typeof ONE_TIME_CATALOG;

/** Portfolio Intelligence — $19/month (Round-2 brief, Section 3). A SEPARATE
 *  Stripe product from premium: the brief says it "can stack ON TOP of a
 *  premium sub or be purchased standalone", so it never touches premium
 *  state. */
const PORTFOLIO_PLAN = {
  lookupKey: 'ib_portfolio_monthly',
  unitAmount: 1900, // $19.00 / month
  interval: 'month' as const,
  productName: 'Portfolio Intelligence',
  nickname: 'Portfolio Intelligence — Monthly',
};

const PRODUCT_NAME = 'Insider Premium';
/** Grace window after a period lapses before access is cut, to absorb webhook
 *  delays around renewal. */
const GRACE_MS = 24 * 60 * 60 * 1000;

const FRONTEND_URL = (
  process.env.FRONTEND_URL || 'https://insiderbuying.com'
).replace(/\/$/, '');

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe | null = null;
  /** priceId per plan, resolved once per process. */
  private priceCache: Partial<Record<Plan, string>> | null = null;
  /** priceId per one-off product, resolved once per process. */
  private oneTimePriceCache = new Map<string, string>();
  /** priceId for the $19 portfolio tier. */
  private portfolioPriceId: string | null = null;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @Optional() private readonly emailFlows?: EmailFlowsService,
  ) {}

  // ── Client / catalog bootstrap ─────────────────────────────────────────

  private client(): Stripe {
    if (this.stripe) return this.stripe;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new ServiceUnavailableException(
        'Billing is not configured yet (missing STRIPE_SECRET_KEY).',
      );
    }
    this.stripe = new Stripe(key);
    return this.stripe;
  }

  /** True when a Stripe key is present (used by /billing/status for guests). */
  get configured(): boolean {
    return !!process.env.STRIPE_SECRET_KEY;
  }

  /** test / live, read from the key prefix (not the key itself). */
  get mode(): 'test' | 'live' | 'unset' {
    const key = process.env.STRIPE_SECRET_KEY || '';
    if (key.startsWith('sk_test')) return 'test';
    if (key.startsWith('sk_live')) return 'live';
    return key ? 'live' : 'unset';
  }

  /** Find-or-create the product + both prices; returns priceId per plan.
   *  Lookup keys make this idempotent across deploys and processes. */
  private async ensureCatalog(): Promise<Record<Plan, string>> {
    if (this.priceCache?.monthly && this.priceCache?.annual) {
      return this.priceCache as Record<Plan, string>;
    }
    const stripe = this.client();
    const lookupKeys = Object.values(CATALOG).map((c) => c.lookupKey);
    const existing = await stripe.prices.list({
      lookup_keys: lookupKeys,
      active: true,
      limit: 10,
    });
    const byKey = new Map(existing.data.map((p) => [p.lookup_key, p.id]));

    let productId: string | null =
      (existing.data[0]?.product as string) || null;
    for (const [plan, cfg] of Object.entries(CATALOG) as [Plan, (typeof CATALOG)[Plan]][]) {
      if (byKey.has(cfg.lookupKey)) continue;
      if (!productId) {
        const product = await stripe.products.create({
          name: PRODUCT_NAME,
          description:
            'Full access to Insider Scores, ranked leaderboards, potential upside and every premium dataset on the site.',
          metadata: { app: 'insiderbuyer' },
        });
        productId = product.id;
      }
      const price = await stripe.prices.create({
        product: productId,
        currency: 'usd',
        unit_amount: cfg.unitAmount,
        recurring: { interval: cfg.interval },
        lookup_key: cfg.lookupKey,
        transfer_lookup_key: true,
        nickname: cfg.nickname,
      });
      byKey.set(cfg.lookupKey, price.id);
      this.logger.log(`Created Stripe price ${cfg.lookupKey} → ${price.id}`);
    }

    this.priceCache = {
      monthly: byKey.get(CATALOG.monthly.lookupKey)!,
      annual: byKey.get(CATALOG.annual.lookupKey)!,
    };
    return this.priceCache as Record<Plan, string>;
  }

  /** Live price list for the sales page. The page must never print a figure
   *  Stripe would not charge, so the amounts come from the Stripe prices
   *  themselves (the CATALOG amounts only apply the first time a price is
   *  created) and are cached briefly in-process. */
  private plansCache: { ts: number; data: BillingPlans } | null = null;
  private readonly PLANS_TTL_MS = 10 * 60_000;

  async getPlans(): Promise<BillingPlans> {
    if (this.plansCache && Date.now() - this.plansCache.ts < this.PLANS_TTL_MS) {
      return this.plansCache.data;
    }
    const fallback: BillingPlans = {
      configured: this.configured,
      live: false,
      mode: this.mode,
      portfolio: {
        amount: PORTFOLIO_PLAN.unitAmount,
        currency: 'usd',
        interval: 'month',
      },
      plans: (Object.entries(CATALOG) as [Plan, (typeof CATALOG)[Plan]][]).map(
        ([plan, cfg]) => ({
          plan,
          amount: cfg.unitAmount,
          currency: 'usd',
          interval: cfg.interval,
        }),
      ),
    };
    if (!this.configured) return fallback;
    try {
      const stripe = this.client();
      const existing = await stripe.prices.list({
        lookup_keys: Object.values(CATALOG).map((c) => c.lookupKey),
        active: true,
        limit: 10,
      });
      const plans = (Object.entries(CATALOG) as [Plan, (typeof CATALOG)[Plan]][]).map(
        ([plan, cfg]) => {
          const price = existing.data.find((p) => p.lookup_key === cfg.lookupKey);
          // Stripe's Interval union includes day/week, which this product never
          // uses — fall back to the catalog interval rather than widening it.
          const interval = String(price?.recurring?.interval || '');
          return {
            plan,
            amount: price?.unit_amount ?? cfg.unitAmount,
            currency: price?.currency || 'usd',
            interval: interval === 'month' || interval === 'year' ? interval : cfg.interval,
          };
        },
      );
      // A plan with no live Stripe price yet still reports the catalog amount —
      // that is exactly what checkout would create it at.
      const data: BillingPlans = {
        configured: true,
        live: existing.data.length > 0,
        mode: this.mode,
        plans,
        // The $19 Portfolio Intelligence tier, priced from Stripe too, so the
        // portfolio page can never print a figure checkout would not charge.
        portfolio: await this.getPortfolioPrice(),
      };
      this.plansCache = { ts: Date.now(), data };
      return data;
    } catch (e: any) {
      this.logger.warn(`Stripe price list failed: ${e?.message || e}`);
      return fallback;
    }
  }

  private async ensureCustomer(user: User): Promise<string> {
    const stripe = this.client();
    if (user.stripeCustomerId) {
      // A stored customer id belongs to ONE Stripe mode. Switching the site
      // between test and live keys (client 2026-08-24: test mode until further
      // notice) makes every stored id invalid for the new mode, and Stripe
      // answers "No such customer" — which would break checkout for anyone who
      // had ever opened it. Verify, and mint a fresh customer when it is gone.
      try {
        const existing = await stripe.customers.retrieve(user.stripeCustomerId);
        if (!(existing as { deleted?: boolean }).deleted) return user.stripeCustomerId;
      } catch {
        this.logger.warn(
          `Stripe customer ${user.stripeCustomerId} not found in this mode — creating a new one for ${user.email}`,
        );
      }
    }
    // Guard against duplicates if a previous save failed mid-way.
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${user.id}'`,
      limit: 1,
    });
    const customer =
      found.data[0] ||
      (await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: user.id },
      }));
    user.stripeCustomerId = customer.id;
    await this.users.save(user);
    return customer.id;
  }

  // ── Checkout / portal ──────────────────────────────────────────────────

  async createCheckout(user: User, planRaw?: string): Promise<{ url: string }> {
    const plan: Plan = planRaw === 'annual' ? 'annual' : 'monthly';
    const prices = await this.ensureCatalog();
    const customerId = await this.ensureCustomer(user);
    const stripe = this.client();

    // Already subscribed → send them to the portal instead of double-billing.
    if (await this.hasLiveSubscription(user)) {
      return this.createPortal(user);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: prices[plan], quantity: 1 }],
      // Stripe's dynamic payment methods resolve from the dashboard's payment
      // method settings, and on this account they resolve to NOTHING for USD:
      // every checkout since at least 2026-08-24 06:49 failed with "No valid
      // payment method types for this Checkout Session". Naming card here is
      // the escape hatch Stripe's own error suggests, and it still surfaces
      // Apple Pay and Google Pay (both are card wallets). Set
      // STRIPE_DYNAMIC_PAYMENT_METHODS=true to hand the choice back to the
      // dashboard once payment methods are switched on there.
      ...(process.env.STRIPE_DYNAMIC_PAYMENT_METHODS === 'true'
        ? {}
        : { payment_method_types: ['card' as const] }),
      allow_promotion_codes: true,
      client_reference_id: user.id,
      subscription_data: { metadata: { userId: user.id, plan } },
      success_url: `${FRONTEND_URL}/premium?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/premium?checkout=cancelled`,
    });
    if (!session.url) throw new BadRequestException('Stripe returned no checkout URL.');
    // Opened an order form → arm the Abandoned Order Form Flow. A completed
    // purchase cancels it before the first email is due.
    this.emailFlows?.startFlow('abandoned', user.email, user.name).catch(() => undefined);
    return { url: session.url };
  }

  // ── Portfolio Intelligence ($19/month, Section 3) ─────────────────────

  /** Find-or-create the $19 recurring price; cached per process. */
  private async ensurePortfolioPrice(): Promise<string> {
    if (this.portfolioPriceId) return this.portfolioPriceId;
    const stripe = this.client();
    const existing = await stripe.prices.list({
      lookup_keys: [PORTFOLIO_PLAN.lookupKey],
      active: true,
      limit: 1,
    });
    let priceId = existing.data[0]?.id;
    if (!priceId) {
      const product = await stripe.products.create({
        name: PORTFOLIO_PLAN.productName,
        description:
          'Insider Scores and SMS alerts for every stock in your portfolio.',
      });
      const price = await stripe.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: PORTFOLIO_PLAN.unitAmount,
        recurring: { interval: PORTFOLIO_PLAN.interval },
        lookup_key: PORTFOLIO_PLAN.lookupKey,
        nickname: PORTFOLIO_PLAN.nickname,
      });
      priceId = price.id;
      this.logger.log(`Created Stripe price ${PORTFOLIO_PLAN.lookupKey} → ${priceId}`);
    }
    this.portfolioPriceId = priceId;
    return priceId;
  }

  /** The live $19 figure for the page, so it can never print a price Stripe
   *  would not charge. Falls back to the catalog amount. */
  async getPortfolioPrice(): Promise<{ amount: number; currency: string; interval: 'month' }> {
    if (!this.configured) {
      return { amount: PORTFOLIO_PLAN.unitAmount, currency: 'usd', interval: 'month' };
    }
    try {
      const stripe = this.client();
      const found = await stripe.prices.list({
        lookup_keys: [PORTFOLIO_PLAN.lookupKey],
        active: true,
        limit: 1,
      });
      const price = found.data[0];
      return {
        amount: price?.unit_amount ?? PORTFOLIO_PLAN.unitAmount,
        currency: price?.currency || 'usd',
        interval: 'month',
      };
    } catch {
      return { amount: PORTFOLIO_PLAN.unitAmount, currency: 'usd', interval: 'month' };
    }
  }

  /** Checkout for the portfolio tier. Stacks on premium: a live premium
   *  subscription is left completely alone. */
  async createPortfolioCheckout(user: User): Promise<{ url: string }> {
    if (this.isPortfolioActive(user)) return this.createPortal(user);
    const price = await this.ensurePortfolioPrice();
    const customerId = await this.ensureCustomer(user);
    const stripe = this.client();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      ...(process.env.STRIPE_DYNAMIC_PAYMENT_METHODS === 'true'
        ? {}
        : { payment_method_types: ['card' as const] }),
      allow_promotion_codes: true,
      client_reference_id: user.id,
      subscription_data: { metadata: { userId: user.id, plan: 'portfolio' } },
      success_url: `${FRONTEND_URL}/portfolio-activated?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/portfolio?checkout=cancelled`,
    });
    if (!session.url) throw new BadRequestException('Stripe returned no checkout URL.');
    return { url: session.url };
  }

  /** Is the $19 tier live for this user (with the same renewal grace window
   *  premium uses)? */
  isPortfolioActive(user: User): boolean {
    if (!user.portfolioStatus) return false;
    if (!['active', 'trialing', 'past_due'].includes(user.portfolioStatus)) return false;
    if (!user.portfolioCurrentPeriodEnd) return true;
    return user.portfolioCurrentPeriodEnd.getTime() + GRACE_MS > Date.now();
  }

  // ── One-off products (the $3 report downsell) ──────────────────────────

  /** Find-or-create the one-time price for `product` and return its id. */
  private async ensureOneTimePrice(product: OneTimeProduct): Promise<string> {
    const cached = this.oneTimePriceCache.get(product);
    if (cached) return cached;
    const cfg = ONE_TIME_CATALOG[product];
    const stripe = this.client();
    const existing = await stripe.prices.list({
      lookup_keys: [cfg.lookupKey],
      active: true,
      limit: 1,
    });
    let priceId = existing.data[0]?.id;
    if (!priceId) {
      const prod = await stripe.products.create({
        name: cfg.productName,
        description:
          'One-time PDF report: stocks trading below the average price insiders paid.',
      });
      const price = await stripe.prices.create({
        product: prod.id,
        currency: 'usd',
        unit_amount: cfg.unitAmount,
        lookup_key: cfg.lookupKey,
        nickname: cfg.productName,
      });
      priceId = price.id;
      this.logger.log(`Created Stripe one-time price ${cfg.lookupKey} → ${priceId}`);
    }
    this.oneTimePriceCache.set(product, priceId);
    return priceId;
  }

  /** Guest checkout for a one-off product. No login required — the email
   *  entered on the landing page is the only identity we need, and it is what
   *  the report gets delivered to. */
  async createOneTimeCheckout(
    product: OneTimeProduct,
    email: string | null,
    returnPath: string,
  ): Promise<{ url: string }> {
    const price = await this.ensureOneTimePrice(product);
    const stripe = this.client();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // No email on the landing page → let Stripe collect it at checkout.
      ...(email ? { customer_email: email } : {}),
      line_items: [{ price, quantity: 1 }],
      // Same dashboard-payment-methods escape hatch as the subscription leg.
      ...(process.env.STRIPE_DYNAMIC_PAYMENT_METHODS === 'true'
        ? {}
        : { payment_method_types: ['card' as const] }),
      metadata: { product, ...(email ? { email } : {}) },
      success_url: `${FRONTEND_URL}${returnPath}?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/top-picks-report?purchase=cancelled`,
    });
    if (!session.url) throw new BadRequestException('Stripe returned no checkout URL.');
    return { url: session.url };
  }

  /** Verify a one-off checkout session server-side. Used by the thank-you
   *  page to fulfil WITHOUT depending on the webhook (which is not configured
   *  on this account yet), so delivery cannot silently fail. */
  async verifyOneTimeSession(
    sessionId: string,
  ): Promise<{ paid: boolean; email: string | null; product: string | null }> {
    const stripe = this.client();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid =
      session.payment_status === 'paid' ||
      session.payment_status === 'no_payment_required';
    const email =
      session.customer_details?.email ||
      (session.metadata?.email as string | undefined) ||
      null;
    return {
      paid,
      email: email ? email.trim().toLowerCase() : null,
      product: (session.metadata?.product as string | undefined) || null,
    };
  }

  async createPortal(user: User): Promise<{ url: string }> {
    const stripe = this.client();
    const customerId = await this.ensureCustomer(user);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${FRONTEND_URL}/premium`,
    });
    return { url: session.url };
  }

  // ── Entitlement ────────────────────────────────────────────────────────

  isPremium(user: User): boolean {
    if (!user.premiumStatus) return false;
    if (!['active', 'trialing', 'past_due'].includes(user.premiumStatus)) return false;
    if (!user.premiumCurrentPeriodEnd) return true;
    return (
      new Date(user.premiumCurrentPeriodEnd).getTime() + GRACE_MS > Date.now()
    );
  }

  private async hasLiveSubscription(user: User): Promise<boolean> {
    if (this.isPremium(user)) return true;
    if (!user.stripeSubscriptionId) return false;
    try {
      const sub = await this.client().subscriptions.retrieve(user.stripeSubscriptionId);
      await this.applySubscription(sub, user);
      return this.isPremium(user);
    } catch {
      return false;
    }
  }

  /** Entitlement snapshot for the frontend. Serverless-safe: when the cached
   *  period has lapsed but a subscription exists, re-verify against Stripe so
   *  renewals and cancellations propagate even if a webhook was missed. */
  async status(user: User) {
    const lapsed =
      user.premiumCurrentPeriodEnd &&
      new Date(user.premiumCurrentPeriodEnd).getTime() < Date.now();
    if (user.stripeSubscriptionId && (lapsed || !user.premiumStatus)) {
      try {
        const sub = await this.client().subscriptions.retrieve(user.stripeSubscriptionId);
        user = await this.applySubscription(sub, user);
      } catch {
        /* keep cached state; Stripe may be briefly unreachable */
      }
    }
    return {
      configured: this.configured,
      premium: this.isPremium(user),
      status: user.premiumStatus,
      plan: user.premiumPlan,
      renewsAt: user.premiumCurrentPeriodEnd,
    };
  }

  // ── Post-checkout sync (belt) + webhook (braces) ───────────────────────

  /** Called by the frontend on the success redirect — activates premium
   *  immediately without waiting for the webhook. */
  async syncCheckoutSession(user: User, sessionId?: string) {
    if (!sessionId || !/^cs_/.test(sessionId)) {
      throw new BadRequestException('Valid session_id required.');
    }
    const stripe = this.client();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });
    const ownsSession =
      session.client_reference_id === user.id ||
      (typeof session.customer === 'string' &&
        session.customer === user.stripeCustomerId);
    if (!ownsSession) {
      throw new UnauthorizedException('This checkout session belongs to another account.');
    }
    const sub = session.subscription;
    if (!sub || typeof sub === 'string') {
      return this.status(user);
    }
    await this.applySubscription(sub, user);
    return this.status(user);
  }

  /** Verify + handle a Stripe webhook event. */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripe = this.client();
    let event: Stripe.Event;
    if (secret) {
      if (!rawBody || !signature) {
        throw new BadRequestException('Missing webhook signature.');
      }
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, secret);
      } catch (e) {
        throw new BadRequestException(
          `Webhook signature verification failed: ${(e as Error).message}`,
        );
      }
    } else {
      // No signing secret configured: never trust the payload — re-fetch the
      // event from Stripe by id so a forged request can't grant premium.
      let id: string | undefined;
      try {
        id = JSON.parse((rawBody ?? Buffer.from('{}')).toString('utf8'))?.id;
      } catch {
        id = undefined;
      }
      if (!id || !/^evt_/.test(id)) throw new BadRequestException('Bad event payload.');
      event = await stripe.events.retrieve(id);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && typeof session.subscription === 'string') {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await this.applySubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await this.applySubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as unknown as { subscription?: string | null }).subscription;
        if (typeof subId === 'string') {
          const sub = await stripe.subscriptions.retrieve(subId);
          await this.applySubscription(sub);
        }
        break;
      }
      default:
        break; // uninteresting event type
    }
    return { received: true };
  }

  /** Mirror a Stripe subscription onto our user row (single source of truth
   *  stays Stripe; we cache what the paywall needs). */
  private async applySubscription(sub: Stripe.Subscription, userHint?: User): Promise<User> {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    let user =
      userHint ??
      (await this.users.findOne({ where: { stripeCustomerId: customerId } })) ??
      (sub.metadata?.userId
        ? await this.users.findOne({ where: { id: sub.metadata.userId } })
        : null);
    if (!user) {
      this.logger.warn(`Webhook for unknown customer ${customerId} (sub ${sub.id})`);
      throw new BadRequestException('No matching user for subscription.');
    }

    // current_period_end moved from the subscription to its items in newer
    // API versions — support both shapes.
    const periodEnd =
      (sub as unknown as { current_period_end?: number }).current_period_end ??
      sub.items?.data?.[0]?.current_period_end ??
      null;

    const lookupKey = sub.items?.data?.[0]?.price?.lookup_key || '';

    // The portfolio tier is its own subscription and must never move premium
    // state — note its lookup key also contains "monthly", which is exactly
    // how it would have been mistaken for a premium plan.
    if (
      lookupKey === PORTFOLIO_PLAN.lookupKey ||
      sub.metadata?.plan === 'portfolio'
    ) {
      user.stripeCustomerId = customerId;
      user.portfolioSubscriptionId = sub.id;
      user.portfolioStatus = sub.status;
      user.portfolioCurrentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;
      await this.users.save(user);
      this.logger.log(
        `Portfolio subscription ${sub.id} → user ${user.email}: ${sub.status}`,
      );
      return user;
    }

    const plan: Plan | null = lookupKey.includes('annual')
      ? 'annual'
      : lookupKey.includes('monthly')
        ? 'monthly'
        : ((sub.metadata?.plan as Plan) || null);

    user.stripeCustomerId = customerId;
    user.stripeSubscriptionId = sub.id;
    user.premiumStatus = sub.status;
    user.premiumPlan = plan;
    user.premiumCurrentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;
    await this.users.save(user);
    // Live subscription → stop the sales flows, start the Post-Purchase Flow.
    if (sub.status === 'active' || sub.status === 'trialing') {
      this.emailFlows?.onPurchase(user.email, user.name).catch(() => undefined);
    }
    this.logger.log(
      `Subscription ${sub.id} → user ${user.email}: ${sub.status}${periodEnd ? ` until ${new Date(periodEnd * 1000).toISOString()}` : ''}`,
    );
    return user;
  }
}
