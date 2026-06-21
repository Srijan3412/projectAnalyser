import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../core/config/index.js";
import { logger } from "../core/logger/index.js";

export const ANALYSIS_QUEUE_NAME = "analysis-queue";

export interface AnalysisJobData {
  jobId: string;
  repoId: string;
  repoName: string;
  source: "github" | "zip" | "local";
  repoPath: string;
  url?: string;
}

// ─── In-memory store (used as Redis fallback) ────────────────────────────────
const memStore = new Map<string, string>();

/**
 * Minimal Redis-like shim backed by a plain Map.
 * Only implements the operations used by analysis.worker.ts
 * (get / set / ping / quit).
 */
class InMemoryRedis {
  async get(key: string) { return memStore.get(key) ?? null; }
  async set(key: string, value: string) { memStore.set(key, value); return "OK" as const; }
  async keys(pattern: string) {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return Array.from(memStore.keys()).filter(k => regex.test(k));
  }
  async ping() { return "PONG" as const; }
  async quit() { return "OK" as const; }
  on() { return this; }  // satisfy EventEmitter interface used by BullMQ
}

// ─── Connection factory ───────────────────────────────────────────────────────
async function initConnection(): Promise<Redis> {
  const isProd = config.NODE_ENV === "production";

  const probe = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: isProd,
    connectTimeout: isProd ? 10000 : 2000,
    lazyConnect: true,
    retryStrategy: isProd
      ? (times) => Math.min(times * 100, 3000)
      : () => null, // disable auto-retry — we only try once
  });

  // Suppress ioredis unhandled error events during probe
  probe.on("error", (err) => {
    if (isProd) {
      logger.error(err, "⚠️ Redis connection error occurred");
    }
  });

  try {
    await probe.connect();
    await probe.ping();
    logger.info({ url: config.REDIS_URL }, "✅ Redis connected successfully");
    return probe;
  } catch (err: any) {
    // Force-close the probe without waiting for a command response
    try { (probe as any).disconnect(false); } catch { /* already closed, ignore */ }
    
    if (isProd) {
      logger.error({ err, url: config.REDIS_URL }, "💥 Failed to connect to Redis in production mode! Crashing process.");
      throw err;
    }

    logger.warn(
      "⚠️  Redis not reachable – using in-memory store (dev mode). Job state will not persist across restarts."
    );
    return new InMemoryRedis() as unknown as Redis;
  }
}

// Kick off connection immediately so it is ready before routes handle requests
let _conn: Redis | null = null;
export let isInMemoryMode = false;

export const connectionReady: Promise<Redis> = initConnection().then((c) => {
  _conn = c;
  if (c instanceof InMemoryRedis) isInMemoryMode = true;
  return c;
});

// Proxy allows synchronous access after connectionReady has resolved
export const redisConnection = new Proxy({} as Redis, {
  get(_t, prop: string) {
    if (!_conn) return (..._args: unknown[]) => Promise.resolve(null); // safe no-op before ready
    const v = (_conn as any)[prop];
    return typeof v === "function" ? v.bind(_conn) : v;
  },
});

// BullMQ Queue – only created when real Redis is available
let _queue: Queue<AnalysisJobData, any, string> | null = null;

connectionReady.then((conn) => {
  if (isInMemoryMode) {
    logger.info("⚡ BullMQ Queue skipped (in-memory mode – jobs run inline)");
    return;
  }
  _queue = new Queue<AnalysisJobData, any, string>(ANALYSIS_QUEUE_NAME, {
    connection: conn as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
  logger.info("⚡ BullMQ Analysis Queue ready");
});

// Synchronous proxy – only accessed in Redis mode (route guards with isInMemoryMode check)
export const analysisQueue = new Proxy({} as Queue<AnalysisJobData, any, string>, {
  get(_t, prop: string) {
    if (!_queue) throw new Error("analysisQueue accessed before Redis connection was ready");
    const v = (_queue as any)[prop];
    return typeof v === "function" ? v.bind(_queue) : v;
  },
});

logger.info("⚡ BullMQ Analysis Queue initialising…");

