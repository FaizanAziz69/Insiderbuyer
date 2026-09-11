import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { Response } from 'express';

/**
 * §3.1 Real-time Gateway — the one place deltas fan out to connected clients.
 *
 * The brief specifies a WebSocket gateway over Redis pub/sub. This app runs as
 * a single always-on pm2 process behind nginx, so the same contract is met with
 * an in-process EventEmitter feeding Server-Sent Events: one HTTP response per
 * client, `text/event-stream`, native browser reconnect, and no new runtime
 * dependency or worker host to keep alive. Swapping the emitter for a Redis
 * subscriber (and SSE for ws) is a change to this file alone if the ingest ever
 * moves off-box.
 *
 * Rate discipline from §9.4: at most one message per market per second, and
 * frames are batched — a publisher calls `publish` freely, subscribers receive
 * a coalesced frame on a fixed 1s tick.
 */

export interface RealtimeFrame {
  /** Channel name, e.g. 'markets'. */
  channel: string;
  /** Coalesced payloads, one per entity id. */
  updates: Record<string, unknown>[];
  ts: number;
}

const TICK_MS = 1000;
const KEEPALIVE_MS = 25_000;

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly bus = new EventEmitter();
  /** channel → id → latest payload, drained on the next tick. */
  private readonly pending = new Map<string, Map<string, Record<string, unknown>>>();
  private readonly clients = new Map<string, Set<Response>>();
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    this.bus.setMaxListeners(0);
  }

  /** Queue one entity's delta. Later calls in the same tick replace earlier
   *  ones for that id, which is what keeps a fast-moving market to 1 msg/s. */
  publish(channel: string, id: string, payload: Record<string, unknown>): void {
    let byId = this.pending.get(channel);
    if (!byId) {
      byId = new Map();
      this.pending.set(channel, byId);
    }
    byId.set(id, payload);
    this.ensureTimer();
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), TICK_MS);
    // Never hold the process open for the sake of an empty ticker.
    this.timer.unref?.();
  }

  private flush(): void {
    if (this.pending.size === 0) {
      if (this.totalClients() === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      return;
    }
    for (const [channel, byId] of this.pending) {
      if (byId.size === 0) continue;
      const frame: RealtimeFrame = {
        channel,
        updates: [...byId.values()],
        ts: Date.now(),
      };
      byId.clear();
      this.send(channel, 'delta', frame);
    }
  }

  private totalClients(): number {
    let n = 0;
    for (const set of this.clients.values()) n += set.size;
    return n;
  }

  private send(channel: string, event: string, data: unknown): void {
    const set = this.clients.get(channel);
    if (!set || set.size === 0) return;
    const body = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
      try {
        res.write(body);
      } catch {
        set.delete(res);
      }
    }
  }

  /** Attach one SSE client to a channel; returns a detach function. */
  subscribe(channel: string, res: Response): () => void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // nginx buffers proxied responses by default, which would hold every
    // delta until the buffer filled. This header is the documented opt-out.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(`retry: 3000\n\n`);

    let set = this.clients.get(channel);
    if (!set) {
      set = new Set();
      this.clients.set(channel, set);
    }
    set.add(res);
    this.ensureTimer();

    const keepalive = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch {
        /* the detach below cleans up */
      }
    }, KEEPALIVE_MS);
    keepalive.unref?.();

    return () => {
      clearInterval(keepalive);
      set?.delete(res);
    };
  }

  clientCount(channel: string): number {
    return this.clients.get(channel)?.size ?? 0;
  }
}
