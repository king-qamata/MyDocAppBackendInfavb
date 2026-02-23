import { Router } from 'express';
import { ConsultationController } from '../controllers/consultation.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { rateLimiter } from '../middleware/rate-limit.middleware';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();
const consultationController = new ConsultationController();

router.use(authMiddleware.authenticate);

/**
 * @openapi
 * /api/v1/consultations/request:
 *   post:
 *     operationId: requestConsultation
 *     tags:
 *       - Consultations
 *     summary: Request a new consultation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RequestConsultationInput'
 *     responses:
 *       201:
 *         description: Consultation requested
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConsultationRequestResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/request', rateLimiter.consultationRequest(), asyncHandler((req, res) => consultationController.requestConsultation(req, res)));
/**
 * @openapi
 * /api/v1/consultations/accept:
 *   post:
 *     operationId: acceptConsultation
 *     tags:
 *       - Consultations
 *     summary: Accept consultation request (doctor)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AcceptConsultationInput'
 *     responses:
 *       200:
 *         description: Consultation accepted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AcceptConsultationResponse'
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Doctor not eligible
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Already claimed/expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       410:
 *         description: Request expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/accept', asyncHandler((req, res) => consultationController.acceptConsultation(req, res)));

/**
 * @openapi
 * /api/v1/consultations/patient/history:
 *   get:
 *     operationId: getPatientConsultationHistory
 *     tags:
 *       - Consultations
 *     summary: Get patient consultation history
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Consultation history
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConsultationHistoryResponse'
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/patient/history', asyncHandler((req, res) => consultationController.getPatientHistory(req, res)));

/**
 * @openapi
 * /api/v1/consultations/doctor/schedule:
 *   get:
 *     operationId: getDoctorConsultationSchedule
 *     tags:
 *       - Consultations
 *     summary: Get doctor schedule (accepted and in-progress consultations)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Doctor schedule
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConsultationHistoryResponse'
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/doctor/schedule', asyncHandler((req, res) => consultationController.getDoctorSchedule(req, res)));

/**
 * @openapi
 * /api/v1/consultations/{consultationId}/start:
 *   post:
 *     operationId: startConsultation
 *     tags:
 *       - Consultations
 *     summary: Start consultation session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: consultationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Consultation started
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StartConsultationResponse'
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Unauthorized participant
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Consultation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:consultationId/start', asyncHandler((req, res) => consultationController.startConsultation(req, res)));

/**
 * @openapi
 * /api/v1/consultations/{consultationId}/complete:
 *   post:
 *     operationId: completeConsultation
 *     tags:
 *       - Consultations
 *     summary: Complete consultation session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: consultationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CompleteConsultationInput'
 *     responses:
 *       200:
 *         description: Consultation completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CompleteConsultationResponse'
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Unauthorized or consultation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:consultationId/complete', asyncHandler((req, res) => consultationController.completeConsultation(req, res)));

/**
 * @openapi
 * /api/v1/consultations/{consultationId}/rate:
 *   post:
 *     operationId: rateConsultationDoctor
 *     tags:
 *       - Consultations
 *     summary: Rate doctor after consultation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: consultationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RateDoctorInput'
 *     responses:
 *       200:
 *         description: Rating stored
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GenericMessageResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Consultation/doctor not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:consultationId/rate', asyncHandler((req, res) => consultationController.rateDoctor(req, res)));

/**
 * @openapi
 * /api/v1/consultations/{consultationId}/escalate:
 *   post:
 *     operationId: escalateConsultationTier
 *     tags:
 *       - Consultations
 *     summary: Escalate consultation tier
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: consultationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EscalateTierInput'
 *     responses:
 *       200:
 *         description: Tier escalated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EscalateTierResponse'
 *       400:
 *         description: Invalid escalation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Consultation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Consultation state conflict
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:consultationId/escalate', asyncHandler((req, res) => consultationController.escalateTier(req, res)));

/**
 * @openapi
 * /api/v1/consultations/{consultationId}:
 *   get:
 *     operationId: getConsultationById
 *     tags:
 *       - Consultations
 *     summary: Get consultation details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: consultationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Consultation details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConsultationDetailsResponse'
 *       404:
 *         description: Consultation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:consultationId', asyncHandler((req, res) => consultationController.getConsultation(req, res)));

export default router;
