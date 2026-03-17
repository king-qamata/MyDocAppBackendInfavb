import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { redisService } from '../services/redis.service';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

/**
 * @openapi
 * /api/v1/doctors/health:
 *   get:
 *     operationId: getDoctorsHealth
 *     tags:
 *       - Doctors
 *     summary: Doctor service health check
 *     responses:
 *       200:
 *         description: Doctor service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 service:
 *                   type: string
 *               example:
 *                 status: ok
 *                 service: doctor
 */
router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'doctor' });
});

router.use(authMiddleware.authenticate);
router.use(requireRole('DOCTOR'));

const bankDetailsSchema = z.object({
  accountName: z.string().min(2).max(100),
  accountNumber: z.string().min(6).max(20),
  bankCode: z.string().min(2).max(20)
});

const doctorProfileSchema = z.object({
  mdcnNumber: z.string().min(4).max(50),
  specialization: z.string().min(2).max(100),
  yearsOfExperience: z.number().int().min(0).max(80),
  verifiedAt: z.string().optional(),
  canHandleVoiceText: z.boolean().optional(),
  canHandleVoiceCall: z.boolean().optional(),
  canHandleVideoCall: z.boolean().optional()
});

const doctorPresenceSchema = z.object({
  canHandleVoiceText: z.boolean().optional(),
  canHandleVoiceCall: z.boolean().optional(),
  canHandleVideoCall: z.boolean().optional()
});

/**
 * @openapi
 * /api/v1/doctors/wallet/bank-details:
 *   post:
 *     operationId: updateDoctorBankDetails
 *     tags:
 *       - Doctors
 *     summary: Update doctor payout bank details
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountName
 *               - accountNumber
 *               - bankCode
 *             properties:
 *               accountName:
 *                 type: string
 *               accountNumber:
 *                 type: string
 *               bankCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bank details updated
 *       401:
 *         description: Unauthenticated
 *       404:
 *         description: Doctor profile not found
 */
