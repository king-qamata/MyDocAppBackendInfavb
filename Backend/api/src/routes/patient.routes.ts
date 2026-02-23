import { Router } from 'express';

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

export default router;
