import Redis from 'ioredis';
import { ConsultationTier } from '@prisma/client';

export class RedisService {
  private client: Redis;

  private readonly QUEUES: Record<ConsultationTier, string> = {
    [ConsultationTier.NORMAL]: 'queue:normal',
    [ConsultationTier.PRIORITY]: 'queue:priority',
    [ConsultationTier.SUPER]: 'queue:super'
  };

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    const parsed = redisUrl ? new URL(redisUrl) : null;

    this.client = new Redis({
      host: process.env.REDIS_HOST || parsed?.hostname || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || (parsed?.port || '6379'), 10),
      password:
        process.env.REDIS_PASSWORD ||
        (parsed?.password ? decodeURIComponent(parsed.password) : undefined),
      tls:
        process.env.REDIS_TLS === 'true' || parsed?.protocol === 'rediss:'
          ? {}
          : undefined,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 100, 1500)
    });
  }

  async connect() {
    if (this.client.status !== 'ready') {
      await this.client.connect();
    }
  }

  async disconnect() {
    await this.client.quit();
  }

  async flushAll() {
    await this.client.flushall();
  }

  async healthCheck() {
    return this.client.ping();
  }

  async addToQueue(
    tier: ConsultationTier,
    requestId: string,
    patientId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const queueKey = this.QUEUES[tier];
    const requestKey = `request:${requestId}`;
    const ttlSeconds = 120;

    await this.client.hset(requestKey, {
      requestId,
      patientId,
      tier,
      status: 'queued',
      metadata: JSON.stringify(metadata),
      queuedAt: Date.now().toString()
    });
    await this.client.expire(requestKey, ttlSeconds);

    await this.client.zadd(queueKey, Date.now(), requestId);
  }

  async claimRequest(requestId: string, doctorId: string): Promise<boolean> {
    const claimKey = `claim:${requestId}`;
    const result = await this.client.set(claimKey, doctorId, 'EX', 120, 'NX');

    if (result !== 'OK') {
      return false;
    }

    const tier = await this.client.hget(`request:${requestId}`, 'tier');
    if (tier) {
      await this.client.zrem(this.QUEUES[tier as ConsultationTier], requestId);
    }

    return true;
  }

  async getNextRequests(tier: ConsultationTier, count = 10): Promise<string[]> {
    return this.client.zrange(this.QUEUES[tier], 0, count - 1);
  }

  async getQueueLength(tier: ConsultationTier): Promise<number> {
    return this.client.zcard(this.QUEUES[tier]);
  }

  async setDoctorOnline(
    doctorId: string,
    capabilities: {
      canHandleVoiceText?: boolean;
      canHandleVoiceCall?: boolean;
      canHandleVideoCall?: boolean;
      role?: string;
    }
  ) {
    await this.client.hset(`doctor:${doctorId}`, {
      doctorId,
      status: 'online',
      lastSeen: Date.now().toString(),
      canHandleVoiceText: capabilities.canHandleVoiceText ? '1' : '0',
      canHandleVoiceCall: capabilities.canHandleVoiceCall ? '1' : '0',
      canHandleVideoCall: capabilities.canHandleVideoCall ? '1' : '0'
    });

    await this.client.expire(`doctor:${doctorId}`, 300);

    await this.client.sadd('doctors:online', doctorId);
    if (capabilities.canHandleVoiceCall) await this.client.sadd('doctors:voice', doctorId);
    if (capabilities.canHandleVideoCall) await this.client.sadd('doctors:video', doctorId);
  }

  async setDoctorOffline(doctorId: string) {
    await this.client.del(`doctor:${doctorId}`);
    await this.client.srem('doctors:online', doctorId);
    await this.client.srem('doctors:voice', doctorId);
    await this.client.srem('doctors:video', doctorId);
  }

  async doctorHeartbeat(doctorId: string) {
    await this.client.hset(`doctor:${doctorId}`, 'lastSeen', Date.now().toString());
    await this.client.expire(`doctor:${doctorId}`, 300);
  }

  async getEligibleDoctors(tier: ConsultationTier): Promise<string[]> {
    if (tier === ConsultationTier.SUPER) return this.client.smembers('doctors:video');
    if (tier === ConsultationTier.PRIORITY) return this.client.smembers('doctors:voice');
    return this.client.smembers('doctors:online');
  }
}

export const redisService = new RedisService();
