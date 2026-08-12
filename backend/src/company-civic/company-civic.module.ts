import { Module } from '@nestjs/common';
import { CompanyCivicController } from './company-civic.controller';
import { CompanyCivicService } from './company-civic.service';
import { FmpModule } from '../fmp/fmp.module';

@Module({
  // FmpModule: fallback source for geography / exec comp when the SEC filing
  // parser finds nothing (banks and multi-nationals that don't dimension those
  // disclosures in XBRL).
  imports: [FmpModule],
  controllers: [CompanyCivicController],
  providers: [CompanyCivicService],
  exports: [CompanyCivicService],
})
export class CompanyCivicModule {}
