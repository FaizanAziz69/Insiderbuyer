import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { BannerAudience, SiteBanner } from '../entities/site-banner.entity';
import { BannersService } from './banners.service';

@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  active(@Query('path') path?: string, @Query('audience') audience?: string) {
    const a = (['guest', 'free', 'premium'].includes(audience || '') ? audience : 'guest') as BannerAudience;
    return this.banners.active(path || '/', a);
  }

  @Post(':id/event')
  async event(@Param('id') id: string, @Body() body: { type?: string }) {
    await this.banners.event(id, body?.type as 'impression' | 'click');
    return { ok: true };
  }

  @Get('admin')
  @UseGuards(AdminTokenGuard)
  async list() {
    return { rows: await this.banners.list() };
  }

  @Post('admin')
  @UseGuards(AdminTokenGuard)
  create(@Body() body: Partial<SiteBanner>) {
    return this.banners.create(body);
  }

  @Patch('admin/:id')
  @UseGuards(AdminTokenGuard)
  update(@Param('id') id: string, @Body() body: Partial<SiteBanner>) {
    return this.banners.update(id, body);
  }

  @Delete('admin/:id')
  @UseGuards(AdminTokenGuard)
  remove(@Param('id') id: string) {
    return this.banners.remove(id);
  }
}
