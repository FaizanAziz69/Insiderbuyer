import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WatchlistItem } from '../entities/watchlist-item.entity';
import { User } from '../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { WatchlistController } from './watchlist.controller';
import { WatchlistService } from './watchlist.service';

@Module({
  imports: [TypeOrmModule.forFeature([WatchlistItem, User]), AuthModule, BillingModule],
  controllers: [WatchlistController],
  providers: [WatchlistService],
  exports: [WatchlistService],
})
export class WatchlistModule {}
