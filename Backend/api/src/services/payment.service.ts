import axios, { AxiosInstance } from 'axios';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { monitoring } from '../middleware/monitoring.middleware';

type InitParams = { email: string; amount: number; reference: string; metadata?: Record<string, unknown> };
type ChargeParams = { email: string; amount: number; authorizationCode: string; reference: string };
type TransferParams = { amount: number; recipient: string; reference: string; reason: string };
type RecipientParams = { name: string; accountNumber: string; bankCode: string };

interface PaymentProvider {
  name: string;
  initializePayment(params: InitParams): Promise<{ ok: boolean; raw: any }>;
  verifyPayment(reference: string): Promise<{ ok: boolean; status: string; raw: any }>;
  chargeCard(_params: ChargeParams): Promise<{ ok: boolean; raw: any }>;
  transfer(params: TransferParams): Promise<{ ok: boolean; raw: any }>;
  createRecipient?(params: RecipientParams): Promise<{ ok: boolean; code?: string; raw: any }>;
}

class PaystackProvider implements PaymentProvider {
  name = 'paystack';
  private baseUrl = 'https://api.paystack.co';
  private client: AxiosInstance;

  constructor(secretKey: string, client: AxiosInstance = axios) {
    this.client = client;
    this.client.defaults.headers.common.Authorization = `Bearer ${secretKey}`;
  }

  async initializePayment(params: InitParams) {
    const response = await this.client.post(`${this.baseUrl}/transaction/initialize`, {
      email: params.email,
      amount: Math.round(params.amount * 100),
      reference: params.reference,
      metadata: params.metadata
    });

    return { ok: !!response.data?.status, raw: response.data };
  }

  async verifyPayment(reference: string) {
    const response = await this.client.get(`${this.baseUrl}/transaction/verify/${reference}`);
    const status = response.data?.data?.status || 'unknown';
    return { ok: response.data?.status === true, status, raw: response.data };
  }

  async chargeCard() {
    return { ok: false, raw: { message: 'Not used' } };
  }

  async transfer(params: TransferParams) {
    const response = await this.client.post(`${this.baseUrl}/transfer`, {
      source: 'balance',
      amount: Math.round(params.amount * 100),
      recipient: params.recipient,
      reference: params.reference,
      reason: params.reason
    });

    return { ok: !!response.data?.status, raw: response.data };
  }

  async createRecipient(params: RecipientParams) {
    const response = await this.client.post(`${this.baseUrl}/transferrecipient`, {
      type: 'nuban',
      name: params.name,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: 'NGN'
    });

    return {
      ok: !!response.data?.status,
      code: response.data?.data?.recipient_code,
      raw: response.data
    };
  }
}

class FlutterwaveProvider implements PaymentProvider {
  name = 'flutterwave';
  private baseUrl = 'https://api.flutterwave.com/v3';
  private client: AxiosInstance;

  constructor(secretKey: string, client: AxiosInstance = axios) {
    this.client = client;
    this.client.defaults.headers.common.Authorization = `Bearer ${secretKey}`;
  }

  async initializePayment(params: InitParams) {
    const response = await this.client.post(`${this.baseUrl}/payments`, {
      tx_ref: params.reference,
      amount: params.amount,
      currency: 'NGN',
      customer: { email: params.email },
      meta: params.metadata
    });

    const ok = String(response.data?.status || '').toLowerCase() === 'success';
    return { ok, raw: response.data };
  }

  async verifyPayment(reference: string) {
    const response = await this.client.get(`${this.baseUrl}/transactions/${reference}/verify`);
    const status = response.data?.data?.status || 'unknown';
    return { ok: String(response.data?.status || '').toLowerCase() === 'success', status, raw: response.data };
  }

  async chargeCard() {
    return { ok: false, raw: { message: 'Not implemented' } };
  }

  async transfer(params: TransferParams) {
    const [bankCode, accountNumber] = params.recipient.split('-');
    const response = await this.client.post(`${this.baseUrl}/transfers`, {
      account_bank: bankCode,
      account_number: accountNumber,
      amount: params.amount,
      narration: params.reason,
      currency: 'NGN',
      reference: params.reference
    });

    const ok = String(response.data?.status || '').toLowerCase() === 'success';
    return { ok, raw: response.data };
  }
}

export class PaymentService {
  private providers: PaymentProvider[];

