import { prisma } from '../db/client.js';
import { CreateJobDto, JobStatus, MilestoneStatus } from '../types/domain.js';
import { hashMilestoneTitle, hashTerms } from '../utils/crypto.js';

export class JobService {
  async createJob(dto: CreateJobDto) {
    // Validation: client != freelancer
    if (dto.clientAddress === dto.freelancerAddress) {
      throw new Error('Client and freelancer cannot have the same address');
    }

    // Validation: milestone count
    if (!dto.milestones || dto.milestones.length === 0) {
      throw new Error('Job must contain at least one milestone');
    }

    // Validation: arbitrator panel must be odd size between 1 and 7
    const panelSize = dto.arbitratorPanel.length;
    if (panelSize < 1 || panelSize > 7 || panelSize % 2 === 0) {
      throw new Error(`Arbitrator panel must be an odd size between 1 and 7 (provided ${panelSize})`);
    }

    // Validation: arbitrators cannot include client or freelancer
    for (const arb of dto.arbitratorPanel) {
      if (arb === dto.clientAddress || arb === dto.freelancerAddress) {
        throw new Error(`Conflict of interest: Arbitrator ${arb} cannot be client or freelancer`);
      }
    }

    // Sum amounts
    let totalAmount = 0n;
    for (const m of dto.milestones) {
      totalAmount += BigInt(m.amount);
    }

    // Canonical terms hash
    const computedTermsHash = hashTerms(dto.termsJson);

    // Create Job and Milestones in a transaction
    return prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          clientAddress: dto.clientAddress,
          freelancerAddress: dto.freelancerAddress,
          tokenAddress: dto.tokenAddress,
          totalAmount,
          escrowBalance: totalAmount,
          status: JobStatus.CREATED,
          currentMilestoneIndex: 0,
          milestoneCount: dto.milestones.length,
          termsHash: computedTermsHash,
          templateHash: dto.templateHash ?? '',
          arbitratorFeeBps: dto.arbitratorFeeBps ?? 500,
          clientCancelFeeBps: dto.clientCancelFeeBps ?? 0,
          reviewWindowSeconds: BigInt(dto.reviewWindowSeconds ?? 259200),
          workTimeoutSeconds: BigInt(dto.workTimeoutSeconds ?? 604800),
          disputeWindowSeconds: BigInt(dto.disputeWindowSeconds ?? 432000),
          arbitratorStakeReq: BigInt(dto.arbitratorStakeReq ?? '10000000'),
          arbitratorPanel: dto.arbitratorPanel,
          milestones: {
            create: dto.milestones.map((m, idx) => ({
              index: idx,
              title: m.title,
              description: m.description,
              amount: BigInt(m.amount),
              deadline: new Date(m.deadline),
              titleHash: hashMilestoneTitle(m.title),
              status: MilestoneStatus.PENDING,
            })),
          },
        },
        include: {
          milestones: true,
        },
      });

      return job;
    });
  }

  async getJobById(id: string) {
    return prisma.job.findUnique({
      where: { id },
      include: {
        milestones: {
          orderBy: { index: 'asc' },
          include: { deliverables: true },
        },
        disputes: {
          include: { evidences: true, votes: true },
        },
      },
    });
  }

  async getJobByOnChainId(onChainJobId: bigint) {
    return prisma.job.findUnique({
      where: { onChainJobId },
      include: {
        milestones: {
          orderBy: { index: 'asc' },
          include: { deliverables: true },
        },
        disputes: {
          include: { evidences: true, votes: true },
        },
      },
    });
  }

  async linkOnChainJobId(id: string, onChainJobId: bigint) {
    return prisma.job.update({
      where: { id },
      data: {
        onChainJobId,
        status: JobStatus.ACTIVE,
      },
      include: { milestones: true },
    });
  }

  async listJobs(filters: {
    userAddress?: string;
    role?: 'client' | 'freelancer' | 'arbitrator';
    status?: JobStatus;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.userAddress) {
      if (filters.role === 'client') {
        where.clientAddress = filters.userAddress;
      } else if (filters.role === 'freelancer') {
        where.freelancerAddress = filters.userAddress;
      } else if (filters.role === 'arbitrator') {
        where.arbitratorPanel = { has: filters.userAddress };
      } else {
        where.OR = [
          { clientAddress: filters.userAddress },
          { freelancerAddress: filters.userAddress },
          { arbitratorPanel: { has: filters.userAddress } },
        ];
      }
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          milestones: { orderBy: { index: 'asc' } },
        },
        take: filters.limit ?? 20,
        skip: filters.offset ?? 0,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.job.count({ where }),
    ]);

    return { jobs, total };
  }
}

export const jobService = new JobService();
