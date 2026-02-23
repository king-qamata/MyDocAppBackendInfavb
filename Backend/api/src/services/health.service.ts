import { prisma } from '../lib/prisma';
import { redisService } from './redis.service';

export class HealthService {
  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    services: {
      database: { status: string; latency?: number; error?: string };
      redis: { status: string; latency?: number; error?: string };
      acs: { status: string; error?: string };
      storage: { status: string; error?: string };
      payment: { status: string; error?: string };
    };
  }> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkACS(),
      this.checkStorage(),
      this.checkPayment()
    ]);

    const services = {
      database: this.formatResult(checks[0]),
      redis: this.formatResult(checks[1]),
      acs: this.formatResult(checks[2]),
      storage: this.formatResult(checks[3]),
      payment: this.formatResult(checks[4])
    };

    return {
      status: this.determineOverallStatus(services),
      timestamp: new Date().toISOString(),
      services
    };
  }

  async getMetrics() {
    return {
      activeConsultations: await prisma.consultation.count({ where: { status: 'IN_PROGRESS' } }),
      queueLengths: {
        normal: await redisService.getQueueLength('NORMAL'),
        priority: await redisService.getQueueLength('PRIORITY'),
        super: await redisService.getQueueLength('SUPER')
      },
      systemLoad: {
        memory: process.memoryUsage(),
        uptime: process.uptime()
      }
    };
  }

  private async checkDatabase() {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', latency: Date.now() - started };
  }

  private async checkRedis() {
    const started = Date.now();
    await redisService.healthCheck();
    return { status: 'healthy', latency: Date.now() - started };
  }

  private async checkACS() {
    return process.env.ACS_CONNECTION_STRING
      ? { status: 'healthy' }
      : { status: 'degraded', error: 'ACS connection string missing' };
  }

  private async checkStorage() {
    return process.env.STORAGE_CONNECTION_STRING
      ? { status: 'healthy' }
      : { status: 'degraded', error: 'Storage connection string missing' };
  }

  private async checkPayment() {
    return process.env.PAYSTACK_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY
      ? { status: 'healthy' }
      : { status: 'degraded', error: 'Payment keys missing' };
  }

  private formatResult(result: PromiseSettledResult<any>) {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    return {
      status: 'unhealthy',
      error: (result.reason as Error)?.message || 'unknown error'
    };
  }

  private determineOverallStatus(services: Record<string, { status: string }>) {
    const statuses = Object.values(services).map((v) => v.status);
    if (statuses.every((status) => status === 'healthy')) return 'healthy';
    if (statuses.some((status) => status === 'unhealthy')) return 'unhealthy';
    return 'degraded';
  }
}

export const healthService = new HealthService();
