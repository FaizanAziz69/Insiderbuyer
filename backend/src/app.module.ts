import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { InsiderTransaction } from './entities/insider-transaction.entity';
import { IqsScore } from './entities/iqs-score.entity';
import { ProcessedFiling } from './entities/processed-filing.entity';
import { CompaniesModule } from './companies/companies.module';
import { TransactionsModule } from './transactions/transactions.module';
import { IqsModule } from './iqs/iqs.module';
import { IngestionModule } from './ingestion/ingestion.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    (() => {
      const dbHost = process.env.DB_HOST || 'localhost';
      const isLocal =
        !process.env.DATABASE_URL && (dbHost === 'localhost' || dbHost === '127.0.0.1');
      const sslDisabled = process.env.DB_SSL === 'false';
      const useSsl = !isLocal && !sslDisabled;
      return TypeOrmModule.forRoot({
        type: 'postgres',
        ...(process.env.DATABASE_URL
          ? { url: process.env.DATABASE_URL }
          : {
              host: dbHost,
              port: Number(process.env.DB_PORT) || 5432,
              username: process.env.DB_USER || 'iqs_user',
              password: process.env.DB_PASSWORD || 'iqs_password',
              database: process.env.DB_NAME || 'iqs_db',
            }),
        ssl: useSsl ? { rejectUnauthorized: false } : false,
        entities: [Company, InsiderTransaction, IqsScore, ProcessedFiling],
        synchronize: true,
        logging: false,
      });
    })(),
    CompaniesModule,
    TransactionsModule,
    IqsModule,
    IngestionModule,
  ],
})
export class AppModule {}
