import { app, InvocationContext, Timer } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { prisma } from './shared/prisma';

async function complianceCleanup(_timer: Timer, context: InvocationContext): Promise<void> {
  context.log('Compliance cleanup started');

  await cleanupOldRecordings(context);
  await processRightToBeForgotten(context);
  await anonymizeOldMetadata(context);
}

function getBlobServiceClient() {
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('STORAGE_CONNECTION_STRING is not configured');
  }
  return BlobServiceClient.fromConnectionString(connectionString);
}

async function cleanupOldRecordings(context: InvocationContext): Promise<void> {
  const blobServiceClient = getBlobServiceClient();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  const oldConsultations = await prisma.consultation.findMany({
    where: {
      completedAt: { lt: cutoffDate },
      recordingUrl: { not: null }
    },
    select: { id: true, recordingUrl: true }
  });

  for (const consultation of oldConsultations) {
    if (!consultation.recordingUrl) continue;

    try {
      const url = new URL(consultation.recordingUrl);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const containerName = pathParts[0];
      const blobName = pathParts.slice(1).join('/');

      const containerClient = blobServiceClient.getContainerClient(containerName);
      await containerClient.getBlockBlobClient(blobName).deleteIfExists();

      await prisma.consultation.update({
        where: { id: consultation.id },
        data: { recordingUrl: null }
      });
    } catch (error) {
      context.error(`Failed recording cleanup for ${consultation.id}`, error);
    }
  }
}

async function processRightToBeForgotten(context: InvocationContext): Promise<void> {
  const requests = await prisma.auditLog.findMany({
    where: {
      action: 'REQUEST_DELETION',
      createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }
  });

  for (const request of requests) {
    if (!request.userId) continue;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: request.userId! },
          data: {
            email: `deleted-${request.userId}@redacted.com`,
            phoneNumber: `+234000000${request.userId.slice(0, 5)}`,
            facePersonId: null,
            voiceProfileId: null,
            isActive: false
          }
        });

        await tx.auditLog.create({
          data: {
            userId: request.userId,
            action: 'DELETION_COMPLETED',
            resource: 'USER',
            resourceId: request.userId,
            metadata: { completedAt: new Date().toISOString() }
          }
        });
      });
    } catch (error) {
      context.error(`Deletion processing failed for ${request.userId}`, error);
    }
  }
}

async function anonymizeOldMetadata(context: InvocationContext): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 2);

  const oldConsultations = await prisma.consultation.findMany({
    where: {
      completedAt: { lt: cutoffDate },
      deviceInfo: { not: null }
    },
    select: { id: true }
  });

  for (const consultation of oldConsultations) {
    await prisma.consultation.update({
      where: { id: consultation.id },
      data: { deviceInfo: { anonymized: true } }
    });
  }

  context.log(`Anonymized metadata for ${oldConsultations.length} consultation records`);
}

app.timer('compliance-cleanup', {
  schedule: process.env.COMPLIANCE_CLEANUP_SCHEDULE || '0 0 2 * * *',
  runOnStartup: false,
  handler: complianceCleanup
});
