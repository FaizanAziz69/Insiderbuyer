import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

/**
 * Scoped token for the editorial team. Accepts EITHER the full admin token
 * OR EDITORIAL_API_TOKEN, so editors can edit data-article copy from the
 * Editorial Desk without holding the key that also opens the B2B lead list,
 * roster edits, rescores and FMP backfills. Fails closed in production like
 * AdminTokenGuard. Apply only to endpoints editorial is meant to touch.
 */
@Injectable()
export class EditorialTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const admin = process.env.ADMIN_API_TOKEN || '';
    const editorial = process.env.EDITORIAL_API_TOKEN || '';
    if (!admin && !editorial) {
      if (process.env.NODE_ENV !== 'production') return true;
      throw new ServiceUnavailableException('Editorial endpoints are disabled: no token is configured.');
    }
    const req = ctx.switchToHttp().getRequest();
    const got = String(req.headers?.['x-admin-token'] || '');
    if (!got || (got !== admin && got !== editorial)) {
      throw new UnauthorizedException('Missing or invalid x-admin-token header.');
    }
    return true;
  }
}
