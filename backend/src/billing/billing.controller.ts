import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { User } from '../entities/user.entity';
import { BillingService } from './billing.service';

function bearer(header?: string): string {
  if (!header) return '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly auth: AuthService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private async requireUser(authHeader?: string): Promise<User> {
    const payload = this.auth.verifyToken(bearer(authHeader));
    if (!payload) throw new UnauthorizedException('Sign in to manage your subscription.');
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Account not found.');
    return user;
  }

  /** Entitlement for the signed-in user; safe defaults for guests. */
  @Get('status')
  async status(@Headers('authorization') authHeader?: string) {
    const token = bearer(authHeader);
    if (!token) return { configured: this.billing.configured, premium: false };
    const payload = this.auth.verifyToken(token);
    if (!payload) return { configured: this.billing.configured, premium: false };
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user) return { configured: this.billing.configured, premium: false };
    return this.billing.status(user);
  }

  /** Comp an account by email: grant (premium/portfolio true, the default) or
   *  revoke (explicit false) paid access with no Stripe subscription behind it.
   *  A premiumStatus of 'active' with a null period end is honoured
   *  indefinitely by isPremium(), and status() only re-syncs from Stripe when
   *  a period end has lapsed or no status is set — so a comp sticks until a
   *  real subscription event overwrites it. */
  @UseGuards(AdminTokenGuard)
  @Post('admin/grant')
  async adminGrant(
    @Body()
    body: {
      email?: string;
      premium?: boolean;
      portfolio?: boolean;
      plan?: 'monthly' | 'annual';
    },
  ) {
    const email = (body?.email || '').trim().toLowerCase();
    if (!email) throw new BadRequestException('email is required.');
    const user = await this.users.findOne({ where: { email } });
    if (!user) throw new NotFoundException(`No account exists for ${email}.`);

    if (body.premium === false) {
      user.premiumStatus = null;
      user.premiumPlan = null;
      user.premiumCurrentPeriodEnd = null;
    } else {
      user.premiumStatus = 'active';
      user.premiumPlan = body.plan === 'monthly' ? 'monthly' : 'annual';
      user.premiumCurrentPeriodEnd = null;
    }
    if (body.portfolio === false) {
      user.portfolioStatus = null;
      user.portfolioCurrentPeriodEnd = null;
    } else {
      user.portfolioStatus = 'active';
      user.portfolioCurrentPeriodEnd = null;
    }
    await this.users.save(user);
    return {
      email: user.email,
      premium: this.billing.isPremium(user),
      premiumPlan: user.premiumPlan,
      portfolioStatus: user.portfolioStatus,
    };
  }

  /** Live plan prices for the sales page (public). Read from Stripe so the
   *  page can never advertise a figure checkout would not charge. */
  @Get('plans')
  async plans() {
    return this.billing.getPlans();
  }

  /** Start a subscription checkout; returns the Stripe-hosted page URL. */
  @Post('checkout')
  async checkout(
    @Body() body: { plan?: string; attribution?: Record<string, unknown> },
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.requireUser(authHeader);
    return this.billing.createCheckout(user, body?.plan, body?.attribution);
  }

  /** Activate premium right after the success redirect (webhook backup). */
  @Post('sync')
  async sync(
    @Body() body: { sessionId?: string },
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.requireUser(authHeader);
    return this.billing.syncCheckoutSession(user, body?.sessionId);
  }

  /** Stripe customer portal — manage/cancel the subscription. */
  @Post('portal')
  async portal(@Headers('authorization') authHeader?: string) {
    const user = await this.requireUser(authHeader);
    return this.billing.createPortal(user);
  }

  /** Stripe webhook receiver. Signature-verified when STRIPE_WEBHOOK_SECRET
   *  is set; otherwise events are re-fetched from Stripe by id. */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.billing.handleWebhook(req.rawBody, signature);
  }
}
