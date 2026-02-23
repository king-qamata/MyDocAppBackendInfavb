import { app, InvocationContext, Timer } from '@azure/functions';
import { prisma } from './shared/prisma';
import { processPayout, releaseHold, verifyTransaction } from './shared/payment-client';

async function paymentProcessor(_timer: Timer, context: InvocationContext): Promise<void> {
  context.log('Payment processor started');

  await processPendingPayouts(context);
  await releaseExpiredHolds(context);
  await reconcileTransactions(context);
}

async function processPendingPayouts(context: InvocationContext): Promise<void> {
  const wallets = await prisma.wallet.findMany({
    where: {
      balance: { gt: 1000 },
      user: { role: 'DOCTOR' }
    },
    include: { user: true }
  });

  for (const wallet of wallets) {
    const metadata = (wallet as any).metadata;
    const bankDetails = metadata?.bankDetails;

    if (!bankDetails) {
      context.warn(`Skipping payout for ${wallet.userId}: bank details unavailable`);
      continue;
    }

    const payout = await processPayout({
      userId: wallet.userId,
      amount: wallet.balance,
      bankDetails
    });

    if (!payout.success) {
      context.error(`Payout failed for ${wallet.userId}: ${payout.error}`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: 0 }
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT',
          amount: wallet.balance,
          status: 'COMPLETED',
          reference: payout.reference,
          description: 'Scheduled doctor payout'
        }
      });
    });

    context.log(`Payout processed for ${wallet.userId}`);
  }
}

async function releaseExpiredHolds(context: InvocationContext): Promise<void> {
  const expired = await prisma.consultation.findMany({
    where: {
      paymentStatus: 'HELD',
      status: 'EXPIRED',
      expiryTime: { lt: new Date() }
    }
  });

  for (const consultation of expired) {
    if (!consultation.paymentReference) continue;

    const released = await releaseHold(consultation.paymentReference);
    if (!released) {
      context.error(`Failed to release hold for ${consultation.id}`);
      continue;
    }

    await prisma.consultation.update({
      where: { id: consultation.id },
      data: { paymentStatus: 'RELEASED' }
    });
  }
}

async function reconcileTransactions(context: InvocationContext): Promise<void> {
  const pending = await prisma.transaction.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  });

  for (const transaction of pending) {
    const verified = await verifyTransaction(transaction.reference);

    if (verified.status !== transaction.status) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: verified.status }
      });
      context.log(`Reconciled transaction ${transaction.id} => ${verified.status}`);
    }
  }
}

app.timer('payment-processor', {
  schedule: process.env.PAYMENT_PROCESSOR_SCHEDULE || '0 */5 * * * *',
  runOnStartup: false,
  handler: paymentProcessor
});
