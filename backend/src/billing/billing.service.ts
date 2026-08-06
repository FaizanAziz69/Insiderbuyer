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

const PRODUCT_NAME = 'Insider Premium';
/** Grace window after a period lapses before access is cut, to absorb webhook
 *  delays around renewal. */
const GRACE_MS = 24 * 60 * 60 * 1000;

const FRONTEND_URL = (
  process.env.FRONTEND_URL || 'https://insiderbuyer-hwrc.vercel.app'
).replace(/\/$/, '');

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe | null = null;
  /** priceId per plan, resolved once per process. */
  private priceCache: Partial<Record<Plan, string>> | null = null;

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

  private async ensureCustomer(user: User): Promise<string> {
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const stripe = this.client();
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
