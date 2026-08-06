import {
  ConflictException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailFlowsService } from '../email-flows/email-flows.service';
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'crypto';
import { User } from '../entities/user.entity';

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

// HMAC-signing secret. Set AUTH_SECRET in the environment for production — the
// fallback only exists so local dev works out of the box.
const SECRET =
  process.env.AUTH_SECRET || 'dev-insecure-auth-secret-change-me';
const TOKEN_TTL_SEC = 60 * 60 * 24 * 30; // 30 days
const SCRYPT_KEYLEN = 64;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(
    input.replace(/-/g, '+').replace(/_/g, '/') + pad,
    'base64',
  );
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @Optional() private readonly emailFlows?: EmailFlowsService,
  ) {}

  private normalizeEmail(email: string): string {
    return (email || '').trim().toLowerCase();
  }

  private toPublic(u: User): PublicUser {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt:
        u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
    };
  }

  // ── Password hashing (scrypt) ─────────────────────────────────────────
  private hashPassword(password: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [scheme, saltHex, hashHex] = (stored || '').split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  // ── Token signing / verification (HMAC-SHA256) ────────────────────────
  private signToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
    };
    const body = b64url(JSON.stringify(payload));
    const sig = b64url(createHmac('sha256', SECRET).update(body).digest());
    return `${body}.${sig}`;
  }

  verifyToken(token: string): { sub: string; email: string } | null {
    if (!token || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    const expected = b64url(createHmac('sha256', SECRET).update(body).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const payload = JSON.parse(b64urlDecode(body).toString('utf8'));
      if (!payload?.sub || !payload?.exp) return null;
      if (payload.exp < Math.floor(Date.now() / 1000)) return null;
      return { sub: payload.sub, email: payload.email };
    } catch {
      return null;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────
  async register(
    emailRaw: string,
    password: string,
    name?: string,
  ): Promise<AuthResult> {
    const email = this.normalizeEmail(emailRaw);
    if (!EMAIL_RE.test(email)) {
      throw new UnauthorizedException('Please enter a valid email address.');
    }
    if (!password || password.length < 8) {
      throw new UnauthorizedException(
        'Password must be at least 8 characters.',
      );
    }
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with that email already exists.');
    }
    const user = await this.users.save(
      this.users.create({
        email,
        name: name?.trim() || null,
        passwordHash: this.hashPassword(password),
      }),
    );
    // New account → start the Welcome Flow (fire-and-forget, dedupes itself).
    this.emailFlows?.startFlow('welcome', email, user.name).catch(() => undefined);
    return { token: this.signToken(user), user: this.toPublic(user) };
  }

  async login(emailRaw: string, password: string): Promise<AuthResult> {
    const email = this.normalizeEmail(emailRaw);
    const user = await this.users.findOne({ where: { email } });
    // Generic message so we don't reveal which accounts exist.
    if (!user || !this.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    return { token: this.signToken(user), user: this.toPublic(user) };
  }

  async me(token: string): Promise<PublicUser> {
    const claims = this.verifyToken(token);
    if (!claims) throw new UnauthorizedException('Invalid or expired session.');
    const user = await this.users.findOne({ where: { id: claims.sub } });
    if (!user) throw new UnauthorizedException('Account no longer exists.');
    return this.toPublic(user);
  }
}
