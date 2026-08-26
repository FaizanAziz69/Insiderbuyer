import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Header-token guard for expensive/mutating admin endpoints (full rescores,
 * LLM batches, FMP backfills) and for the B2B lead list.
 *
 * It used to ALLOW everything when ADMIN_API_TOKEN was unset, so that local and
 * dev workflows kept working until ops set the secret. Production never set it
 * (found 2026-08-26), which left all 30 guarded endpoints open to anyone on the
 * internet: the B2B lead list — names, companies, emails, phone numbers —
 * answered a plain GET, and any passer-by could trigger ingestions, rescores
 * and FMP backfills, or silence email alerts.
 *
 * So it fails closed wherever NODE_ENV is 'production' (which the server sets):
 * without a configured token the endpoint is unavailable rather than unguarded,
 * because a missing secret must never read as permission. Anywhere else — a
 * laptop, a test run — an unset token still opens the routes, so local work
 * needs no ceremony.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  private static warned = false;
  private static readonly log = new Logger(AdminTokenGuard.name);

  canActivate(ctx: ExecutionContext): boolean {
    const required = process.env.ADMIN_API_TOKEN || '';
    if (!required) {
      if (process.env.NODE_ENV !== 'production') return true;
      if (!AdminTokenGuard.warned) {
        AdminTokenGuard.warned = true;
        AdminTokenGuard.log.error(
          'ADMIN_API_TOKEN is not set — every admin endpoint is refusing requests. Set it in the environment.',
        );
      }
      throw new ServiceUnavailableException(
        'Admin endpoints are disabled: no ADMIN_API_TOKEN is configured.',
      );
    }
    const req = ctx.switchToHttp().getRequest();
    const got = String(req.headers?.['x-admin-token'] || '');
    if (got !== required) {
      throw new UnauthorizedException('Missing or invalid x-admin-token header.');
    }
    return true;
  }
}
