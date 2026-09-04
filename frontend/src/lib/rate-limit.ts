import { createClient } from 'redis'

import { isProductionEnvironment } from '@/lib/environment'

type Bucket = {
  count: number
  resetAt: number
}

const memoryBuckets = new Map<string, Bucket>()

type RateLimitOptions = {
  key: string
  limit: number
  windowMs: number
}

type RateLimitResult = {
  limited: boolean
  remaining: number
  resetAt: number
}

async function redisRateLimit({
  key,
  limit,
  windowMs
}: RateLimitOptions): Promise<RateLimitResult> {
  const url = process.env.REDIS_URL
  if (!url) {
    if (isProductionEnvironment()) {
      throw new Error('REDIS_URL is required for production rate limiting')
    }
    return memoryRateLimit({ key, limit, windowMs })
  }

  const redisKey = `rl:${key}`
  const now = Date.now()
  const redis = createClient({
    url,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: false
    }
  })
  redis.on('error', () => {
    // The awaited connect/eval path below handles the failure without logging
    // connection details that can contain credentials.
  })

  try {
    await redis.connect()
    const result = (await redis.eval(
      `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}`,
      {
        keys: [redisKey],
        arguments: [String(windowMs)]
      }
    )) as [number, number]
    const [count, ttl] = result
    const resetAt = now + (ttl > 0 ? ttl : windowMs)

    return {
      limited: count > limit,
      remaining: Math.max(0, limit - count),
      resetAt
    }
  } catch (error) {
    // Sensitive production mutations fail closed if the shared limiter is
    // unavailable; an isolate-local bucket could otherwise be bypassed.
    if (isProductionEnvironment()) throw error
    return memoryRateLimit({ key, limit, windowMs })
  } finally {
    redis.destroy()
  }
}

function memoryRateLimit({
  key,
  limit,
  windowMs
}: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const bucket = memoryBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return { limited: false, remaining: limit - 1, resetAt: now + windowMs }
  }

  bucket.count += 1
  return {
    limited: bucket.count > limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt
  }
}

export async function rateLimit(
  opts: RateLimitOptions
): Promise<RateLimitResult> {
  return redisRateLimit(opts)
}

export function rateLimitKey(request: Request, scope: string) {
  const forwardedFor = request.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim()
  const realIp = request.headers.get('x-real-ip')?.trim()
  return `${scope}:${forwardedFor || realIp || 'unknown'}`
}

export function rateLimitedResponse(resetAt: number) {
  return Response.json(
    { error: 'Too many requests. Please wait and try again.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(
          Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
        )
      }
    }
  )
}
