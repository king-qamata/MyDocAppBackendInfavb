import { Router } from 'express';
import { paymentService } from '../services/payment.service';

const router = Router();

/**
 * @openapi
 * /api/v1/payments/webhook/{provider}:
 *   post:
 *     operationId: receivePaymentWebhook
 *     tags:
 *       - Payments
 *     summary: Receive payment provider webhook
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment provider identifier
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Webhook received
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookReceivedResponse'
 *       400:
 *         description: Invalid webhook payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
*/
router.post('/webhook/:provider', async (req, res, next) => {
  try {
    await paymentService.handleWebhook(req.body, req.params.provider);
    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
});

export default router;
