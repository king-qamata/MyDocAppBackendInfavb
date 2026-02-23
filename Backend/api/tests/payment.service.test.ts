import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PaymentService } from '../src/services/payment.service';

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  consultation: { updateMany: vi.fn() }
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/middleware/monitoring.middleware', () => ({
  monitoring: {
    trackException: vi.fn(),
    trackEvent: vi.fn()
  }
}));

describe('PaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('places a hold using primary provider', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });

    const primary = {
      name: 'primary',
      initializePayment: vi.fn().mockResolvedValue({ ok: true, raw: {} }),
      verifyPayment: vi.fn(),
      chargeCard: vi.fn(),
      transfer: vi.fn()
    };

    const secondary = {
      name: 'secondary',
      initializePayment: vi.fn(),
      verifyPayment: vi.fn(),
      chargeCard: vi.fn(),
      transfer: vi.fn()
    };

    const service = new PaymentService(primary as any, secondary as any);
    const result = await service.placeHold({ patientId: 'u1', amount: 1000, metadata: { tier: 'NORMAL' } });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('primary');
    expect(primary.initializePayment).toHaveBeenCalledTimes(1);
  });

  it('captures payment when provider verification succeeds', async () => {
    const primary = {
      name: 'primary',
      initializePayment: vi.fn(),
      verifyPayment: vi.fn().mockResolvedValue({ ok: true, status: 'success', raw: {} }),
      chargeCard: vi.fn(),
      transfer: vi.fn()
    };

    const service = new PaymentService(primary as any, primary as any);
    const result = await service.capturePayment('ref-1');

    expect(result).toBe(true);
    expect(prismaMock.consultation.updateMany).toHaveBeenCalledWith({
      where: { paymentReference: 'ref-1' },
      data: { paymentStatus: 'CAPTURED' }
    });
  });
});
