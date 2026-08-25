import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { EmailFlowsModule } from '../email-flows/email-flows.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule, EmailFlowsModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
