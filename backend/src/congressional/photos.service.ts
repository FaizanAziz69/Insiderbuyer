import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

const NO_PHOTO = ':initials:';

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);
  private readonly http: AxiosInstance;
  private mem: Map<string, { ts: number; url: string }> = new Map();
  private readonly TTL_MS = 7 * 24 * 60 * 60 * 1000;

  constructor() {
    this.http = axios.create({
      timeout: 4_000,
      headers: {
        'User-Agent': 'InsiderBuying photo-lookup (contact@insiderbuying.dev)',
        Accept: 'application/json',
      },
    });
  }

  private slug(name: string): string {
    return name.trim().replace(/\s+/g, '_');
  }

  async getPhoto(name: string): Promise<string> {
    if (!name) return NO_PHOTO;
    const key = name.toLowerCase();
    const cached = this.mem.get(key);
    if (cached && Date.now() - cached.ts < this.TTL_MS) return cached.url;
    try {
      const { data } = await this.http.get(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(this.slug(name))}`,
      );
      const url: string | undefined =
        data?.thumbnail?.source || data?.originalimage?.source;
      const value = url || NO_PHOTO;
      this.mem.set(key, { ts: Date.now(), url: value });
      return value;
    } catch (err: any) {
      this.mem.set(key, { ts: Date.now(), url: NO_PHOTO });
      return NO_PHOTO;
    }
  }

  static get NO_PHOTO() {
    return NO_PHOTO;
  }
}
