import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConsultationController } from '../src/controllers/consultation.controller';

const prismaMock = vi.hoisted(() => ({
  consultation: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  },
  patientProfile: {
    findUnique: vi.fn()
  },
  doctorProfile: {
    findUnique: vi.fn(),
    update: vi.fn()
  }
}));

const redisMock = vi.hoisted(() => ({
  addToQueue: vi.fn(),
  claimRequest: vi.fn(),
  getEligibleDoctors: vi.fn()
}));

const paymentMock = vi.hoisted(() => ({
  placeHold: vi.fn(),
  capturePayment: vi.fn(),
  releaseHold: vi.fn()
}));

const notificationMock = vi.hoisted(() => ({
  broadcastToDoctors: vi.fn(),
  sendPushToDoctors: vi.fn(),
  notifyDoctorAccepted: vi.fn(),
  requestLivenessCheck: vi.fn(),
  notifyRequestExpired: vi.fn()
}));

const acsMock = vi.hoisted(() => ({
  createCallSession: vi.fn(),
  createChatThread: vi.fn(),
  stopRecording: vi.fn()
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/services/redis.service', () => ({ redisService: redisMock }));
vi.mock('../src/services/payment.service', () => ({ paymentService: paymentMock }));
vi.mock('../src/services/notification.service', () => ({ notificationService: notificationMock }));
vi.mock('../src/services/acs.service', () => ({ acsService: acsMock }));
vi.mock('../src/middleware/monitoring.middleware', () => ({ monitoring: { trackEvent: vi.fn(), trackException: vi.fn() } }));

function resMock() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('ConsultationController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates consultation request successfully', async () => {
    const controller = new ConsultationController();
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

    const req: any = {
      user: { id: 'p1' },
      body: {
        tier: 'NORMAL',
        metadata: { networkType: '4G' }
      }
    };

    const res = resMock();
    await controller.requestConsultation(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(redisMock.addToQueue).toHaveBeenCalled();
    expect(notificationMock.sendPushToDoctors).toHaveBeenCalled();
  });

  it('rejects acceptance when request is already claimed', async () => {
    const controller = new ConsultationController();
    redisMock.claimRequest.mockResolvedValue(false);

    const req: any = {
      user: { id: 'doctor-user' },
      body: { requestId: 'c1' }
    };

    await expect(controller.acceptConsultation(req, resMock())).rejects.toMatchObject({
      message: 'Request already claimed or expired',
      statusCode: 409
    });
  });
});
