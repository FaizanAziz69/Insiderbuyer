import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { DataAccessRequest } from './entities/data-access-request.entity';
import { InsiderTransaction } from './entities/insider-transaction.entity';
import { IqsScore } from './entities/iqs-score.entity';
import { ProcessedFiling } from './entities/processed-filing.entity';
import { CongressionalTransaction } from './entities/congressional-transaction.entity';
import { CqsScore } from './entities/cqs-score.entity';
import { CqsModule } from './cqs/cqs.module';
import { Subscriber } from './entities/subscriber.entity';
import { BlogPost } from './entities/blog-post.entity';
import { StoryPitch } from './entities/story-pitch.entity';
import { EarningsEvent } from './entities/earnings-event.entity';
import { User } from './entities/user.entity';
import { PortfolioHolding } from './entities/portfolio-holding.entity';
import { PortfolioAlert } from './entities/portfolio-alert.entity';
import { B2bLead } from './entities/b2b-lead.entity';
import { HotSectorsCache } from './entities/hot-sectors-cache.entity';
import { EodClose } from './entities/eod-close.entity';
import { EaiCache } from './entities/eai-cache.entity';
import { InsiderAlertDispatch } from './entities/insider-alert-dispatch.entity';
import { WatchlistItem } from './entities/watchlist-item.entity';
import { ScreenerUniverseCache } from './entities/screener-universe-cache.entity';
import { AppSetting } from './entities/app-setting.entity';
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
import { EaiModule } from './eai/eai.module';
import { InsiderAlertsModule } from './insider-alerts/insider-alerts.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { ScreenerModule } from './screener/screener.module';
import { CtaModule } from './cta/cta.module';
import { ChatModule } from './chat/chat.module';
import { ContentModule } from './content/content.module';
import { DailyDeskModule } from './content/daily-desk/daily-desk.module';
import { SocialModule } from './social/social.module';
import { ReportsModule } from './reports/reports.module';
import { BillingModule } from './billing/billing.module';
import { TopPicksModule } from './top-picks/top-picks.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { B2bModule } from './b2b/b2b.module';
import { ReportLead } from './entities/report-lead.entity';
import { EmailFlowsModule } from './email-flows/email-flows.module';
import { PressModule } from './press/press.module';
import { BannersModule } from './banners/banners.module';
import { PressOrder } from './entities/press-order.entity';
import { SiteBanner } from './entities/site-banner.entity';
import { GovContractsModule } from './gov-contracts/gov-contracts.module';
import { InvestorsModule } from './investors/investors.module';
import { Iqs2Module } from './iqs2/iqs2.module';
import { DataArticlesModule } from './data-articles/data-articles.module';
import { MarketUniverseModule } from './market-universe/market-universe.module';
import { LegislativeCalendarModule } from './legislative-calendar/legislative-calendar.module';
import { DeInsidersModule } from './de-insiders/de-insiders.module';
import { PromoterModule } from './promoter/promoter.module';
import { DataAccessModule } from './data-access/data-access.module';
import { ProductUpdatesModule } from './product-updates/product-updates.module';
import { FreeReportModule } from './free-report/free-report.module';
import { CongressTradesModule } from './congress-trades/congress-trades.module';
import { WealthTrackerModule } from './wealth-tracker/wealth-tracker.module';
import { QuantModule } from './quant/quant.module';
import { EmailFlowState } from './entities/email-flow-state.entity';
import { InsiderProfile } from './entities/insider-profile.entity';
import { HistoricalInsiderBuy } from './entities/historical-insider-buy.entity';
import { GovContractCache } from './entities/gov-contract-cache.entity';
import { PeRatioCache } from './entities/pe-ratio-cache.entity';
import { MarketProfileSnapshot } from './entities/market-profile.entity';
import { FundamentalsCache } from './entities/fundamentals-cache.entity';
import { BubblesCache, BubblesTickerMeta } from './entities/bubbles-cache.entity';
import { BubblesModule } from './bubbles/bubbles.module';
import { VisualizersModule } from './visualizers/visualizers.module';
import {
  VizBiotechCatalyst,
  VizBiotechProfile,
  VizBiotechTrial,
  VizContractAward,
  VizCuratedMarket,
  VizEntity,
  VizGovRecipient,
  VizMarketContract,
  VizMiningProject,
  VizPayloadCache,
} from './entities/visualizer.entity';

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
          DataAccessRequest,
          Company,
          InsiderTransaction,
          IqsScore,
          ProcessedFiling,
          CongressionalTransaction,
          CqsScore,
          Subscriber,
          PressOrder,
          SiteBanner,
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
          PeRatioCache,
          MarketProfileSnapshot,
          FundamentalsCache,
          BubblesCache,
          BubblesTickerMeta,
          PortfolioHolding,
          PortfolioAlert,
          B2bLead,
          HotSectorsCache,
          EodClose,
          EaiCache,
          InsiderAlertDispatch,
          WatchlistItem,
          ScreenerUniverseCache,
          AppSetting,
          StoryPitch,
          VizEntity,
          VizCuratedMarket,
          VizMarketContract,
          VizGovRecipient,
          VizContractAward,
          VizMiningProject,
          VizBiotechCatalyst,
          VizBiotechTrial,
          VizBiotechProfile,
          VizPayloadCache,
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
    BubblesModule,
    VisualizersModule,
    BacktestModule,
    AnalystsModule,
    EarningsModule,
    IpoModule,
    EarningsPerfModule,
    EaiModule,
    WatchlistModule,
    InsiderAlertsModule,
    ScreenerModule,
    StockListsModule,
    SubscribersModule,
    CtaModule,
    ChatModule,
    ContentModule,
    DailyDeskModule,
    SocialModule,
    ReportsModule,
    BillingModule,
    TopPicksModule,
    PortfolioModule,
    B2bModule,
    AuthModule,
    EmailFlowsModule,
    PressModule,
    BannersModule,
    GovContractsModule,
    InvestorsModule,
    Iqs2Module,
    DataArticlesModule,
    MarketUniverseModule,
    LegislativeCalendarModule,
    DeInsidersModule,
    PromoterModule,
    DataAccessModule,
    ProductUpdatesModule,
    FreeReportModule,
    CongressTradesModule,
    WealthTrackerModule,
    QuantModule,
    CqsModule,
  ],
})
export class AppModule {}
