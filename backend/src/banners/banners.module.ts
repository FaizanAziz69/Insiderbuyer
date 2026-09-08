import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteBanner } from '../entities/site-banner.entity';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';

@Module({
  imports: [TypeOrmModule.forFeature([SiteBanner])],
  controllers: [BannersController],
  providers: [BannersService],
})
export class BannersModule {}