  constructor(
    primary?: PaymentProvider,
    secondary?: PaymentProvider
  ) {
    const paystackKey = process.env.PAYSTACK_SECRET_KEY || '';
    const flutterwaveKey = process.env.FLUTTERWAVE_SECRET_KEY || '';

    this.providers = [
      primary || new PaystackProvider(paystackKey),
      secondary || new FlutterwaveProvider(flutterwaveKey)
    ];
  }

  async placeHold(params: {
    patientId: string;
    amount: number;
    metadata: Record<string, unknown>;
  }): Promise<{ success: boolean; reference: string; provider?: string; error?: string }> {
    const reference = `HOLD-${randomBytes(6).toString('hex')}-${Date.now()}`;

    try {
      const patient = await prisma.user.findUnique({ where: { id: params.patientId } });
      if (!patient?.email) {
        return { success: false, reference: '', error: 'Patient email not found' };
      }

      for (const provider of this.providers) {
        try {
          const initialized = await provider.initializePayment({
            email: patient.email,
            amount: params.amount,
            reference,
            metadata: { ...params.metadata, patientId: params.patientId, phase: 'hold' }
          });

          if (initialized.ok) {
            return { success: true, reference, provider: provider.name };
          }
        } catch (error) {
          monitoring.trackException({
            exception: error,
            properties: { provider: provider.name, operation: 'initializePayment' }
          });
        }
      }

      return { success: false, reference: '', error: 'No payment provider could initialize hold' };
    } catch (error) {
      monitoring.trackException({ exception: error, properties: { operation: 'placeHold' } });
      return { success: false, reference: '', error: (error as Error).message };
    }
  }

  async capturePayment(reference: string): Promise<boolean> {
    for (const provider of this.providers) {
      try {
        const verified = await provider.verifyPayment(reference);
        if (verified.ok && ['success', 'successful', 'completed'].includes(String(verified.status).toLowerCase())) {
          await prisma.consultation.updateMany({
            where: { paymentReference: reference },
            data: { paymentStatus: 'CAPTURED' }
          });
          return true;
        }
      } catch (error) {
        monitoring.trackException({ exception: error, properties: { operation: 'capturePayment', provider: provider.name } });
      }
    }

    return false;
  }

  async releaseHold(reference: string): Promise<boolean> {
    await prisma.consultation.updateMany({
      where: { paymentReference: reference },
      data: { paymentStatus: 'RELEASED' }
    });
    return true;
  }

  async processPayout(params: {
    userId: string;
    amount: number;
    bankDetails: { accountName: string; accountNumber: string; bankCode: string };
  }): Promise<{ success: boolean; reference: string; error?: string }> {
    const primary = this.providers[0];
    const reference = `PO-${randomBytes(6).toString('hex')}-${Date.now()}`;

    try {
      let recipient = `${params.bankDetails.bankCode}-${params.bankDetails.accountNumber}`;

      if (primary.createRecipient) {
        const recipientResult = await primary.createRecipient({
          name: params.bankDetails.accountName,
          accountNumber: params.bankDetails.accountNumber,
          bankCode: params.bankDetails.bankCode
        });

        if (recipientResult.ok && recipientResult.code) {
          recipient = recipientResult.code;
        }
      }

      const transfer = await primary.transfer({
        amount: params.amount,
        recipient,
        reference,
        reason: 'Doctor consultation payout'
      });

      if (!transfer.ok) {
        return { success: false, reference: '', error: 'Transfer failed' };
      }

      return { success: true, reference };
    } catch (error) {
      monitoring.trackException({ exception: error, properties: { operation: 'processPayout' } });
      return { success: false, reference: '', error: (error as Error).message };
    }
  }

  async verifyTransaction(reference: string): Promise<{ status: string }> {
    for (const provider of this.providers) {
      try {
        const verification = await provider.verifyPayment(reference);
        if (verification.ok) {
          return { status: verification.status || 'PENDING' };
        }
      } catch (error) {
        monitoring.trackException({ exception: error, properties: { operation: 'verifyTransaction', provider: provider.name } });
      }
    }

    return { status: 'PENDING' };
  }

  async handleWebhook(payload: any, provider: string) {
    const event = payload?.event;
    const data = payload?.data || {};

    if (event === 'charge.success') {
      await prisma.consultation.updateMany({
        where: { paymentReference: data.reference },
        data: { paymentStatus: 'CAPTURED' }
      });
    }

    if (event === 'transfer.failed') {
      monitoring.trackEvent('PayoutFailed', {
        provider,
        reference: data.reference,
        reason: data.complete_message
      });
    }
  }
}

export const paymentService = new PaymentService();
