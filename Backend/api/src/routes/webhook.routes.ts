import { Router } from 'express';
import { acsService } from '../services/acs.service';

const router = Router();

/**
 * @openapi
 * /api/v1/webhooks/acs:
 *   post:
 *     operationId: receiveAcsWebhook
 *     tags:
 *       - Webhooks
 *     summary: Receive Azure Communication Services callbacks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 additionalProperties: true
 *               - type: array
 *                 items:
 *                   type: object
 *                   additionalProperties: true
 *     responses:
 *       200:
 *         description: Callback processed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AcsWebhookProcessedResponse'
 *       400:
 *         description: Invalid callback payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
*/
router.post('/acs', async (req, res, next) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    await Promise.all(events.map((event) => acsService.handleCallback(event)));
    res.status(200).json({ processed: events.length });
  } catch (error) {
    next(error);
  }
});

export default router;
