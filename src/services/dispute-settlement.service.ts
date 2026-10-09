import { prisma } from '../db/client.js';
import { DisputeStatus, JobStatus, MilestoneStatus } from '../types/domain.js';
import { arbitratorService } from './arbitrator.service.js';

export class DisputeSettlementService {
  /**
   * Arbitrator casts vote with freelancerShareBps (0 to 10000).
   * Automatically resolves dispute if majority is achieved.
   */
  async castVote(
    jobId: string,
    milestoneIndex: number,
    arbitratorAddress: string,
    freelancerShareBps: number,
    txHash?: string
  ) {
    if (freelancerShareBps < 0 || freelancerShareBps > 10000) {
      throw new Error(`Invalid vote: freelancerShareBps must be between 0 and 10000 (received ${freelancerShareBps})`);
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { milestones: true },
    });

    if (!job) throw new Error(`Job '${jobId}' not found`);
    if (!job.arbitratorPanel.includes(arbitratorAddress)) {
      throw new Error(`Address '${arbitratorAddress}' is not on the agreed arbitrator panel for this job`);
    }

    const dispute = await prisma.dispute.findUnique({
      where: { jobId_milestoneIndex: { jobId, milestoneIndex } },
      include: { votes: true },
    });

    if (!dispute) throw new Error(`Dispute not found for job ${jobId} milestone ${milestoneIndex}`);
    if (dispute.status !== DisputeStatus.ACTIVE) {
      throw new Error(`Dispute is already resolved`);
    }

    // Check duplicate vote
    if (dispute.votes.some((v) => v.arbitratorAddress === arbitratorAddress)) {
      throw new Error(`Arbitrator '${arbitratorAddress}' has already voted on this dispute`);
    }

    return prisma.$transaction(async (tx) => {
      // 1. Record Vote
      await tx.arbitratorVote.create({
        data: {
          disputeId: dispute.id,
          arbitratorAddress,
          freelancerShareBps,
          txHash,
        },
      });

      const updatedVotes = await tx.arbitratorVote.findMany({
        where: { disputeId: dispute.id },
      });

      const panelSize = job.arbitratorPanel.length;
      const majorityThreshold = Math.floor(panelSize / 2) + 1;

      // 2. Check if majority threshold is met
      if (updatedVotes.length >= majorityThreshold) {
        // Calculate average settled basis points
        const sumBps = updatedVotes.reduce((acc, v) => acc + v.freelancerShareBps, 0);
        const settledBps = Math.round(sumBps / updatedVotes.length);

        const milestone = job.milestones.find((m) => m.index === milestoneIndex);
        if (!milestone) throw new Error('Milestone not found');

        const totalFee = dispute.arbitratorFeeAmount;
        const distributable = milestone.amount > totalFee ? milestone.amount - totalFee : 0n;

        const freelancerAmount = (distributable * BigInt(settledBps)) / 10000n;
        const clientAmount = distributable - freelancerAmount;

        // Resolve dispute
        const resolvedDispute = await tx.dispute.update({
          where: { id: dispute.id },
          data: {
            status: DisputeStatus.RESOLVED,
            settledFreelancerShareBps: settledBps,
            resolvedAt: new Date(),
          },
        });

        // Update Milestone
        await tx.milestone.update({
          where: { id: milestone.id },
          data: { status: MilestoneStatus.RESOLVED },
        });

        // Advance job
        const nextIndex = milestoneIndex + 1;
        const isCompleted = nextIndex >= job.milestoneCount;
        const newEscrow = job.escrowBalance > milestone.amount ? job.escrowBalance - milestone.amount : 0n;

        await tx.job.update({
          where: { id: jobId },
          data: {
            currentMilestoneIndex: nextIndex,
            escrowBalance: newEscrow,
            status: isCompleted ? JobStatus.COMPLETED : JobStatus.ACTIVE,
          },
        });

        // Reward voting arbitrators with fees
        const voterFee = updatedVotes.length > 0 ? totalFee / BigInt(updatedVotes.length) : 0n;
        for (const vote of updatedVotes) {
          await arbitratorService.recordVote(vote.arbitratorAddress, voterFee);
        }

        return {
          resolved: true,
          settledBps,
          freelancerAmount: freelancerAmount.toString(),
          clientAmount: clientAmount.toString(),
          arbitratorFee: totalFee.toString(),
          dispute: resolvedDispute,
        };
      }

      return {
        resolved: false,
        votesCast: updatedVotes.length,
        requiredVotes: majorityThreshold,
      };
    });
  }
}

export const disputeSettlementService = new DisputeSettlementService();
