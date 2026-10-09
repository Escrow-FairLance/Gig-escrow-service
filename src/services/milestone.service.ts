import { prisma } from '../db/client.js';
import { JobStatus, MilestoneStatus } from '../types/domain.js';
import { sha256Hex } from '../utils/crypto.js';

export class MilestoneService {
  /**
   * Freelancer submits deliverable hash for a milestone.
   */
  async submitMilestone(
    jobId: string,
    milestoneIndex: number,
    deliverableHash: string,
    fileMetadata?: {
      fileName: string;
      fileSizeBytes: bigint;
      mimeType: string;
      s3Key: string;
      uploaderAddress: string;
    }
  ) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { milestones: true },
    });

    if (!job) {
      throw new Error(`Job '${jobId}' not found`);
    }

    const milestone = job.milestones.find((m) => m.index === milestoneIndex);
    if (!milestone) {
      throw new Error(`Milestone ${milestoneIndex} not found on job ${jobId}`);
    }

    if (
      milestone.status !== MilestoneStatus.PENDING &&
      milestone.status !== MilestoneStatus.REVISION_REQUESTED
    ) {
      throw new Error(`Milestone cannot be submitted in status '${milestone.status}'`);
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.milestone.update({
        where: { id: milestone.id },
        data: {
          deliverableHash,
          status: MilestoneStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });

      if (fileMetadata) {
        await tx.deliverable.create({
          data: {
            milestoneId: milestone.id,
            uploaderAddress: fileMetadata.uploaderAddress,
            s3Key: fileMetadata.s3Key,
            fileName: fileMetadata.fileName,
            fileSizeBytes: fileMetadata.fileSizeBytes,
            mimeType: fileMetadata.mimeType,
            sha256Hash: deliverableHash,
            isEncrypted: true,
          },
        });
      }

      return updated;
    });
  }

  /**
   * Client approves milestone, triggering payout and advancing to next milestone.
   */
  async approveMilestone(jobId: string, milestoneIndex: number) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { milestones: true },
    });

    if (!job) {
      throw new Error(`Job '${jobId}' not found`);
    }

    const milestone = job.milestones.find((m) => m.index === milestoneIndex);
    if (!milestone) {
      throw new Error(`Milestone ${milestoneIndex} not found`);
    }

    if (milestone.status !== MilestoneStatus.SUBMITTED) {
      throw new Error(`Milestone must be in SUBMITTED status to approve`);
    }

    return prisma.$transaction(async (tx) => {
      const updatedMilestone = await tx.milestone.update({
        where: { id: milestone.id },
        data: {
          status: MilestoneStatus.APPROVED,
          approvedAt: new Date(),
        },
      });

      const nextIndex = milestoneIndex + 1;
      const isCompleted = nextIndex >= job.milestoneCount;
      const newEscrowBalance = job.escrowBalance - milestone.amount;

      await tx.job.update({
        where: { id: jobId },
        data: {
          currentMilestoneIndex: nextIndex,
          escrowBalance: newEscrowBalance < 0n ? 0n : newEscrowBalance,
          status: isCompleted ? JobStatus.COMPLETED : JobStatus.ACTIVE,
        },
      });

      return updatedMilestone;
    });
  }

  /**
   * Client requests revision with feedback. Max 2 revisions allowed.
   */
  async requestRevision(jobId: string, milestoneIndex: number, feedback: string) {
    const milestone = await prisma.milestone.findUnique({
      where: { jobId_index: { jobId, index: milestoneIndex } },
    });

    if (!milestone) {
      throw new Error(`Milestone ${milestoneIndex} not found on job ${jobId}`);
    }

    if (milestone.status !== MilestoneStatus.SUBMITTED) {
      throw new Error(`Milestone must be SUBMITTED to request a revision`);
    }

    if (milestone.revisionCount >= 2) {
      throw new Error('Revision limit exceeded: Maximum 2 revisions allowed. Must approve or open dispute.');
    }

    const feedbackHash = sha256Hex(Buffer.from(feedback, 'utf-8'));

    return prisma.milestone.update({
      where: { id: milestone.id },
      data: {
        status: MilestoneStatus.REVISION_REQUESTED,
        revisionCount: { increment: 1 },
        revisionFeedbackHash: feedbackHash,
      },
    });
  }

  /**
   * Checks if review window has elapsed and triggers auto-release.
   */
  async checkAndAutoRelease(jobId: string, milestoneIndex: number) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { milestones: true },
    });

    if (!job) {
      throw new Error(`Job '${jobId}' not found`);
    }

    const milestone = job.milestones.find((m) => m.index === milestoneIndex);
    if (!milestone || milestone.status !== MilestoneStatus.SUBMITTED || !milestone.submittedAt) {
      return null;
    }

    const elapsedSeconds = (Date.now() - milestone.submittedAt.getTime()) / 1000;
    if (BigInt(Math.floor(elapsedSeconds)) >= job.reviewWindowSeconds) {
      return this.approveMilestone(jobId, milestoneIndex);
    }

    return null;
  }
}

export const milestoneService = new MilestoneService();
