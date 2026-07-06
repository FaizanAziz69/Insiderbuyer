import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

function bearer(header?: string): string {
  if (!header) return '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() body: { email?: string; password?: string; name?: string },
  ) {
    return this.auth.register(body?.email ?? '', body?.password ?? '', body?.name);
  }

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    return this.auth.login(body?.email ?? '', body?.password ?? '');
  }

  @Get('me')
  async me(@Headers('authorization') authHeader?: string) {
    const token = bearer(authHeader);
    if (!token) throw new UnauthorizedException('Not signed in.');
    return { user: await this.auth.me(token) };
  }
}
