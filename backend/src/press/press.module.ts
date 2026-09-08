import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PressOrder } from '../entities/press-order.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { BillingModule } from '../billing/billing.module';
import { PressController } from './press.controller';
import { PressService } from './press.service';

@Module({
  imports: [TypeOrmModule.forFeature([PressOrder, InsiderTransaction]), BillingModule],
  controllers: [PressController],
  providers: [PressService],
})
export class PressModule {}
