import axios, { AxiosInstance } from 'axios';
import { randomBytes } from 'crypto';

type InitParams = { email: string; amount: number; reference: string; metadata?: Record<string, unknown> };
type TransferParams = { amount: number; recipient: string; reference: string; reason: string };
type RecipientParams = { name: string; accountNumber: string; bankCode: string };

interface PaymentProvider {
  name: string;
  verifyPayment(reference: string): Promise<{ ok: boolean; status: string }>;
  transfer(params: TransferParams): Promise<{ ok: boolean }>;
  createRecipient?(params: RecipientParams): Promise<{ ok: boolean; code?: string }>;
  initializePayment?(params: InitParams): Promise<{ ok: boolean }>;
}

class PaystackProvider implements PaymentProvider {
  name = 'paystack';
  private baseUrl = 'https://api.paystack.co';
  private client: AxiosInstance;

  constructor(secretKey: string, client: AxiosInstance = axios) {
    this.client = client;
    this.client.defaults.headers.common.Authorization = `Bearer ${secretKey}`;
  }

  async verifyPayment(reference: string) {
    const response = await this.client.get(`${this.baseUrl}/transaction/verify/${reference}`);
    const status = response.data?.data?.status || 'unknown';
    return { ok: response.data?.status === true, status };
  }

  async transfer(params: TransferParams) {
    const response = await this.client.post(`${this.baseUrl}/transfer`, {
      source: 'balance',
      amount: Math.round(params.amount * 100),
      recipient: params.recipient,
      reference: params.reference,
      reason: params.reason
    });

    return { ok: !!response.data?.status };
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
      code: response.data?.data?.recipient_code
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

  async verifyPayment(reference: string) {
    const response = await this.client.get(`${this.baseUrl}/transactions/${reference}/verify`);
    const status = response.data?.data?.status || 'unknown';
    return { ok: String(response.data?.status || '').toLowerCase() === 'success', status };
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
    return { ok };
  }
}

const providers: PaymentProvider[] = [
  new PaystackProvider(process.env.PAYSTACK_SECRET_KEY || ''),
  new FlutterwaveProvider(process.env.FLUTTERWAVE_SECRET_KEY || '')
];

export async function verifyTransaction(reference: string): Promise<{ status: string }> {
  for (const provider of providers) {
    try {
      const verification = await provider.verifyPayment(reference);
      if (verification.ok) {
        return { status: String(verification.status || 'PENDING').toUpperCase() };
      }
    } catch {
      // swallow and try next provider
    }
  }

  return { status: 'PENDING' };
}

export async function releaseHold(reference: string): Promise<boolean> {
  // Provider-specific hold release/void varies by integration pattern.
  // We rely on DB state change for expired holds.
  return !!reference;
}

export async function processPayout(params: {
  userId: string;
  amount: number;
  bankDetails: { accountName: string; accountNumber: string; bankCode: string };
}): Promise<{ success: boolean; reference: string; error?: string }> {
  const primary = providers[0];
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
    return { success: false, reference: '', error: (error as Error).message };
  }
}
