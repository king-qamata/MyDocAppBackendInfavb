"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const payment_service_1 = require("../src/services/payment.service");
const prismaMock = {
    user: { findUnique: vitest_1.vi.fn() },
    consultation: { updateMany: vitest_1.vi.fn() }
};
vitest_1.vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vitest_1.vi.mock('../src/middleware/monitoring.middleware', () => ({
    monitoring: {
        trackException: vitest_1.vi.fn(),
        trackEvent: vitest_1.vi.fn()
    }
}));
(0, vitest_1.describe)('PaymentService', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('places a hold using primary provider', async () => {
        prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
        const primary = {
            name: 'primary',
            initializePayment: vitest_1.vi.fn().mockResolvedValue({ ok: true, raw: {} }),
            verifyPayment: vitest_1.vi.fn(),
            chargeCard: vitest_1.vi.fn(),
            transfer: vitest_1.vi.fn()
        };
        const secondary = {
            name: 'secondary',
            initializePayment: vitest_1.vi.fn(),
            verifyPayment: vitest_1.vi.fn(),
            chargeCard: vitest_1.vi.fn(),
            transfer: vitest_1.vi.fn()
        };
        const service = new payment_service_1.PaymentService(primary, secondary);
        const result = await service.placeHold({ patientId: 'u1', amount: 1000, metadata: { tier: 'NORMAL' } });
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.provider).toBe('primary');
        (0, vitest_1.expect)(primary.initializePayment).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)('captures payment when provider verification succeeds', async () => {
        const primary = {
            name: 'primary',
            initializePayment: vitest_1.vi.fn(),
            verifyPayment: vitest_1.vi.fn().mockResolvedValue({ ok: true, status: 'success', raw: {} }),
            chargeCard: vitest_1.vi.fn(),
            transfer: vitest_1.vi.fn()
        };
        const service = new payment_service_1.PaymentService(primary, primary);
        const result = await service.capturePayment('ref-1');
        (0, vitest_1.expect)(result).toBe(true);
        (0, vitest_1.expect)(prismaMock.consultation.updateMany).toHaveBeenCalledWith({
            where: { paymentReference: 'ref-1' },
            data: { paymentStatus: 'CAPTURED' }
        });
    });
});
