import cron from 'node-cron';
import { prisma } from '../db/client.js';
import { MilestoneStatus, DisputeStatus } from '../types/domain.js';
import { milestoneService } from '../services/milestone.service.js';
import { mailerService } from './mailer.js';

export class DeadlineMonitorCron {
  private tasks: cron.ScheduledTask[] = [];

  start(): void {
    console.info('[Cron] Initializing deadline monitor cron jobs');

    // 1. Review window expiration & auto-release check every 5 minutes
    const reviewTask = cron.schedule('*/5 * * * *', async () => {
      try {
        await this.checkReviewWindows();
      } catch (err) {
        console.warn('[Cron] Error in review window check:', err);
      }
    });

    // 2. Arbitrator voting deadline monitor every 30 minutes
    const votingTask = cron.schedule('*/30 * * * *', async () => {
      try {
        await this.checkVotingDeadlines();
      } catch (err) {
        console.warn('[Cron] Error in voting deadline check:', err);
      }
    });

    this.tasks.push(reviewTask, votingTask);
  }

  stop(): void {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
    console.info('[Cron] Stopped deadline monitor cron jobs');
  }

  async checkReviewWindows(): Promise<number> {
    const submittedMilestones = await prisma.milestone.findMany({
      where: {
        status: MilestoneStatus.SUBMITTED,
        submittedAt: { not: null },
      },
      include: { job: true },
    });

    let autoReleasedCount = 0;
    const now = Date.now();

    for (const m of submittedMilestones) {
      if (!m.submittedAt) continue;
      const elapsedSeconds = Math.floor((now - m.submittedAt.getTime()) / 1000);
      if (BigInt(elapsedSeconds) >= m.job.reviewWindowSeconds) {
        const released = await milestoneService.checkAndAutoRelease(m.jobId, m.index);
        if (released) {
          autoReleasedCount++;
          await mailerService.notify({
            userAddress: m.job.freelancerAddress,
            type: 'MILESTONE_AUTO_RELEASED',
            title: `Milestone ${m.index + 1} Auto-Released!`,
            message: `Review window expired without client objection. Milestone payment of ${m.amount.toString()} has been auto-released.`,
          });
        }
      }
    }

    return autoReleasedCount;
  }

  async checkVotingDeadlines(): Promise<number> {
    const activeDisputes = await prisma.dispute.findMany({
      where: {
        status: DisputeStatus.ACTIVE,
      },
      include: {
        job: true,
        votes: true,
      },
    });

    let warnedCount = 0;
    const now = Date.now();

    for (const d of activeDisputes) {
      const remainingMs = d.votingDeadline.getTime() - now;
      const hoursRemaining = remainingMs / (1000 * 3600);

      // Warn if under 24 hours and arbitrator hasn't voted yet
      if (hoursRemaining > 0 && hoursRemaining <= 24) {
        for (const arbAddress of d.job.arbitratorPanel) {
          const hasVoted = d.votes.some((v) => v.arbitratorAddress === arbAddress);
          if (!hasVoted) {
            warnedCount++;
            await mailerService.notify({
              userAddress: arbAddress,
              type: 'ARBITRATOR_VOTING_REMINDER',
              title: 'Dispute Voting Window Closing Soon',
              message: `You have ${Math.round(hoursRemaining)} hours remaining to vote on Dispute #${d.id} for Milestone ${d.milestoneIndex + 1}. Unvoted cases may result in stake slashing.`,
            });
          }
        }
      }
    }

    return warnedCount;
  }
}

export const deadlineMonitorCron = new DeadlineMonitorCron();
