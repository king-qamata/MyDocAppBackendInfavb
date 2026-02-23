import axios from 'axios';
import { prisma } from '../lib/prisma';
import { monitoring } from '../middleware/monitoring.middleware';

export class SpeakerService {
  private endpoint = process.env.AZURE_SPEAKER_ENDPOINT || process.env.SPEAKER_API_ENDPOINT;
  private apiKey = process.env.AZURE_SPEAKER_API_KEY || process.env.SPEAKER_API_KEY;

  private get headers() {
    return {
      'Ocp-Apim-Subscription-Key': this.apiKey || '',
      'Content-Type': 'application/octet-stream'
    };
  }

  private assertConfigured() {
    if (!this.endpoint || !this.apiKey) {
      throw new Error('Speaker Recognition API is not configured');
    }
  }

  async enrollVoice(doctorId: string, audioBuffer: Buffer): Promise<string> {
    this.assertConfigured();

    const profile = await axios.post(
      `${this.endpoint}/speaker/recognition/v2.0/text-independent/profiles`,
      { locale: 'en-NG' },
      { headers: { 'Ocp-Apim-Subscription-Key': this.apiKey! } }
    );

    const profileId = profile.data?.profileId;
    if (!profileId) {
      throw new Error('Failed to create speaker profile');
    }

    await axios.post(
      `${this.endpoint}/speaker/recognition/v2.0/text-independent/profiles/${profileId}/enrollments`,
      audioBuffer,
      { headers: this.headers }
    );

    await prisma.user.update({
      where: { id: doctorId },
      data: { voiceProfileId: profileId }
    });

    return profileId;
  }

  async verifyVoice(profileId: string, audioBuffer: Buffer): Promise<{ verified: boolean; confidence: number }> {
    try {
      this.assertConfigured();

      const result = await axios.post(
        `${this.endpoint}/speaker/recognition/v2.0/text-independent/profiles/${profileId}/verify`,
        audioBuffer,
        { headers: this.headers }
      );

      const score = Number(result.data?.score || 0);
      return {
        verified: score >= 0.5,
        confidence: score
      };
    } catch (error) {
      monitoring.trackException({ exception: error, properties: { operation: 'verifyVoice' } });
      return { verified: false, confidence: 0 };
    }
  }

  async startContinuousVerification(
    consultationId: string,
    doctorId: string,
    profileId: string,
    onVerificationResult: (result: any) => void
  ) {
    let runs = 0;
    const timer = setInterval(async () => {
      runs += 1;

      const chunk = await this.getRecentAudioChunk(consultationId, doctorId);
      if (!chunk) {
        if (runs >= 5) clearInterval(timer);
        return;
      }

      const result = await this.verifyVoice(profileId, chunk);
      onVerificationResult({ ...result, attempt: runs, timestamp: new Date().toISOString() });

      await prisma.auditLog.create({
        data: {
          userId: doctorId,
          action: 'VOICE_VERIFICATION',
          resource: 'CONSULTATION',
          resourceId: consultationId,
          metadata: { ...result, attempt: runs }
        }
      });

      if (runs >= 5) {
        clearInterval(timer);
      }
    }, 30000);

    return timer;
  }

  private async getRecentAudioChunk(_consultationId: string, _doctorId: string): Promise<Buffer | null> {
    return null;
  }

  async deleteProfile(profileId: string) {
    try {
      this.assertConfigured();
      await axios.delete(`${this.endpoint}/speaker/recognition/v2.0/text-independent/profiles/${profileId}`, {
        headers: { 'Ocp-Apim-Subscription-Key': this.apiKey! }
      });
    } catch (error) {
      monitoring.trackException({ exception: error, properties: { operation: 'deleteProfile' } });
    }
  }
}

export const speakerService = new SpeakerService();
