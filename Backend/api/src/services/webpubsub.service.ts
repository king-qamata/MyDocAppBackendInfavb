import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { ConsultationTier } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { redisService } from './redis.service';
import { monitoring } from '../middleware/monitoring.middleware';

export class WebPubSubService {
  private hubName = process.env.WEB_PUBSUB_HUB || 'consultation';
  private serviceClient?: WebPubSubServiceClient;

  constructor() {
    const connectionString =
      process.env.WEB_PUBSUB_CONNECTION_STRING || process.env.WEBPUBSUB_CONNECTION_STRING;
    if (connectionString) {
      this.serviceClient = new WebPubSubServiceClient(connectionString, this.hubName);
    }
  }

  private ensureClient() {
    if (!this.serviceClient) {
      throw new Error('Web PubSub is not configured');
    }
  }

  async broadcastNewConsultation(consultation: any, eligibleDoctors: string[]) {
    this.ensureClient();
    const payload = {
      type: 'NEW_CONSULTATION',
      timestamp: new Date().toISOString(),
      data: {
        consultationId: consultation.id,
        tier: consultation.tier,
        price: consultation.price,
        expiresAt: consultation.expiryTime
      }
    };

    await Promise.all(
      eligibleDoctors.map((doctorId) =>
        this.serviceClient!.group(`doctor-${doctorId}`).sendToAll(payload)
      )
    );

    const tierGroup = `tier-${String(consultation.tier).toLowerCase()}`;
    await this.serviceClient!.group(tierGroup).sendToAll(payload);
  }

  async sendToUser(userId: string, type: string, data: Record<string, unknown>) {
    this.ensureClient();
    await this.serviceClient!.sendToUser(`user-${userId}`, { type, data, timestamp: new Date().toISOString() });
  }

  async sendToGroup(group: string, type: string, data: Record<string, unknown>) {
    this.ensureClient();
    await this.serviceClient!.group(group).sendToAll({ type, data, timestamp: new Date().toISOString() });
  }

  async handleClientConnection(userId: string, role: string, connectionId: string) {
    this.ensureClient();

    try {
      await this.serviceClient!.group(`user-${userId}`).addConnection(connectionId);

      if (role === 'DOCTOR') {
        const doctor = await prisma.doctorProfile.findUnique({ where: { userId } });
        await redisService.setDoctorOnline(userId, {
          role,
          canHandleVoiceText: !!doctor?.canHandleVoiceText,
          canHandleVoiceCall: !!doctor?.canHandleVoiceCall,
          canHandleVideoCall: !!doctor?.canHandleVideoCall
        });

        await this.serviceClient!.group('online-doctors').addConnection(connectionId);
        if (doctor?.canHandleVideoCall) await this.serviceClient!.group('tier-super').addConnection(connectionId);
        if (doctor?.canHandleVoiceCall) await this.serviceClient!.group('tier-priority').addConnection(connectionId);
        if (doctor?.canHandleVoiceText) await this.serviceClient!.group('tier-normal').addConnection(connectionId);
      }
    } catch (error) {
      monitoring.trackException({ exception: error, properties: { operation: 'handleClientConnection', userId } });
    }
  }

  async handleClientDisconnection(userId: string) {
    await redisService.setDoctorOffline(userId);
  }

  async sendConsultationUpdate(consultationId: string, status: string, participants: { patientId?: string; doctorId?: string }) {
    const payload = { consultationId, status, timestamp: new Date().toISOString() };
    if (participants.patientId) await this.sendToUser(participants.patientId, 'CONSULTATION_UPDATE', payload);
    if (participants.doctorId) await this.sendToUser(participants.doctorId, 'CONSULTATION_UPDATE', payload);
  }

  async sendTypingIndicator(consultationId: string, userId: string, isTyping: boolean) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      select: { patientId: true, doctorId: true }
    });

    if (!consultation) {
      return;
    }

    const recipientId = consultation.patientId === userId ? consultation.doctorId : consultation.patientId;
    if (recipientId) {
      await this.sendToUser(recipientId, 'TYPING_INDICATOR', { consultationId, userId, isTyping });
    }
  }

  async generateAccessToken(userId: string, role: string): Promise<string> {
    this.ensureClient();

    const tierRoles = role === 'DOCTOR'
      ? ['tier-normal', 'tier-priority', 'tier-super', 'online-doctors'].map((group) => `webpubsub.joinLeaveGroup.${group}`)
      : [];

    const token = await this.serviceClient!.getClientAccessToken({
      userId: `user-${userId}`,
      roles: [`webpubsub.joinLeaveGroup.user-${userId}`, ...tierRoles],
      expirationTimeInMinutes: 60
    });

    return token.url;
  }

  async broadcastTierUpdate(tier: ConsultationTier, event: string, data: Record<string, unknown>) {
    await this.sendToGroup(`tier-${tier.toLowerCase()}`, event, data);
  }
}

export const webPubSubService = new WebPubSubService();
