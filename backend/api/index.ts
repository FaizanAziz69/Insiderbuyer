let cachedServer: any = null;

async function bootstrap() {
  if (cachedServer) return cachedServer;
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/app.module');
  const app = await NestFactory.create(AppModule, { cors: true, logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  await app.init();
  cachedServer = app.getHttpAdapter().getInstance();
  return cachedServer;
}

export default async function handler(req: any, res: any) {
  const server = await bootstrap();
  return server(req, res);
}
