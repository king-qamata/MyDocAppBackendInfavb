import { Router } from 'express';

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

export default router;
