import axios from 'axios';
import { prisma } from '../lib/prisma';
import { monitoring } from '../middleware/monitoring.middleware';

export class FaceService {
  private personGroupId = process.env.AZURE_FACE_PERSON_GROUP || 'mydoc-doctors';
  private endpoint = process.env.AZURE_FACE_ENDPOINT || process.env.FACE_API_ENDPOINT;
  private apiKey = process.env.AZURE_FACE_API_KEY || process.env.FACE_API_KEY;

  private get headers() {
    return {
      'Ocp-Apim-Subscription-Key': this.apiKey || '',
      'Content-Type': 'application/octet-stream'
    };
  }

  private assertConfigured() {
    if (!this.endpoint || !this.apiKey) {
      throw new Error('Face API is not configured');
    }
  }

  async initializePersonGroup() {
    if (!this.endpoint || !this.apiKey) {
      return;
    }

    try {
      await axios.put(
        `${this.endpoint}/face/v1.0/persongroups/${this.personGroupId}`,
        {
          name: 'MyDoc Doctors',
          recognitionModel: 'recognition_04'
        },
        { headers: { 'Ocp-Apim-Subscription-Key': this.apiKey } }
      );
    } catch (error) {
      monitoring.trackException({ exception: error, properties: { operation: 'initializePersonGroup' } });
    }
  }

  async enrollDoctor(userId: string, faceImageBuffer: Buffer): Promise<string> {
    this.assertConfigured();

    const person = await axios.post(
      `${this.endpoint}/face/v1.0/persongroups/${this.personGroupId}/persons`,
      { name: userId },
      { headers: { 'Ocp-Apim-Subscription-Key': this.apiKey! } }
    );

    const personId = person.data?.personId;
    if (!personId) {
      throw new Error('Unable to create person profile for doctor');
    }

    await axios.post(
      `${this.endpoint}/face/v1.0/persongroups/${this.personGroupId}/persons/${personId}/persistedFaces`,
      faceImageBuffer,
      { headers: this.headers }
    );

    await axios.post(
      `${this.endpoint}/face/v1.0/persongroups/${this.personGroupId}/train`,
      {},
      { headers: { 'Ocp-Apim-Subscription-Key': this.apiKey! } }
    );

    await prisma.user.update({
      where: { id: userId },
      data: { facePersonId: personId }
    });

    return personId;
  }

  async verifyDoctor(userId: string, faceImageBuffer: Buffer): Promise<{ verified: boolean; confidence: number; livenessPassed: boolean }> {
    this.assertConfigured();

    const detect = await axios.post(
      `${this.endpoint}/face/v1.0/detect?recognitionModel=recognition_04&returnFaceId=true`,
      faceImageBuffer,
      { headers: this.headers }
    );

    const faceId = detect.data?.[0]?.faceId;
    if (!faceId) {
      return { verified: false, confidence: 0, livenessPassed: false };
    }

    const identify = await axios.post(
      `${this.endpoint}/face/v1.0/identify`,
      {
        personGroupId: this.personGroupId,
        faceIds: [faceId],
        maxNumOfCandidatesReturned: 1,
        confidenceThreshold: 0.6
      },
      { headers: { 'Ocp-Apim-Subscription-Key': this.apiKey! } }
    );

    const candidate = identify.data?.[0]?.candidates?.[0];
    const expected = await prisma.user.findUnique({ where: { id: userId }, select: { facePersonId: true } });

    const verified = !!candidate && expected?.facePersonId === candidate.personId;
    const confidence = candidate?.confidence || 0;

    return {
      verified,
      confidence,
      livenessPassed: verified || confidence > 0.6
    };
  }

  async verifyInCall(doctorId: string, frameBuffer: Buffer): Promise<boolean> {
    try {
      const result = await this.verifyDoctor(doctorId, frameBuffer);

      await prisma.auditLog.create({
        data: {
          userId: doctorId,
          action: 'IN_CALL_VERIFICATION',
          resource: 'CONSULTATION',
          metadata: {
            verified: result.verified,
            confidence: result.confidence,
            livenessPassed: result.livenessPassed
          }
        }
      });

      return result.verified;
    } catch (error) {
      monitoring.trackException({ exception: error, properties: { operation: 'verifyInCall' } });
      return false;
    }
  }

  async deleteDoctor(personId: string) {
    this.assertConfigured();

    await axios.delete(
      `${this.endpoint}/face/v1.0/persongroups/${this.personGroupId}/persons/${personId}`,
      {
        headers: { 'Ocp-Apim-Subscription-Key': this.apiKey! }
      }
    );
  }
}

export const faceService = new FaceService();
