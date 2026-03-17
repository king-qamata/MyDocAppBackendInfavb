import { app, InvocationContext, Timer } from '@azure/functions';
import { NotificationHubsClient, createFcmV1Notification } from '@azure/notification-hubs';
import { prisma } from './shared/prisma';
import { releaseHold } from './shared/payment-client';

type NotificationPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'normal' | 'high';
};

class NotificationClient {
  private hubClient?: NotificationHubsClient;

  constructor() {
    const connectionString =
      process.env.NOTIFICATION_HUB_CONNECTION_STRING || process.env.NOTIFICATION_HUB_CONNECTION;
    const hubName =
      process.env.NOTIFICATION_HUB_NAME || this.parseHubNameFromConnectionString(connectionString);

    if (connectionString && hubName) {
      this.hubClient = new NotificationHubsClient(connectionString, hubName);
    }
  }

  private parseHubNameFromConnectionString(connectionString?: string) {
    if (!connectionString) return undefined;
    const entityPath = connectionString
      .split(';')
      .find((entry) => entry.startsWith('EntityPath='));
    return entityPath?.split('=')[1];
  }

  async sendToUser(userId: string, payload: NotificationPayload) {
    if (!this.hubClient) return;

    const fcmBody = JSON.stringify({
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {}
    });

    await this.hubClient.sendNotification(
      createFcmV1Notification({ body: fcmBody }),
      { tagExpression: `user:${userId}` }
    );
  }
}

const notificationClient = new NotificationClient();

async function notificationOrchestrator(_timer: Timer, context: InvocationContext): Promise<void> {
  context.log('Notification orchestrator started');

  await expireConsultations(context);
  await requestLivenessChecks(context);
}

async function expireConsultations(context: InvocationContext): Promise<void> {
  const now = new Date();

  const expired = await prisma.consultation.findMany({
    where: {
      status: 'REQUESTED',
      expiryTime: { lt: now }
    },
    include: { patient: { select: { userId: true } } }
  });

  for (const consultation of expired) {
    if (!consultation.patient?.userId) continue;

    await prisma.consultation.update({
      where: { id: consultation.id },
      data: {
        status: 'EXPIRED',
        expiryNotifiedAt: now,
        paymentStatus: consultation.paymentReference ? 'RELEASED' : consultation.paymentStatus
      }
    });

    if (consultation.paymentReference) {
      await releaseHold(consultation.paymentReference);
    }

    await notificationClient.sendToUser(consultation.patient.userId, {
      title: 'Consultation Expired',
      body: 'No doctor accepted within 2 minutes. Please try again.',
      data: {
        type: 'REQUEST_EXPIRED',
        consultationId: consultation.id
      }
    });
  }

  if (expired.length > 0) {
    context.log(`Expired ${expired.length} consultations`);
  }
}

async function requestLivenessChecks(context: InvocationContext): Promise<void> {
  const now = new Date();
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);

  const candidates = await prisma.consultation.findMany({
    where: {
      tier: 'SUPER',
      status: 'IN_PROGRESS',
      startedAt: { lt: cutoff },
      livenessRequestedAt: null,
      doctorId: { not: null }
    },
    include: { doctor: { select: { userId: true } } }
  });

  for (const consultation of candidates) {
    const doctorUserId = consultation.doctor?.userId;
    if (!doctorUserId) continue;

    await prisma.consultation.update({
      where: { id: consultation.id },
      data: { livenessRequestedAt: now }
    });

    await notificationClient.sendToUser(doctorUserId, {
      title: 'Biometric verification required',
      body: 'Please complete liveness verification now.',
      priority: 'high',
      data: {
        type: 'LIVENESS_CHECK',
        consultationId: consultation.id
      }
    });
  }

  if (candidates.length > 0) {
    context.log(`Requested liveness checks for ${candidates.length} consultations`);
  }
}

app.timer('notification-orchestrator', {
  schedule: process.env.NOTIFICATION_ORCHESTRATOR_SCHEDULE || '0 */1 * * * *',
  runOnStartup: false,
  handler: notificationOrchestrator
});
