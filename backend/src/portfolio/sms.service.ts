import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * Twilio SMS transport for the Portfolio Intelligence tier (Round-2 brief,
 * Section 3: "Integrate with Twilio").
 *
 * Fully written, and inert until ops sets:
 *   TWILIO_ACCOUNT_SID=AC…
 *   TWILIO_AUTH_TOKEN=…
 *   TWILIO_FROM_NUMBER=+1…            (or)
 *   TWILIO_MESSAGING_SERVICE_SID=MG…  (preferred for alert volume)
 *
 * With no credentials `send()` returns { sent: false } instead of throwing, so
 * the alert engine still records what it *would* have sent — the moment keys
 * land, the same code delivers with no further changes.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private warned = false;

  private get sid(): string {
    return process.env.TWILIO_ACCOUNT_SID || '';
  }
  private get token(): string {
    return process.env.TWILIO_AUTH_TOKEN || '';
  }
  private get from(): string {
    return process.env.TWILIO_FROM_NUMBER || '';
  }
  private get messagingServiceSid(): string {
    return process.env.TWILIO_MESSAGING_SERVICE_SID || '';
  }

  get configured(): boolean {
    return !!this.sid && !!this.token && !!(this.from || this.messagingServiceSid);
  }

  /**
   * Normalise to E.164, which is the only format Twilio accepts. A 10-digit
   * input is treated as US/Canada (+1) — the tier is sold in USD to a US
   * audience; anything else must arrive with its own country code.
   */
  normalizePhone(raw: string): string | null {
    const digits = (raw || '').replace(/[^\d+]/g, '');
    if (!digits) return null;
    if (digits.startsWith('+')) {
      return /^\+\d{8,15}$/.test(digits) ? digits : null;
    }
    const bare = digits.replace(/\D/g, '');
    if (bare.length === 10) return `+1${bare}`;
    if (bare.length === 11 && bare.startsWith('1')) return `+${bare}`;
    return bare.length >= 8 && bare.length <= 15 ? `+${bare}` : null;
  }

  /** Send one message. Never throws — delivery failure must not break the
   *  request or the alert loop that called it. */
  async send(to: string, body: string): Promise<{ sent: boolean; error?: string }> {
    if (!this.configured) {
      if (!this.warned) {
        this.warned = true;
        this.logger.log(
          'Twilio not configured (TWILIO_ACCOUNT_SID / _AUTH_TOKEN / _FROM_NUMBER) — ' +
            'portfolio alerts are recorded but not delivered.',
        );
      }
      this.logger.debug(`[sms suppressed] ${to}: ${body}`);
      return { sent: false, error: 'twilio-not-configured' };
    }
    try {
      const params = new URLSearchParams({ To: to, Body: body });
      if (this.messagingServiceSid) {
        params.set('MessagingServiceSid', this.messagingServiceSid);
      } else {
        params.set('From', this.from);
      }
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`,
        params.toString(),
        {
          auth: { username: this.sid, password: this.token },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15_000,
        },
      );
      this.logger.log(`SMS → ${to.slice(0, 5)}••••: ${body.slice(0, 48)}…`);
      return { sent: true };
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (e instanceof Error ? e.message : String(e));
      this.logger.warn(`SMS failed for ${to.slice(0, 5)}••••: ${msg}`);
      return { sent: false, error: msg };
    }
  }

  /** The confirmation the brief asks for right after the number is collected. */
  async sendConfirmation(to: string): Promise<{ sent: boolean; error?: string }> {
    return this.send(
      to,
      'InsiderBuying.com: your portfolio alerts are on. ' +
        "We'll text you the moment insiders make a move in a stock you own. " +
        'Reply STOP to unsubscribe.',
    );
  }
}
