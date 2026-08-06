import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscriber } from '../entities/subscriber.entity';
import { SubscribersController } from './subscribers.controller';
import { EmailFlowsModule } from '../email-flows/email-flows.module';

@Module({
  imports: [TypeOrmModule.forFeature([Subscriber]), EmailFlowsModule],
  controllers: [SubscribersController],
})
export class SubscribersModule {}
