import { createClient, type RedisClientType } from 'redis'

let client: RedisClientType | null = null
let connecting = false

async function getRedis(): Promise<RedisClientType | null> {
  if (client?.isReady) return client
  if (connecting) return null

  const url = process.env.REDIS_URL
  if (!url) return null

  connecting = true
  try {
    client = createClient({ url }) as RedisClientType
    client.on('error', () => {})
    await client.connect()
    connecting = false
    return client
  } catch {
    connecting = false
    return null
  }
}

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

async function redisRateLimit({ key, limit, windowMs }: RateLimitOptions): Promise<RateLimitResult> {
  const redis = await getRedis()
  if (!redis) return memoryRateLimit({ key, limit, windowMs })

  const redisKey = `rl:${key}`
  const now = Date.now()
  const windowSecs = Math.ceil(windowMs / 1000)

  const count = await redis.incr(redisKey)
  if (count === 1) {
    await redis.expire(redisKey, windowSecs)
  }

  const ttl = await redis.ttl(redisKey)
  const resetAt = now + (ttl > 0 ? ttl * 1000 : windowMs)

  return {
    limited: count > limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  }
}

function memoryRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
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
    resetAt: bucket.resetAt,
  }
}

export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  return redisRateLimit(opts)
}

export function rateLimitKey(request: Request, scope: string) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const realIp = request.headers.get('x-real-ip')?.trim()
  return `${scope}:${forwardedFor || realIp || 'unknown'}`
}

export function rateLimitedResponse(resetAt: number) {
  return Response.json(
    { error: 'Too many requests. Please wait and try again.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
      },
    },
  )
}
