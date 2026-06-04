import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../entities/company.entity';
import { NewsModule } from '../news/news.module';
import { CtaController } from './cta.controller';
import { CtaService } from './cta.service';

@Module({
  imports: [TypeOrmModule.forFeature([Company]), NewsModule],
  controllers: [CtaController],
  providers: [CtaService],
  exports: [CtaService],
})
export class CtaModule {}
