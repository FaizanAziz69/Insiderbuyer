import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { PressService, UploadedKit } from './press.service';

@Controller('press')
export class PressController {
  constructor(private readonly press: PressService) {}

  /** Stripe Checkout for a package (Brief v3 §6). */
  @Post('checkout')
  checkout(@Body() body: { package?: string; attribution?: Record<string, unknown> }) {
    return this.press.checkout(body?.package || '', body?.attribution);
  }

  /** Intake page arrival: verify the paid session, return the order. */
  @Get('orders/session/:sessionId')
  async fromSession(@Param('sessionId') sessionId: string) {
    return this.press.publicView(await this.press.orderFromSession(sessionId));
  }

  /** Intake form (multipart: fields + optional `pressKit` file). */
  @Post('orders/:id/intake')
  @UseInterceptors(FileInterceptor('pressKit', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async intake(
    @Param('id') id: string,
    @Body() body: Record<string, string | undefined>,
    @UploadedFile() file?: UploadedKit,
  ) {
    return this.press.publicView(await this.press.intake(id, body, file));
  }

  /** Editorial Focus live chip. */
  @Get('stats')
  stats() {
    return this.press.stats();
  }

  // ── Admin queue (Editorial Desk) ──
  @Get('orders')
  @UseGuards(AdminTokenGuard)
  async list() {
    return { rows: (await this.press.list()).map((o) => ({ ...this.press.publicView(o), attribution: o.attribution })) };
  }

  @Patch('orders/:id/status')
  @UseGuards(AdminTokenGuard)
  async setStatus(@Param('id') id: string, @Body() body: { status?: string }) {
    return this.press.publicView(await this.press.setStatus(id, body?.status || ''));
  }
}
