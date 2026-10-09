import { prisma } from '../db/client.js';
import { DisputeStatus, JobStatus, MilestoneStatus } from '../types/domain.js';
import { sha256Hex } from '../utils/crypto.js';

export interface OpenDisputeInput {
  jobId: string;
  milestoneIndex: number;
  openedBy: string;
  reason: string;
  evidences?: {
    submitterAddress: string;
    s3Key: string;
    fileName: string;
    sha256Hash: string;
    description?: string;
  }[];
}

export class DisputeService {
  async openDispute(input: OpenDisputeInput) {
    const job = await prisma.job.findUnique({
      where: { id: input.jobId },
      include: { milestones: true },
    });

    if (!job) {
      throw new Error(`Job '${input.jobId}' not found`);
    }

    const milestone = job.milestones.find((m) => m.index === input.milestoneIndex);
    if (!milestone) {
      throw new Error(`Milestone ${input.milestoneIndex} not found`);
    }

    // Reason hash
    const reasonHash = sha256Hex(Buffer.from(input.reason, 'utf-8'));

    // Arbitrator fee calculation: (milestone.amount * feeBps) / 10000
    const arbitratorFeeAmount = (milestone.amount * BigInt(job.arbitratorFeeBps)) / 10000n;

    const votingDeadline = new Date(Date.now() + Number(job.disputeWindowSeconds) * 1000);

    return prisma.$transaction(async (tx) => {
      // Update milestone and job status
      await tx.milestone.update({
        where: { id: milestone.id },
        data: { status: MilestoneStatus.DISPUTED },
      });

      await tx.job.update({
        where: { id: input.jobId },
        data: { status: JobStatus.DISPUTED },
      });

      // Create Dispute
      const dispute = await tx.dispute.create({
        data: {
          jobId: input.jobId,
          milestoneIndex: input.milestoneIndex,
          openedBy: input.openedBy,
          reason: input.reason,
          reasonHash,
          status: DisputeStatus.ACTIVE,
          votingDeadline,
          arbitratorFeeAmount,
          evidences: input.evidences
            ? {
                create: input.evidences.map((e) => ({
                  submitterAddress: e.submitterAddress,
                  s3Key: e.s3Key,
                  fileName: e.fileName,
                  sha256Hash: e.sha256Hash,
                  description: e.description,
                  isEncrypted: true,
                })),
              }
            : undefined,
        },
        include: {
          evidences: true,
          votes: true,
        },
      });

      // Increment activeCasesCount for all arbitrators on panel
      for (const arbAddress of job.arbitratorPanel) {
        const arbUser = await tx.user.findUnique({
          where: { address: arbAddress },
          include: { arbitratorProfile: true },
        });
        if (arbUser?.arbitratorProfile) {
          await tx.arbitratorProfile.update({
            where: { id: arbUser.arbitratorProfile.id },
            data: { activeCasesCount: { increment: 1 } },
          });
        }
      }

      return dispute;
    });
  }

  async getDispute(jobId: string, milestoneIndex: number) {
    return prisma.dispute.findUnique({
      where: {
        jobId_milestoneIndex: { jobId, milestoneIndex },
      },
      include: {
        evidences: true,
        votes: true,
        job: true,
      },
    });
  }

  async listDisputes(filters: {
    status?: DisputeStatus;
    arbitratorAddress?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.arbitratorAddress) {
      where.job = {
        arbitratorPanel: { has: filters.arbitratorAddress },
      };
    }

    return prisma.dispute.findMany({
      where,
      include: {
        evidences: true,
        votes: true,
        job: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const disputeService = new DisputeService();
