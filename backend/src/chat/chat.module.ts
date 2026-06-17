import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { IqsModule } from '../iqs/iqs.module';
import { MarketStatsModule } from '../market-stats/market-stats.module';

@Module({
  imports: [IqsModule, MarketStatsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
