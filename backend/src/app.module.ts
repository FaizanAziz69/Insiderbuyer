import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { InsiderTransaction } from './entities/insider-transaction.entity';
import { IqsScore } from './entities/iqs-score.entity';
import { ProcessedFiling } from './entities/processed-filing.entity';
import { CongressionalTransaction } from './entities/congressional-transaction.entity';
import { Subscriber } from './entities/subscriber.entity';
import { BlogPost } from './entities/blog-post.entity';
import { EarningsEvent } from './entities/earnings-event.entity';
import { User } from './entities/user.entity';
import { SentimentScore } from './entities/sentiment-score.entity';
import {
  BacktestCache,
  PriceHistoryCache,
} from './entities/backtest-cache.entity';
import { AnalystPriceTarget } from './entities/analyst-target.entity';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { TransactionsModule } from './transactions/transactions.module';
import { IqsModule } from './iqs/iqs.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { NewsModule } from './news/news.module';
import { CongressionalModule } from './congressional/congressional.module';
import { CompanyCivicModule } from './company-civic/company-civic.module';
import { IndicesModule } from './indices/indices.module';
import { StockListsModule } from './stock-lists/stock-lists.module';
import { SubscribersModule } from './subscribers/subscribers.module';
import { MarketStatsModule } from './market-stats/market-stats.module';
import { BacktestModule } from './backtest/backtest.module';
import { AnalystsModule } from './analysts/analysts.module';
import { EarningsModule } from './earnings/earnings.module';
import { IpoModule } from './ipo/ipo.module';
import { EarningsPerfModule } from './earnings-perf/earnings-perf.module';
import { CtaModule } from './cta/cta.module';
import { ChatModule } from './chat/chat.module';
import { ContentModule } from './content/content.module';
import { SocialModule } from './social/social.module';
import { ReportsModule } from './reports/reports.module';
import { BillingModule } from './billing/billing.module';
import { ReportLead } from './entities/report-lead.entity';
import { EmailFlowsModule } from './email-flows/email-flows.module';
import { GovContractsModule } from './gov-contracts/gov-contracts.module';
import { EmailFlowState } from './entities/email-flow-state.entity';
import { InsiderProfile } from './entities/insider-profile.entity';
import { HistoricalInsiderBuy } from './entities/historical-insider-buy.entity';
import { GovContractCache } from './entities/gov-contract-cache.entity';

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
      // On Vercel every cold start is a fresh process, so anything that runs at
      // bootstrap runs per invocation — schema sync and long connect retries are
      // pure waste there, and they burn the Postgres data-transfer allowance.
      const serverless = !!process.env.VERCEL;
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
        entities: [
          Company,
          InsiderTransaction,
          IqsScore,
          ProcessedFiling,
          CongressionalTransaction,
          Subscriber,
          BlogPost,
          EarningsEvent,
          User,
          SentimentScore,
          PriceHistoryCache,
          BacktestCache,
          AnalystPriceTarget,
          ReportLead,
          EmailFlowState,
          InsiderProfile,
          HistoricalInsiderBuy,
          GovContractCache,
        ],
        // Schema sync issues a catalog query per entity on every boot. Fine
        // locally; on serverless it repeats forever. Set DB_SYNC=true for a
        // one-off migration against a fresh database.
        synchronize: process.env.DB_SYNC === 'true' || !serverless,
        logging: false,
        // Default is 10 attempts × 3s. When the database refuses connections
        // (quota exhausted, paused compute) that stalls ~30s and the platform
        // kills the function with an opaque FUNCTION_INVOCATION_FAILED instead
        // of letting Nest return a real error.
        retryAttempts: serverless ? 1 : 10,
        retryDelay: serverless ? 500 : 3000,
        extra: {
          // A serverless instance handles one request at a time.
          max: serverless ? 2 : 10,
          connectionTimeoutMillis: serverless ? 5000 : 30000,
          idleTimeoutMillis: 10000,
        },
      });
    })(),
    CompaniesModule,
    TransactionsModule,
    CongressionalModule,
    CompanyCivicModule,
    IqsModule,
    IngestionModule,
    NewsModule,
    IndicesModule,
    MarketStatsModule,
    BacktestModule,
    AnalystsModule,
    EarningsModule,
    IpoModule,
    EarningsPerfModule,
    StockListsModule,
    SubscribersModule,
    CtaModule,
    ChatModule,
    ContentModule,
    SocialModule,
    ReportsModule,
    BillingModule,
    AuthModule,
    EmailFlowsModule,
    GovContractsModule,
  ],
})
export class AppModule {}
