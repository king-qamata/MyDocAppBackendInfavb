import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { acsService } from '../services/acs.service';

const router = Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

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
router.post('/acs', webhookLimiter, async (req, res, next) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];

    const aegEventType = String(req.headers['aeg-event-type'] || '');
    if (aegEventType === 'SubscriptionValidation') {
      const validationCode = events?.[0]?.data?.validationCode;
      return res.status(200).json({ validationResponse: validationCode });
    }

    const allowedTypes = (process.env.ACS_WEBHOOK_ALLOWED_TYPES || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const filtered = allowedTypes.length
      ? events.filter((event) => allowedTypes.includes(String(event?.type || '')))
      : events;

    if (filtered.length === 0) {
      return res.status(202).json({ processed: 0 });
    }

    await Promise.all(filtered.map((event) => acsService.handleCallback(event)));
    res.status(200).json({ processed: filtered.length });
  } catch (error) {
    next(error);
  }
});

export default router;
