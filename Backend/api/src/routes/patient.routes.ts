import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

/**
 * @openapi
 * /api/v1/patients/health:
 *   get:
 *     operationId: getPatientsHealth
 *     tags:
 *       - Patients
 *     summary: Patient service health check
 *     responses:
 *       200:
 *         description: Patient service is healthy
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
 *                 service: patient
 */
router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'patient' });
});

router.use(authMiddleware.authenticate);
router.use(requireRole('PATIENT'));

const patientProfileSchema = z.object({
  dateOfBirth: z.string().min(4),
  bloodGroup: z.string().max(10).optional(),
  allergies: z.array(z.string()).optional(),
  chronicConditions: z.array(z.string()).optional(),
  emergencyName: z.string().max(100).optional(),
  emergencyPhone: z.string().max(30).optional()
});

/**
 * @openapi
 * /api/v1/patients/profile:
 *   get:
 *     operationId: getPatientProfile
 *     tags:
 *       - Patients
 *     summary: Get the authenticated patient's profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Patient profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PatientProfileRecord'
 *       401:
 *         description: Unauthenticated
 *       404:
 *         description: Patient profile not found
 */
router.get('/profile', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    const profile = await prisma.patientProfile.findUnique({ where: { userId } });
    if (!profile) throw new AppError('Patient profile not found', 404);

    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/patients/profile:
 *   post:
 *     operationId: upsertPatientProfile
 *     tags:
 *       - Patients
 *     summary: Create or update the authenticated patient's profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PatientProfileInput'
 *     responses:
 *       200:
 *         description: Patient profile updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProfileUpdateResponse'
 *       401:
 *         description: Unauthenticated
 *       404:
 *         description: User not found
 */
router.post('/profile', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    const input = patientProfileSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    const profile = await prisma.patientProfile.upsert({
      where: { userId },
      update: {
        dateOfBirth: new Date(input.dateOfBirth),
        bloodGroup: input.bloodGroup,
        allergies: input.allergies || [],
        chronicConditions: input.chronicConditions || [],
        emergencyName: input.emergencyName,
        emergencyPhone: input.emergencyPhone
      },
      create: {
        userId,
        dateOfBirth: new Date(input.dateOfBirth),
        bloodGroup: input.bloodGroup,
        allergies: input.allergies || [],
        chronicConditions: input.chronicConditions || [],
        emergencyName: input.emergencyName,
        emergencyPhone: input.emergencyPhone
      }
    });

    res.status(200).json({ message: 'Patient profile updated', profileId: profile.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    return next(error);
  }
});

export default router;
