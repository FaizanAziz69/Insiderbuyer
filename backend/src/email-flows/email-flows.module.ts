import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailFlowState } from '../entities/email-flow-state.entity';
import { Subscriber } from '../entities/subscriber.entity';
import { IqsModule } from '../iqs/iqs.module';
import { EmailFlowsService } from './email-flows.service';
import { EmailFlowsController } from './email-flows.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmailFlowState, Subscriber]), IqsModule],
  providers: [EmailFlowsService],
  controllers: [EmailFlowsController],
  exports: [EmailFlowsService],
})
export class EmailFlowsModule {}
