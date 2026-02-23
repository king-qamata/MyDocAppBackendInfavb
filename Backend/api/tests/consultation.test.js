"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const consultation_controller_1 = require("../src/controllers/consultation.controller");
const prismaMock = {
    consultation: {
        create: vitest_1.vi.fn(),
        findUnique: vitest_1.vi.fn(),
        update: vitest_1.vi.fn()
    },
    patientProfile: {
        findUnique: vitest_1.vi.fn()
    },
    doctorProfile: {
        findUnique: vitest_1.vi.fn(),
        update: vitest_1.vi.fn()
    }
};
const redisMock = {
    addToQueue: vitest_1.vi.fn(),
    claimRequest: vitest_1.vi.fn(),
    getEligibleDoctors: vitest_1.vi.fn()
};
const paymentMock = {
    placeHold: vitest_1.vi.fn(),
    capturePayment: vitest_1.vi.fn(),
    releaseHold: vitest_1.vi.fn()
};
const notificationMock = {
    broadcastToDoctors: vitest_1.vi.fn(),
    sendPushToDoctors: vitest_1.vi.fn(),
    notifyDoctorAccepted: vitest_1.vi.fn(),
    requestLivenessCheck: vitest_1.vi.fn(),
    notifyRequestExpired: vitest_1.vi.fn()
};
const acsMock = {
    createCallSession: vitest_1.vi.fn(),
    createChatThread: vitest_1.vi.fn(),
    stopRecording: vitest_1.vi.fn()
};
vitest_1.vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vitest_1.vi.mock('../src/services/redis.service', () => ({ redisService: redisMock }));
vitest_1.vi.mock('../src/services/payment.service', () => ({ paymentService: paymentMock }));
vitest_1.vi.mock('../src/services/notification.service', () => ({ notificationService: notificationMock }));
vitest_1.vi.mock('../src/services/acs.service', () => ({ acsService: acsMock }));
vitest_1.vi.mock('../src/middleware/monitoring.middleware', () => ({ monitoring: { trackEvent: vitest_1.vi.fn(), trackException: vitest_1.vi.fn() } }));
function resMock() {
    const res = {};
    res.status = vitest_1.vi.fn().mockReturnValue(res);
    res.json = vitest_1.vi.fn().mockReturnValue(res);
    return res;
}
(0, vitest_1.describe)('ConsultationController', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('creates consultation request successfully', async () => {
        const controller = new consultation_controller_1.ConsultationController();
        paymentMock.placeHold.mockResolvedValue({ success: true, reference: 'hold-ref' });
        prismaMock.patientProfile.findUnique.mockResolvedValue({ id: 'pp1', userId: 'p1' });
        prismaMock.consultation.create.mockResolvedValue({
            id: 'c1',
            tier: 'NORMAL',
            price: 1000,
            expiryTime: new Date()
        });
        prismaMock.consultation.findUnique.mockResolvedValue({ id: 'c1', tier: 'NORMAL', expiryTime: new Date() });
        redisMock.getEligibleDoctors.mockResolvedValue(['d1']);
        const req = {
            user: { id: 'p1' },
            body: {
                tier: 'NORMAL',
                metadata: { networkType: '4G' }
            }
        };
        const res = resMock();
        await controller.requestConsultation(req, res);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(201);
        (0, vitest_1.expect)(redisMock.addToQueue).toHaveBeenCalled();
        (0, vitest_1.expect)(notificationMock.sendPushToDoctors).toHaveBeenCalled();
    });
    (0, vitest_1.it)('rejects acceptance when request is already claimed', async () => {
        const controller = new consultation_controller_1.ConsultationController();
        redisMock.claimRequest.mockResolvedValue(false);
        const req = {
            user: { id: 'doctor-user' },
            body: { requestId: 'c1' }
        };
        await (0, vitest_1.expect)(controller.acceptConsultation(req, resMock())).rejects.toMatchObject({
            message: 'Request already claimed or expired',
            statusCode: 409
        });
    });
});
