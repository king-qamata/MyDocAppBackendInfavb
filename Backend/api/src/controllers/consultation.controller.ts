import { Request, Response } from 'express';
import { ConsultationStatus, ConsultationTier, PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { monitoring } from '../middleware/monitoring.middleware';
import { acsService } from '../services/acs.service';
import { notificationService } from '../services/notification.service';
import { paymentService } from '../services/payment.service';
import { redisService } from '../services/redis.service';

const requestConsultationSchema = z.object({
  tier: z.enum(['NORMAL', 'PRIORITY', 'SUPER']),
  symptomsVoiceNote: z.string().optional(),
  preferredDoctorId: z.string().optional(),
  metadata: z
    .object({
      deviceInfo: z.any().optional(),
      networkType: z.string().optional()
    })
    .optional()
});

const acceptConsultationSchema = z.object({
  requestId: z.string()
});

const completeConsultationSchema = z.object({
  diagnosis: z.string().optional(),
  prescription: z.string().optional()
});

const rateDoctorSchema = z.object({
  rating: z.number().min(1).max(5),
  review: z.string().max(2000).optional()
});

const escalateTierSchema = z.object({
  toTier: z.enum(['PRIORITY', 'SUPER'])
});

const tierPrice: Record<ConsultationTier, number> = {
  NORMAL: 1000,
  PRIORITY: 5000,
  SUPER: 10000
};

const getRouteParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : (param ?? '');

export class ConsultationController {
  async requestConsultation(req: Request, res: Response) {
    try {
      const patientUserId = req.user?.id;
      if (!patientUserId) throw new AppError('Unauthenticated', 401);

      const patientProfile = await prisma.patientProfile.findUnique({
        where: { userId: patientUserId }
      });

      if (!patientProfile) {
        throw new AppError('Patient profile not found', 404);
      }

      const input = requestConsultationSchema.parse(req.body);
      const price = tierPrice[input.tier as ConsultationTier];

      const payment = await paymentService.placeHold({
        patientId: patientUserId,
        amount: price,
        metadata: { tier: input.tier, requestedAt: new Date().toISOString() }
      });

      if (!payment.success) {
        throw new AppError('Payment authorization failed', 402, payment.error);
      }

      const consultation = await prisma.consultation.create({
        data: {
          tier: input.tier,
          status: ConsultationStatus.REQUESTED,
          patientId: patientProfile.id,
          price,
          paymentStatus: PaymentStatus.HELD,
          paymentReference: payment.reference,
          symptomsVoiceNote: input.symptomsVoiceNote,
          expiryTime: new Date(Date.now() + 2 * 60 * 1000),
          deviceInfo: input.metadata?.deviceInfo,
          networkQuality: input.metadata?.networkType
        }
      });

      await redisService.addToQueue(input.tier as ConsultationTier, consultation.id, patientUserId, {
        tier: input.tier,
        preferredDoctorId: input.preferredDoctorId
      });

      await this.notifyEligibleDoctors(consultation.id);
      this.scheduleExpiryHandler(consultation.id);

      monitoring.trackEvent('ConsultationRequested', {
        consultationId: consultation.id,
        tier: consultation.tier,
        patientId: patientUserId
      });

      return res.status(201).json({
        message: 'Consultation requested successfully',
        consultationId: consultation.id,
        tier: consultation.tier,
        price,
        expiresAt: consultation.expiryTime
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AppError('Validation error', 400, error.flatten());
      }
      throw error;
    }
  }

  async acceptConsultation(req: Request, res: Response) {
    try {
      const doctorUserId = req.user?.id;
      if (!doctorUserId) throw new AppError('Unauthenticated', 401);

      const { requestId } = acceptConsultationSchema.parse(req.body);
      const claimed = await redisService.claimRequest(requestId, doctorUserId);

      if (!claimed) {
        throw new AppError('Request already claimed or expired', 409);
      }

      const consultation = await prisma.consultation.findUnique({
        where: { id: requestId },
        include: {
          patient: {
            include: {
              user: true
            }
          }
        }
      });

      if (!consultation) {
        throw new AppError('Consultation not found', 404);
      }

      if (new Date() > consultation.expiryTime || consultation.status !== ConsultationStatus.REQUESTED) {
        throw new AppError('Request has expired or is no longer available', 410);
      }

      const doctor = await prisma.doctorProfile.findUnique({
        where: { userId: doctorUserId },
        include: { user: true }
      });

      if (!doctor) {
        throw new AppError('Doctor profile not found', 404);
      }

      if (!this.isDoctorEligibleForTier(doctor, consultation.tier)) {
        throw new AppError('Doctor is not eligible for this tier', 403);
      }

      const updatedConsultation = await prisma.consultation.update({
        where: { id: requestId },
        data: {
          doctorId: doctor.id,
          status: ConsultationStatus.DOCTOR_ACCEPTED,
          acceptedAt: new Date()
        }
      });

      await prisma.doctorProfile.update({
        where: { id: doctor.id },
        data: {
          totalConsultations: { increment: 1 }
        }
      });

      const communicationSession =
        consultation.tier === ConsultationTier.NORMAL
          ? await acsService.createChatThread({
              consultationId: consultation.id,
              patientId: consultation.patient.userId,
              doctorId: doctor.userId
            })
          : await acsService.createCallSession({
              consultationId: consultation.id,
              tier: consultation.tier,
              patientId: consultation.patient.userId,
              doctorId: doctor.userId,
              patientPhone: consultation.patient.user.phoneNumber,
              doctorPhone: doctor.user.phoneNumber
            });

      await prisma.consultation.update({
        where: { id: consultation.id },
        data: {
          acsCallId: (communicationSession as any).callId,
          acsChatThreadId: (communicationSession as any).threadId
        }
      });

      await notificationService.notifyDoctorAccepted({
        patientId: consultation.patient.userId,
        doctorId: doctor.userId,
        consultationId: consultation.id,
        tier: consultation.tier,
        communicationSession
      });

      return res.status(200).json({
        message: 'Consultation accepted successfully',
        consultationId: consultation.id,
        status: ConsultationStatus.DOCTOR_ACCEPTED,
        communicationSession
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AppError('Validation error', 400, error.flatten());
      }
      throw error;
    }
  }

  async startConsultation(req: Request, res: Response) {
    const consultationId = getRouteParam(req.params.consultationId);
    const userId = req.user?.id;

    if (!userId) throw new AppError('Unauthenticated', 401);

    const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
    if (!consultation) throw new AppError('Consultation not found', 404);

    const doctor = consultation.doctorId
      ? await prisma.doctorProfile.findUnique({ where: { id: consultation.doctorId }, select: { userId: true } })
      : null;
    const patient = await prisma.patientProfile.findUnique({ where: { id: consultation.patientId }, select: { userId: true } });

    const isParticipant = doctor?.userId === userId || patient?.userId === userId;
    if (!isParticipant) throw new AppError('Unauthorized', 403);

    if (consultation.status === ConsultationStatus.DOCTOR_ACCEPTED) {
      await prisma.consultation.update({
        where: { id: consultationId },
        data: {
          status: ConsultationStatus.IN_PROGRESS,
          startedAt: new Date()
        }
      });

      if (consultation.tier === ConsultationTier.SUPER && consultation.doctorId) {
        this.scheduleLivenessCheck(consultationId, consultation.doctorId);
      }
    }

    res.status(200).json({ message: 'Consultation started', status: ConsultationStatus.IN_PROGRESS });
  }

  async completeConsultation(req: Request, res: Response) {
    const doctorUserId = req.user?.id;
    if (!doctorUserId) throw new AppError('Unauthenticated', 401);

    const consultationId = getRouteParam(req.params.consultationId);
    const { diagnosis, prescription } = completeConsultationSchema.parse(req.body);

    const doctor = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
    if (!doctor) throw new AppError('Doctor profile not found', 404);

    const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
    if (!consultation || consultation.doctorId !== doctor.id) {
      throw new AppError('Unauthorized or consultation not found', 403);
    }

    const durationSeconds = consultation.startedAt
      ? Math.max(0, Math.floor((Date.now() - consultation.startedAt.getTime()) / 1000))
      : 0;

    await prisma.$transaction(async (tx) => {
      await tx.consultation.update({
        where: { id: consultationId },
        data: {
          status: ConsultationStatus.COMPLETED,
          completedAt: new Date(),
          durationSeconds,
          diagnosis,
          prescription
        }
      });

      const wallet = await tx.wallet.upsert({
        where: { userId: doctor.userId },
        update: { balance: { increment: consultation.price * 0.8 } },
        create: {
          userId: doctor.userId,
          balance: consultation.price * 0.8
        }
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'CREDIT',
          amount: consultation.price * 0.8,
          status: 'COMPLETED',
          reference: `CONS-${consultation.id}-${Date.now()}`,
          consultationId: consultation.id,
          description: `Consultation earning (${consultation.tier})`,
          metadata: {
            tier: consultation.tier,
            commission: consultation.price * 0.2,
            durationSeconds
          }
        }
      });
    });

    await paymentService.capturePayment(consultation.paymentReference || '');

    if (consultation.acsCallId) {
      await acsService.stopRecording(consultation.acsCallId);
    }

    res.status(200).json({ message: 'Consultation completed', consultationId });
  }

  async getConsultation(req: Request, res: Response) {
    const consultationId = getRouteParam(req.params.consultationId);
    const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
    if (!consultation) throw new AppError('Consultation not found', 404);
    res.status(200).json(consultation);
  }

  async rateDoctor(req: Request, res: Response) {
    const consultationId = getRouteParam(req.params.consultationId);
    const { rating, review } = rateDoctorSchema.parse(req.body);

    const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
    if (!consultation?.doctorId) throw new AppError('Consultation or doctor not found', 404);

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        action: 'CONSULTATION_RATING',
        resource: 'CONSULTATION',
        resourceId: consultationId,
        metadata: { rating, review }
      }
    });

    res.status(200).json({ message: 'Doctor rated successfully' });
  }

  async escalateTier(req: Request, res: Response) {
    const consultationId = getRouteParam(req.params.consultationId);
    const { toTier } = escalateTierSchema.parse(req.body);

    const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
    if (!consultation) throw new AppError('Consultation not found', 404);
    if (consultation.status !== ConsultationStatus.IN_PROGRESS) {
      throw new AppError('Only in-progress consultation can be escalated', 409);
    }

    const fromPrice = tierPrice[consultation.tier];
    const toPrice = tierPrice[toTier as ConsultationTier];

    if (toPrice <= fromPrice) {
      throw new AppError('Escalation tier must be higher than current tier', 400);
    }

    const extraAmount = toPrice - fromPrice;
    const patientProfile = await prisma.patientProfile.findUnique({
      where: { id: consultation.patientId },
      select: { userId: true }
    });

    if (!patientProfile) {
      throw new AppError('Patient profile not found', 404);
    }

    const payment = await paymentService.placeHold({
      patientId: patientProfile.userId,
      amount: extraAmount,
      metadata: {
        consultationId,
        fromTier: consultation.tier,
        toTier,
        escalation: true
      }
    });

    if (!payment.success) throw new AppError('Escalation payment authorization failed', 402);

    await prisma.consultation.update({
      where: { id: consultationId },
      data: {
        tier: toTier,
        price: toPrice,
        paymentReference: payment.reference,
        paymentStatus: PaymentStatus.HELD
      }
    });

    res.status(200).json({
      message: 'Consultation tier escalated',
      consultationId,
      fromTier: consultation.tier,
      toTier,
      extraAmount
    });
  }

  async getPatientHistory(req: Request, res: Response) {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    const patient = await prisma.patientProfile.findUnique({ where: { userId } });
    if (!patient) throw new AppError('Patient profile not found', 404);

    const consultations = await prisma.consultation.findMany({
      where: { patientId: patient.id },
      orderBy: { requestedAt: 'desc' },
      take: 100
    });

    res.status(200).json({ consultations });
  }

  async getDoctorSchedule(req: Request, res: Response) {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    const doctor = await prisma.doctorProfile.findUnique({ where: { userId } });
    if (!doctor) throw new AppError('Doctor profile not found', 404);

    const consultations = await prisma.consultation.findMany({
      where: {
        doctorId: doctor.id,
        status: { in: [ConsultationStatus.DOCTOR_ACCEPTED, ConsultationStatus.IN_PROGRESS] }
      },
      orderBy: { acceptedAt: 'asc' },
      take: 50
    });

    res.status(200).json({ consultations });
  }

  async handleExpiredRequest(consultationId: string) {
    const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
    if (!consultation || consultation.status !== ConsultationStatus.REQUESTED) return;

    await prisma.consultation.update({
      where: { id: consultationId },
      data: { status: ConsultationStatus.EXPIRED, expiryNotifiedAt: new Date() }
    });

    if (consultation.paymentReference) {
      await paymentService.releaseHold(consultation.paymentReference);
    }

    const patient = await prisma.patientProfile.findUnique({
      where: { id: consultation.patientId },
      select: { userId: true }
    });

    if (patient) {
      await notificationService.notifyRequestExpired({
        patientId: patient.userId,
        consultationId
      });
    }

    monitoring.trackEvent('ConsultationExpired', { consultationId });
  }

  private isDoctorEligibleForTier(doctor: any, tier: ConsultationTier): boolean {
    if (tier === ConsultationTier.SUPER) return !!doctor.canHandleVideoCall;
    if (tier === ConsultationTier.PRIORITY) return !!doctor.canHandleVoiceCall;
    return !!doctor.canHandleVoiceText;
  }

  private async notifyEligibleDoctors(consultationId: string) {
    const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
    if (!consultation) return;

    const eligibleDoctors = await redisService.getEligibleDoctors(consultation.tier);

    await notificationService.broadcastToDoctors({
      doctorIds: eligibleDoctors,
      event: 'NEW_CONSULTATION',
      data: {
        consultationId: consultation.id,
        tier: consultation.tier,
        expiresAt: consultation.expiryTime
      }
    });

    await notificationService.sendPushToDoctors({
      doctorIds: eligibleDoctors,
      title: `New ${consultation.tier} consultation request`,
      body: 'A patient requires urgent attention.',
      priority: consultation.tier === ConsultationTier.SUPER ? 'high' : 'normal',
      data: {
        consultationId: consultation.id,
        tier: consultation.tier
      }
    });
  }

  private scheduleExpiryHandler(consultationId: string) {
    setTimeout(() => {
      this.handleExpiredRequest(consultationId).catch((error) => {
        monitoring.trackException({ exception: error, properties: { operation: 'scheduleExpiryHandler' } });
      });
    }, 2 * 60 * 1000);
  }

  private scheduleLivenessCheck(consultationId: string, doctorId: string) {
    setTimeout(() => {
      prisma
        .consultation
        .findUnique({ where: { id: consultationId } })
        .then((consultation) => {
          if (!consultation) return;
          if (consultation.status !== ConsultationStatus.IN_PROGRESS) return;
          if (consultation.tier !== ConsultationTier.SUPER) return;
          if (consultation.livenessRequestedAt) return;

          return prisma.consultation.update({
            where: { id: consultationId },
            data: { livenessRequestedAt: new Date() }
          });
        })
        .then(() => notificationService.requestLivenessCheck({ consultationId, doctorId }))
        .catch((error) => {
          monitoring.trackException({ exception: error, properties: { operation: 'scheduleLivenessCheck' } });
        });
    }, 2 * 60 * 1000);
  }
}