router.post('/wallet/bank-details', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    const doctor = await prisma.doctorProfile.findUnique({ where: { userId } });
    if (!doctor) throw new AppError('Doctor profile not found', 404);

    const input = bankDetailsSchema.parse(req.body);

    const existingWallet = await prisma.wallet.findUnique({ where: { userId } });

    const wallet = await prisma.wallet.upsert({
      where: { userId },
      update: {
        metadata: {
          ...(existingWallet?.metadata || {}),
          bankDetails: input
        }
      },
      create: {
        userId,
        balance: 0,
        metadata: { bankDetails: input }
      }
    });

    res.status(200).json({ message: 'Bank details updated', walletId: wallet.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/doctors/wallet:
 *   get:
 *     operationId: getDoctorWallet
 *     tags:
 *       - Doctors
 *     summary: Get doctor wallet details
 *     responses:
 *       200:
 *         description: Doctor wallet
 *       401:
 *         description: Unauthenticated
 *       404:
 *         description: Wallet not found
 */
router.get('/wallet', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new AppError('Wallet not found', 404);

    res.status(200).json(wallet);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/doctors/profile:
 *   get:
 *     operationId: getDoctorProfile
 *     tags:
 *       - Doctors
 *     summary: Get the authenticated doctor's profile
 *     responses:
 *       200:
 *         description: Doctor profile
 *       401:
 *         description: Unauthenticated
 *       404:
 *         description: Doctor profile not found
 */
router.get('/profile', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    const profile = await prisma.doctorProfile.findUnique({ where: { userId } });
    if (!profile) throw new AppError('Doctor profile not found', 404);

    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/doctors/profile:
 *   post:
 *     operationId: upsertDoctorProfile
 *     tags:
 *       - Doctors
 *     summary: Create or update the authenticated doctor's profile
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mdcnNumber
 *               - specialization
 *               - yearsOfExperience
 *             properties:
 *               mdcnNumber:
 *                 type: string
 *               specialization:
 *                 type: string
 *               yearsOfExperience:
 *                 type: integer
 *               verifiedAt:
 *                 type: string
 *               canHandleVoiceText:
 *                 type: boolean
 *               canHandleVoiceCall:
 *                 type: boolean
 *               canHandleVideoCall:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Doctor profile updated
 *       401:
 *         description: Unauthenticated
 *       404:
 *         description: User not found
 */
router.post('/profile', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    const input = doctorProfileSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    const verifiedAt = input.verifiedAt ? new Date(input.verifiedAt) : new Date();

    const profile = await prisma.doctorProfile.upsert({
      where: { userId },
      update: {
        mdcnNumber: input.mdcnNumber,
        specialization: input.specialization,
        yearsOfExperience: input.yearsOfExperience,
        verifiedAt,
        canHandleVoiceText: input.canHandleVoiceText ?? true,
        canHandleVoiceCall: input.canHandleVoiceCall ?? false,
        canHandleVideoCall: input.canHandleVideoCall ?? false
      },
      create: {
        userId,
        mdcnNumber: input.mdcnNumber,
        specialization: input.specialization,
        yearsOfExperience: input.yearsOfExperience,
        verifiedAt,
        canHandleVoiceText: input.canHandleVoiceText ?? true,
        canHandleVoiceCall: input.canHandleVoiceCall ?? false,
        canHandleVideoCall: input.canHandleVideoCall ?? false
      }
    });

    res.status(200).json({ message: 'Doctor profile updated', profileId: profile.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/doctors/online:
 *   post:
 *     operationId: setDoctorOnline
 *     tags:
 *       - Doctors
 *     summary: Mark doctor online for matching
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               canHandleVoiceText:
 *                 type: boolean
 *               canHandleVoiceCall:
 *                 type: boolean
 *               canHandleVideoCall:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Doctor marked online
 *       401:
 *         description: Unauthenticated
 *       404:
 *         description: Doctor profile not found
 */
router.post('/online', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    const doctor = await prisma.doctorProfile.findUnique({ where: { userId } });
    if (!doctor) throw new AppError('Doctor profile not found', 404);

    const input = doctorPresenceSchema.parse(req.body || {});

    await redisService.setDoctorOnline(doctor.id, {
      canHandleVoiceText: input.canHandleVoiceText ?? doctor.canHandleVoiceText,
      canHandleVoiceCall: input.canHandleVoiceCall ?? doctor.canHandleVoiceCall,
      canHandleVideoCall: input.canHandleVideoCall ?? doctor.canHandleVideoCall,
      role: 'DOCTOR'
    });

    res.status(200).json({ message: 'Doctor marked online' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/doctors/offline:
 *   post:
 *     operationId: setDoctorOffline
 *     tags:
 *       - Doctors
 *     summary: Mark doctor offline for matching
 *     responses:
 *       200:
 *         description: Doctor marked offline
 *       401:
 *         description: Unauthenticated
 */
router.post('/offline', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    const doctor = await prisma.doctorProfile.findUnique({ where: { userId } });
    if (!doctor) throw new AppError('Doctor profile not found', 404);

    await redisService.setDoctorOffline(doctor.id);
    res.status(200).json({ message: 'Doctor marked offline' });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/doctors/heartbeat:
 *   post:
 *     operationId: doctorHeartbeat
 *     tags:
 *       - Doctors
 *     summary: Update doctor presence heartbeat
 *     responses:
 *       200:
 *         description: Heartbeat recorded
 *       401:
 *         description: Unauthenticated
 */
router.post('/heartbeat', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    const doctor = await prisma.doctorProfile.findUnique({ where: { userId } });
    if (!doctor) throw new AppError('Doctor profile not found', 404);

    await redisService.doctorHeartbeat(doctor.id);
    res.status(200).json({ message: 'Heartbeat recorded' });
  } catch (error) {
    next(error);
  }
});

export default router;
