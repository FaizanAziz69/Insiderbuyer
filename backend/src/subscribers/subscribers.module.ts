import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscriber } from '../entities/subscriber.entity';
import { SubscribersController } from './subscribers.controller';
import { EmailFlowsModule } from '../email-flows/email-flows.module';
import { InsiderAlertsModule } from '../insider-alerts/insider-alerts.module';
import { ReportsModule } from '../reports/reports.module';
import { FulfilmentService } from './fulfilment.service';
import { FreeReportModule } from '../free-report/free-report.module';

@Module({
  imports: [TypeOrmModule.forFeature([Subscriber]), EmailFlowsModule, InsiderAlertsModule, ReportsModule, FreeReportModule],
  providers: [FulfilmentService],
  controllers: [SubscribersController],
})
export class SubscribersModule {}
