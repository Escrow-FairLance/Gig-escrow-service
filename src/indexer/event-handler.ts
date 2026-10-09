import { prisma } from '../db/client.js';
import { DecodedContractEvent } from '../stellar/events.js';
import { JobStatus, MilestoneStatus, DisputeStatus } from '../types/domain.js';
import { arbitratorService } from '../services/arbitrator.service.js';

export class ContractEventHandler {
  /**
   * Dispatches and processes a single decoded contract event idempotently.
   */
  async handleEvent(event: DecodedContractEvent, txHash: string, ledgerSeq: number, contractId: string): Promise<boolean> {
    // 1. Check idempotency: Have we already processed this contractId + txHash + topic?
    const existingLog = await prisma.eventLog.findUnique({
      where: {
        contractId_txHash_topic: {
          contractId,
          txHash,
          topic: event.topic,
        },
      },
    });

    if (existingLog) {
      // Already handled
      return false;
    }

    // 2. Process event by topic
    switch (event.topic) {
      case 'job_created':
        await this.handleJobCreated(event);
        break;

      case 'milestone_submitted':
        await this.handleMilestoneSubmitted(event);
        break;

      case 'milestone_approved':
        await this.handleMilestoneApproved(event);
        break;

      case 'revision_requested':
        await this.handleRevisionRequested(event);
        break;

      case 'dispute_opened':
        await this.handleDisputeOpened(event);
        break;

      case 'arbitrator_voted':
        await this.handleArbitratorVoted(event, txHash);
        break;

      case 'dispute_resolved':
        await this.handleDisputeResolved(event);
        break;

      case 'auto_released':
        await this.handleAutoReleased(event);
        break;

      case 'reclaimed':
        await this.handleReclaimed(event);
        break;

      case 'arbitrator_slashed':
        await this.handleArbitratorSlashed(event);
        break;

      case 'mutual_closed':
        await this.handleMutualClosed(event);
        break;

      default:
        console.info(`Unhandled contract event topic: ${event.topic}`);
    }

    // 3. Persist EventLog
    await prisma.eventLog.create({
      data: {
        contractId,
        topic: event.topic,
        txHash,
        ledgerSeq,
        eventData: event.data as any,
      },
    });

    return true;
  }

