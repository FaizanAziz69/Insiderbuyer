import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { Subscriber } from '../entities/subscriber.entity';
import { BillingModule } from '../billing/billing.module';
import { SubscribersModule } from '../subscribers/subscribers.module';
import { TopPicksController } from './top-picks.controller';
import { TopPicksService } from './top-picks.service';

@Module({
  imports: [TypeOrmModule.forFeature([InsiderTransaction, Subscriber]), BillingModule, SubscribersModule],
  controllers: [TopPicksController],
  providers: [TopPicksService],
})
export class TopPicksModule {}
