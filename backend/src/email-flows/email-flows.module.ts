import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailFlowState } from '../entities/email-flow-state.entity';
import { EmailFlowsService } from './email-flows.service';
import { EmailFlowsController } from './email-flows.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmailFlowState])],
  providers: [EmailFlowsService],
  controllers: [EmailFlowsController],
  exports: [EmailFlowsService],
})
export class EmailFlowsModule {}
