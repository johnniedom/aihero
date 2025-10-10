import { env } from "~/env";
import Redis from "ioredis";

// Configure Redis for Upstash with proper timeout and retry settings
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3, // Reduce from default 20 to fail faster
  connectTimeout: 10000, // 10 seconds timeout for initial connection
  commandTimeout: 5000, // 5 seconds timeout for commands
  enableReadyCheck: true,
  retryStrategy(times) {
    // Stop retrying after 3 attempts
    if (times > 3) {
      return null; // Stop retrying
    }
    // Exponential backoff: 100ms, 200ms, 400ms
    return Math.min(times * 100, 1000);
  },
  // Upstash requires TLS
  tls: {
    rejectUnauthorized: true,
  },
  family: 6, // Use IPv6 first, fallback to IPv4
  lazyConnect: false, // Connect immediately to catch connection errors early
});

// Handle Redis connection errors
redis.on('error', (error) => {
  console.error('Redis connection error:', error.message);
});

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('ready', () => {
  console.log('Redis ready to accept commands');
});

const CACHE_EXPIRY_SECONDS = 60 * 60 * 6; // 6 hours
const CACHE_KEY_SEPARATOR = ":";

/**w
 * Type-safe Redis cache wrapper
 * Inspired by Matt Pocock's advanced TypeScript patterns
 */

export const cacheWithRedis = <TArgs extends readonly unknown[], TReturn>(
  keyPrefix: string,
  fn: (...args: TArgs) => Promise<TReturn>,
) => {
  return (async (...args: TArgs): Promise<TReturn> => {
    const key = `${keyPrefix}${CACHE_KEY_SEPARATOR}${JSON.stringify(args)}`;
    
    try {
      const cachedResult = await redis.get(key);
      if (cachedResult) {
        console.log(`Cache hit for ${key}`);
        // parse as unknown then cast to TReturn after runtime JSON.parse
        const parsed = JSON.parse(cachedResult) as unknown;
        return parsed as TReturn;
      }
    } catch (error) {
      // Log cache read error but continue with function execution
      console.error(`Cache read error for ${key}:`, error instanceof Error ? error.message : error);
    }

    const result = await fn(...args);
    
    try {
      await redis.set(key, JSON.stringify(result), "EX", CACHE_EXPIRY_SECONDS);
    } catch (error) {
      // Log cache write error but return the result anyway
      console.error(`Cache write error for ${key}:`, error instanceof Error ? error.message : error);
    }
    
    return result;
  }) as (...args: TArgs) => Promise<TReturn>;
};
