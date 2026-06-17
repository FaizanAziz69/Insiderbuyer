import { Module } from '@nestjs/common';
import { IpoController } from './ipo.controller';
import { IpoService } from './ipo.service';

@Module({
  controllers: [IpoController],
  providers: [IpoService],
  exports: [IpoService],
})
export class IpoModule {}