  private async handleJobCreated(event: DecodedContractEvent) {
    const job = await prisma.job.findFirst({
      where: { termsHash: (event.data.terms_hash as string) ?? undefined },
    });
    if (job) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          onChainJobId: event.jobId,
          status: JobStatus.ACTIVE,
        },
      });
    }
  }

  private async handleMilestoneSubmitted(event: DecodedContractEvent) {
    const milestoneIndex = Number(event.data.milestone_index ?? 0);
    const deliverableHash = (event.data.deliverable_hash as string) ?? '';

    const job = await prisma.job.findUnique({
      where: { onChainJobId: event.jobId },
      include: { milestones: true },
    });

    if (job) {
      const milestone = job.milestones.find((m) => m.index === milestoneIndex);
      if (milestone) {
        await prisma.milestone.update({
          where: { id: milestone.id },
          data: {
            deliverableHash,
            status: MilestoneStatus.SUBMITTED,
            submittedAt: new Date(),
          },
        });
      }
    }
  }

  private async handleMilestoneApproved(event: DecodedContractEvent) {
    const milestoneIndex = Number(event.data.milestone_index ?? 0);
    const job = await prisma.job.findUnique({
      where: { onChainJobId: event.jobId },
      include: { milestones: true },
    });

    if (job) {
      const milestone = job.milestones.find((m) => m.index === milestoneIndex);
      if (milestone) {
        await prisma.milestone.update({
          where: { id: milestone.id },
          data: {
            status: MilestoneStatus.APPROVED,
            approvedAt: new Date(),
          },
        });

        const nextIndex = milestoneIndex + 1;
        const isCompleted = nextIndex >= job.milestoneCount;
        await prisma.job.update({
          where: { id: job.id },
          data: {
            currentMilestoneIndex: nextIndex,
            status: isCompleted ? JobStatus.COMPLETED : JobStatus.ACTIVE,
          },
        });
      }
    }
  }

  private async handleRevisionRequested(event: DecodedContractEvent) {
    const milestoneIndex = Number(event.data.milestone_index ?? 0);
    const job = await prisma.job.findUnique({
      where: { onChainJobId: event.jobId },
      include: { milestones: true },
    });

    if (job) {
      const milestone = job.milestones.find((m) => m.index === milestoneIndex);
      if (milestone) {
        await prisma.milestone.update({
          where: { id: milestone.id },
          data: {
            status: MilestoneStatus.REVISION_REQUESTED,
            revisionCount: { increment: 1 },
          },
        });
      }
    }
  }

  private async handleDisputeOpened(event: DecodedContractEvent) {
    const milestoneIndex = Number(event.data.milestone_index ?? 0);
    const openedBy = (event.data.opened_by as string) ?? '';

    const job = await prisma.job.findUnique({
      where: { onChainJobId: event.jobId },
      include: { milestones: true },
    });

    if (job) {
      const milestone = job.milestones.find((m) => m.index === milestoneIndex);
      if (milestone) {
        await prisma.milestone.update({
          where: { id: milestone.id },
          data: { status: MilestoneStatus.DISPUTED },
        });

        await prisma.job.update({
          where: { id: job.id },
          data: { status: JobStatus.DISPUTED },
        });

        await prisma.dispute.upsert({
          where: { jobId_milestoneIndex: { jobId: job.id, milestoneIndex } },
          update: { status: DisputeStatus.ACTIVE },
          create: {
            jobId: job.id,
            milestoneIndex,
            openedBy,
            reasonHash: (event.data.reason_hash as string) ?? '',
            status: DisputeStatus.ACTIVE,
            votingDeadline: new Date(Date.now() + Number(job.disputeWindowSeconds) * 1000),
          },
        });
      }
    }
  }

  private async handleArbitratorVoted(event: DecodedContractEvent, txHash: string) {
    const milestoneIndex = Number(event.data.milestone_index ?? 0);
    const arbitratorAddress = (event.data.arbitrator as string) ?? '';
    const shareBps = Number(event.data.share_bps ?? 0);

    const job = await prisma.job.findUnique({
      where: { onChainJobId: event.jobId },
    });

    if (job) {
      const dispute = await prisma.dispute.findUnique({
        where: { jobId_milestoneIndex: { jobId: job.id, milestoneIndex } },
      });

      if (dispute) {
        await prisma.arbitratorVote.upsert({
          where: {
            disputeId_arbitratorAddress: {
              disputeId: dispute.id,
              arbitratorAddress,
            },
          },
          update: { freelancerShareBps: shareBps, txHash },
          create: {
            disputeId: dispute.id,
            arbitratorAddress,
            freelancerShareBps: shareBps,
            txHash,
          },
        });
      }
    }
  }

  private async handleDisputeResolved(event: DecodedContractEvent) {
    const milestoneIndex = Number(event.data.milestone_index ?? 0);
    const settledBps = Number(event.data.settled_bps ?? 0);

    const job = await prisma.job.findUnique({
      where: { onChainJobId: event.jobId },
    });

    if (job) {
      await prisma.dispute.updateMany({
        where: { jobId: job.id, milestoneIndex },
        data: {
          status: DisputeStatus.RESOLVED,
          settledFreelancerShareBps: settledBps,
          resolvedAt: new Date(),
        },
      });

      await prisma.milestone.updateMany({
        where: { jobId: job.id, index: milestoneIndex },
        data: { status: MilestoneStatus.RESOLVED },
      });
    }
  }

  private async handleAutoReleased(event: DecodedContractEvent) {
    const milestoneIndex = Number(event.data.milestone_index ?? 0);
    const job = await prisma.job.findUnique({
      where: { onChainJobId: event.jobId },
    });

    if (job) {
      await prisma.milestone.updateMany({
        where: { jobId: job.id, index: milestoneIndex },
        data: {
          status: MilestoneStatus.APPROVED,
          approvedAt: new Date(),
        },
      });
    }
  }

  private async handleReclaimed(event: DecodedContractEvent) {
    const job = await prisma.job.findUnique({
      where: { onChainJobId: event.jobId },
    });

    if (job) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.STALLED_RECLAIMED },
      });
    }
  }

  private async handleArbitratorSlashed(event: DecodedContractEvent) {
    const arbitratorAddress = (event.data.arbitrator as string) ?? '';
    const slashedAmount = BigInt(event.data.slashed_amount as string ?? '0');
    await arbitratorService.recordSlash(arbitratorAddress, slashedAmount);
  }

  private async handleMutualClosed(event: DecodedContractEvent) {
    const job = await prisma.job.findUnique({
      where: { onChainJobId: event.jobId },
    });

    if (job) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.CLOSED, escrowBalance: 0n },
      });
    }
  }
}

export const contractEventHandler = new ContractEventHandler();
