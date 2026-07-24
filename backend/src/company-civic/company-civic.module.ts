import { Module } from '@nestjs/common';
import { CompanyCivicController } from './company-civic.controller';
import { CompanyCivicService } from './company-civic.service';

@Module({
  controllers: [CompanyCivicController],
  providers: [CompanyCivicService],
  exports: [CompanyCivicService],
})
export class CompanyCivicModule {}
