import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Header-token guard for expensive/mutating admin endpoints (full rescores,
 * LLM batches, FMP backfills). On a public production API these are an open
 * cost/DoS vector otherwise.
 *
 * Active only when ADMIN_API_TOKEN is set in env — callers must then send
 * `x-admin-token: <token>`. With no env token configured the guard allows
 * everything, so local/dev workflows keep working until ops sets the secret.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const required = process.env.ADMIN_API_TOKEN || '';
    if (!required) return true;
    const req = ctx.switchToHttp().getRequest();
    const got = String(req.headers?.['x-admin-token'] || '');
    if (got !== required) {
      throw new UnauthorizedException('Missing or invalid x-admin-token header.');
    }
    return true;
  }
}
