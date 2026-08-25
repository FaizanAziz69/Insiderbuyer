import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { B2bLead } from '../entities/b2b-lead.entity';
import { Subscriber } from '../entities/subscriber.entity';
import { B2bController } from './b2b.controller';

@Module({
  imports: [TypeOrmModule.forFeature([B2bLead, Subscriber])],
  controllers: [B2bController],
})
export class B2bModule {}
