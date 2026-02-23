import { NotificationHubsClient, createFcmV1Notification } from '@azure/notification-hubs';
import axios from 'axios';
import { monitoring } from '../middleware/monitoring.middleware';
import { webPubSubService } from './webpubsub.service';

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'normal' | 'high';
}

export class NotificationService {
  private hubClient?: NotificationHubsClient;

  constructor() {
    const connectionString =
      process.env.NOTIFICATION_HUB_CONNECTION_STRING || process.env.NOTIFICATION_HUB_CONNECTION;
    const hubName =
      process.env.NOTIFICATION_HUB_NAME ||
      this.parseHubNameFromConnectionString(connectionString);

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
    if (!this.hubClient) {
      monitoring.trackEvent('NotificationHubNotConfigured', { userId, title: payload.title });
      return;
    }

    const tag = `user:${userId}`;
    const fcmBody = JSON.stringify({
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {}
    });

    await this.hubClient.sendNotification(
      createFcmV1Notification({
        body: fcmBody
      }),
      { tagExpression: tag }
    );
  }

  async sendToUsers(userIds: string[], payload: NotificationPayload) {
    await Promise.all(userIds.map((id) => this.sendToUser(id, payload)));
  }

  async sendSMS(phoneNumber: string, message: string) {
    if (!process.env.AT_API_KEY || !process.env.AT_USERNAME) {
      monitoring.trackEvent('SmsProviderNotConfigured', { phoneNumber });
      return;
    }

    await axios.post(
      'https://api.africastalking.com/version1/messaging',
      new URLSearchParams({
        username: process.env.AT_USERNAME,
        to: phoneNumber,
        message,
        from: process.env.AT_SENDER_ID || 'MyDoc'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          apiKey: process.env.AT_API_KEY
        }
      }
    );
  }

  async notifyDoctorAccepted(params: {
    patientId: string;
    doctorId: string;
    consultationId: string;
    tier: string;
    communicationSession: any;
  }) {
    await Promise.all([
      this.sendToUser(params.patientId, {
        title: 'Doctor Found',
        body: 'A doctor accepted your consultation request.',
        priority: 'high',
        data: {
          type: 'DOCTOR_ACCEPTED',
          consultationId: params.consultationId,
          tier: params.tier,
          session: params.communicationSession
        }
      }),
      this.sendToUser(params.doctorId, {
        title: 'Consultation Accepted',
        body: `Join consultation ${params.consultationId}.`,
        priority: 'high',
        data: {
          type: 'CONSULTATION_ACCEPTED',
          consultationId: params.consultationId,
          tier: params.tier,
          session: params.communicationSession
        }
      })
    ]);

    await webPubSubService.sendConsultationUpdate(params.consultationId, 'DOCTOR_ACCEPTED', {
      patientId: params.patientId,
      doctorId: params.doctorId
    });
  }

  async notifyRequestExpired(params: { patientId: string; consultationId: string }) {
    await this.sendToUser(params.patientId, {
      title: 'Consultation Expired',
      body: 'No doctor accepted within 2 minutes. Please try again.',
      data: {
        type: 'REQUEST_EXPIRED',
        consultationId: params.consultationId
      }
    });
  }

  async requestLivenessCheck(params: { consultationId: string; doctorId: string }) {
    await this.sendToUser(params.doctorId, {
      title: 'Biometric verification required',
      body: 'Please complete liveness verification now.',
      priority: 'high',
      data: {
        type: 'LIVENESS_CHECK',
        consultationId: params.consultationId
      }
    });
  }

  async broadcastToDoctors(params: { doctorIds: string[]; event: string; data: Record<string, unknown> }) {
    await Promise.all(
      params.doctorIds.map((doctorId) => webPubSubService.sendToUser(doctorId, params.event, params.data))
    );
  }

  async sendPushToDoctors(params: {
    doctorIds: string[];
    title: string;
    body: string;
    priority?: 'normal' | 'high';
    data?: Record<string, unknown>;
  }) {
    await this.sendToUsers(params.doctorIds, {
      title: params.title,
      body: params.body,
      priority: params.priority,
      data: params.data
    });
  }
}

export const notificationService = new NotificationService();
