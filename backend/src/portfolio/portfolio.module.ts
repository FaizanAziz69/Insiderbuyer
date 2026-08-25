import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { PortfolioHolding } from '../entities/portfolio-holding.entity';
import { PortfolioAlert } from '../entities/portfolio-alert.entity';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { SmsService } from './sms.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PortfolioHolding, PortfolioAlert]),
    AuthModule,
    BillingModule,
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService, SmsService],
  exports: [PortfolioService, SmsService],
})
export class PortfolioModule {}
