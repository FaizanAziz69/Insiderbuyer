import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { InsiderAlertDispatch } from '../entities/insider-alert-dispatch.entity';
import { Subscriber } from '../entities/subscriber.entity';
import { IqsModule } from '../iqs/iqs.module';
import { InsiderAlertsController } from './insider-alerts.controller';
import { InsiderAlertsService } from './insider-alerts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InsiderTransaction, InsiderAlertDispatch, Subscriber]),
    IqsModule,
  ],
  controllers: [InsiderAlertsController],
  providers: [InsiderAlertsService],
  exports: [InsiderAlertsService],
})
export class InsiderAlertsModule {}
