import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataAccessRequest } from '../entities/data-access-request.entity';
import { EmailFlowsModule } from '../email-flows/email-flows.module';
import { DataAccessController } from './data-access.controller';
import { DataAccessService } from './data-access.service';

@Module({
  imports: [TypeOrmModule.forFeature([DataAccessRequest]), EmailFlowsModule],
  controllers: [DataAccessController],
  providers: [DataAccessService],
  exports: [DataAccessService],
})
export class DataAccessModule {}
