import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { User } from '../entities/user.entity';
import { BillingService } from '../billing/billing.service';
import { WatchlistService } from './watchlist.service';

function bearer(header?: string): string {
  if (!header) return '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

@Controller('watchlist')
export class WatchlistController {
  constructor(
    private readonly watchlist: WatchlistService,
    private readonly auth: AuthService,
    private readonly billing: BillingService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private async requireUser(authHeader?: string): Promise<User> {
    const payload = this.auth.verifyToken(bearer(authHeader));
    if (!payload) throw new UnauthorizedException('Sign in to sync your watchlist.');
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Account not found.');
    return user;
  }

  @Get()
  async list(@Headers('authorization') auth?: string) {
    const user = await this.requireUser(auth);
    return {
      tickers: await this.watchlist.list(user.id),
      // Alerts are the premium half of the feature; the page says so, and the
      // client needs to know which half this account gets.
      alertsEnabled: this.billing.isPremium(user),
    };
  }

  @Post()
  async add(@Body() body: { ticker?: string }, @Headers('authorization') auth?: string) {
    const user = await this.requireUser(auth);
    return { tickers: await this.watchlist.add(user.id, body?.ticker || '') };
  }

  @Delete(':ticker')
  async remove(@Param('ticker') ticker: string, @Headers('authorization') auth?: string) {
    const user = await this.requireUser(auth);
    return { tickers: await this.watchlist.remove(user.id, ticker) };
  }

  /** Merge the browser's local list into the account (login hand-off). */
  @Post('sync')
  async sync(@Body() body: { tickers?: string[] }, @Headers('authorization') auth?: string) {
    const user = await this.requireUser(auth);
    return {
      tickers: await this.watchlist.merge(user.id, body?.tickers || []),
      alertsEnabled: this.billing.isPremium(user),
    };
  }
}
