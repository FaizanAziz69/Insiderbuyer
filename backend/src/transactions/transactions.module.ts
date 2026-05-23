import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsiderTransaction } from '../entities/insider-transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InsiderTransaction])],
  exports: [TypeOrmModule],
})
export class TransactionsModule {}
