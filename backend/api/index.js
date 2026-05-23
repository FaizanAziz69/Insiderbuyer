let cachedServer;
let initError;

async function bootstrap() {
  if (cachedServer) return cachedServer;
  if (initError) throw initError;
  try {
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('../dist/app.module');
    const app = await NestFactory.create(AppModule, {
      cors: true,
      logger: ['error', 'warn', 'log'],
    });
    app.setGlobalPrefix('api');
    await app.init();
    cachedServer = app.getHttpAdapter().getInstance();
    return cachedServer;
  } catch (err) {
    initError = err;
    throw err;
  }
}

module.exports = async (req, res) => {
  try {
    const server = await bootstrap();
    return server(req, res);
  } catch (err) {
    console.error('[function-error]', err && err.stack ? err.stack : err);
    res.status(500).json({
      error: 'Function init failed',
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack.split('\n').slice(0, 8) : undefined,
    });
  }
};
