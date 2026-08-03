import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
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

  /** Start a subscription checkout; returns the Stripe-hosted page URL. */
  @Post('checkout')
  async checkout(
    @Body() body: { plan?: string },
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.requireUser(authHeader);
    return this.billing.createCheckout(user, body?.plan);
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
