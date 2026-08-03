import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody keeps the unparsed request bytes available for Stripe webhook
  // signature verification (req.rawBody in the billing controller).
  const app = await NestFactory.create(AppModule, { cors: true, rawBody: true });
  app.setGlobalPrefix('api');
  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
}

bootstrap();
