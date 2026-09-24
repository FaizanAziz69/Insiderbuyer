import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { PremiumAccessService } from './premium-access';

/** Entitlement lookup for any controller that has to shape its payload by
 *  subscription. Import it; don't re-wire Auth + Billing + the user repo in
 *  each module, which is how two slightly different "is this user premium?"
 *  answers end up living in one codebase. */
@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule, BillingModule],
  providers: [PremiumAccessService],
  exports: [PremiumAccessService],
})
export class PremiumAccessModule {}
