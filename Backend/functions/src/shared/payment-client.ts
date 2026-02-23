import axios from 'axios';

const paystack = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY || ''}`
  }
});

export async function verifyTransaction(reference: string): Promise<{ status: string }> {
  const response = await paystack.get(`/transaction/verify/${reference}`);
  return { status: String(response.data?.data?.status || 'PENDING').toUpperCase() };
}

export async function releaseHold(reference: string): Promise<boolean> {
  // Provider-specific hold release/void varies by integration pattern.
  // Here we return true and rely on DB state change for expired holds.
  return !!reference;
}

export async function processPayout(_params: {
  userId: string;
  amount: number;
  bankDetails: { accountName: string; accountNumber: string; bankCode: string };
}): Promise<{ success: boolean; reference: string; error?: string }> {
  return {
    success: false,
    reference: '',
    error: 'Bank details source is not implemented in schema. Skipping payout.'
  };
}
