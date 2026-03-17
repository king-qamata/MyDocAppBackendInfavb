import { Router } from 'express';
import crypto from 'crypto';
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
function verifyWebhookSignature(
  provider: string,
  rawBody: Buffer | undefined,
  headers: Record<string, string | string[] | undefined>
): boolean {
  if (!rawBody) return false;

  if (provider === 'paystack') {
    const signature = headers['x-paystack-signature'];
    const secret = process.env.PAYSTACK_SECRET_KEY || '';
    if (!signature || !secret) return false;
    const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    return expected === signature;
  }

  if (provider === 'flutterwave') {
    const hash = headers['verif-hash'];
    const expected = process.env.FLUTTERWAVE_WEBHOOK_HASH || '';
    if (!hash || !expected) return false;
    return hash === expected;
  }

  return false;
}

router.post('/webhook/:provider', async (req, res, next) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    const isValid = verifyWebhookSignature(provider, req.rawBody, req.headers);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    await paymentService.handleWebhook(req.body, req.params.provider);
    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
});

export default router;
