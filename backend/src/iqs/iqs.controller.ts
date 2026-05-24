import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IqsService } from './iqs.service';

function toCsv(rows: any[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.join(',');
  const body = rows.map((r) => headers.map((h) => escape(r[h])).join(',')).join('\n');
  return head + '\n' + body;
}

@Controller()
export class IqsController {
  constructor(private readonly iqs: IqsService) {}

  @Get('rankings')
  async rankings(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.iqs.getRankings({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('rankings.csv')
  async rankingsCsv(@Res() res: Response) {
    const { rows } = await this.iqs.getRankings({ limit: 500, offset: 0 });
    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="iqs-rankings-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }

  @Get('companies/:ticker')
  async company(@Param('ticker') ticker: string) {
    const detail = await this.iqs.getCompanyDetail(ticker);
    if (!detail) return { error: 'Not found' };
    return detail;
  }

  @Get('dashboard')
  async dashboard() {
    return this.iqs.getDashboard();
  }

  @Get('trades')
  async trades(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
  ) {
    return this.iqs.getAllTrades({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      q: q || undefined,
    });
  }

  @Get('insiders')
  async insiders(@Query('limit') limit?: string) {
    return this.iqs.getTopInsiders(limit ? Number(limit) : 20);
  }

  @Get('health')
  health() {
    return { ok: true, ts: new Date().toISOString() };
  }
}
