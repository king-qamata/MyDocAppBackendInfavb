import { CommunicationIdentityClient } from '@azure/communication-identity';
import { ChatClient, CreateChatThreadOptions } from '@azure/communication-chat';
import { AzureCommunicationTokenCredential, CommunicationUserIdentifier } from '@azure/communication-common';
import { BlobServiceClient } from '@azure/storage-blob';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { monitoring } from '../middleware/monitoring.middleware';

export class ACSService {
  private identityClient?: CommunicationIdentityClient;
  private blobServiceClient?: BlobServiceClient;
  private endpoint?: string;

  constructor() {
    const connectionString = process.env.ACS_CONNECTION_STRING;
    this.endpoint =
      process.env.ACS_ENDPOINT ||
      connectionString
        ?.split(';')
        .find((part) => part.toLowerCase().startsWith('endpoint='))
        ?.split('=')[1];

    if (connectionString) {
      this.identityClient = new CommunicationIdentityClient(connectionString);
    }

    if (process.env.STORAGE_CONNECTION_STRING) {
      this.blobServiceClient = BlobServiceClient.fromConnectionString(process.env.STORAGE_CONNECTION_STRING);
    }
  }

  private async createIdentityWithToken(scopes: ('voip' | 'chat')[]) {
    if (!this.identityClient) {
      throw new Error('ACS is not configured');
    }

    const identity = await this.identityClient.createUser();
    const token = await this.identityClient.getToken(identity, scopes);

    return {
      acsUserId: identity.communicationUserId,
      token: token.token,
      expiresOn: token.expiresOn
    };
  }

  async createCallSession(params: {
    consultationId: string;
    tier: string;
    patientId: string;
    doctorId: string;
    patientPhone?: string;
    doctorPhone?: string;
  }) {
    const patient = await this.createIdentityWithToken(['voip']);
    const doctor = await this.createIdentityWithToken(['voip']);

    const callId = `call-${params.consultationId}-${randomUUID()}`;

    monitoring.trackEvent('AcsCallSessionCreated', {
      consultationId: params.consultationId,
      tier: params.tier,
      callId
    });

    return { callId, patient, doctor };
  }

  async createChatThread(params: {
    consultationId: string;
    patientId: string;
    doctorId: string;
  }) {
    if (!this.identityClient || !this.endpoint) {
      throw new Error('ACS chat is not configured');
    }

    const patientIdentity = await this.identityClient.createUser();
    const doctorIdentity = await this.identityClient.createUser();

    const patientToken = await this.identityClient.getToken(patientIdentity, ['chat']);
    const doctorToken = await this.identityClient.getToken(doctorIdentity, ['chat']);

    const adminToken = await this.identityClient.getToken(await this.identityClient.createUser(), ['chat']);
    const chatClient = new ChatClient(this.endpoint, new AzureCommunicationTokenCredential(adminToken.token));

    const options: CreateChatThreadOptions = {
      participants: [
        { id: patientIdentity as CommunicationUserIdentifier, displayName: 'Patient' },
        { id: doctorIdentity as CommunicationUserIdentifier, displayName: 'Doctor' }
      ]
    };

    const thread = await chatClient.createChatThread({
      topic: `Consultation-${params.consultationId}`
    }, options);

    return {
      threadId: thread.chatThread?.id || `thread-${randomUUID()}`,
      patient: {
        acsUserId: patientIdentity.communicationUserId,
        token: patientToken.token,
        expiresOn: patientToken.expiresOn
      },
      doctor: {
        acsUserId: doctorIdentity.communicationUserId,
        token: doctorToken.token,
        expiresOn: doctorToken.expiresOn
      }
    };
  }

  async stopRecording(callId: string) {
    monitoring.trackEvent('AcsRecordingStopped', { callId });
  }

  async handleCallback(event: any) {
    if (!event?.type) return;

    if (event.type === 'Microsoft.Communication.RecordingFileStatusUpdated') {
      await this.handleRecordingCompleted(event);
      return;
    }

    if (event.type === 'Microsoft.Communication.CallEnded') {
      await this.handleCallEnded(event);
    }
  }

  private async handleRecordingCompleted(event: any) {
    const consultationId = event?.data?.consultationId || event?.consultationId;
    const recordingUrl = event?.data?.recordingLocation || event?.recordingLocation;

    if (!consultationId || !recordingUrl) {
      return;
    }

    await prisma.consultation.update({
      where: { id: consultationId },
      data: { recordingUrl }
    });
  }

  private async handleCallEnded(event: any) {
    const consultationId = event?.data?.consultationId || event?.consultationId;
    if (!consultationId) {
      return;
    }

    const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
    if (consultation?.status === 'IN_PROGRESS') {
      await prisma.consultation.update({
        where: { id: consultationId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          diagnosis: consultation.diagnosis || 'Call ended by system'
        }
      });
    }
  }
}

export const acsService = new ACSService();
