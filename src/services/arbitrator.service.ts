import { prisma } from '../db/client.js';

export interface RegisterArbitratorInput {
  userId: string;
  skills: string[];
  languages: string[];
  feeBps?: number;
  minStake?: bigint;
  stakedAmount?: bigint;
}

export class ArbitratorService {
  async registerOrUpdate(input: RegisterArbitratorInput) {
    const minStake = input.minStake ?? 10000000n; // 1 XLM in stroops (7 decimals: 10_000_000)
    const stakedAmount = input.stakedAmount ?? minStake;

    return prisma.arbitratorProfile.upsert({
      where: { userId: input.userId },
      update: {
        skills: input.skills,
        languages: input.languages,
        feeBps: input.feeBps ?? 500,
        minStake,
        stakedAmount,
        isAvailable: true,
      },
      create: {
        userId: input.userId,
        skills: input.skills,
        languages: input.languages,
        feeBps: input.feeBps ?? 500,
        minStake,
        stakedAmount,
        reputationScore: 100.0,
        isAvailable: true,
      },
    });
  }

  async recordVote(arbitratorAddress: string, feeEarned: bigint) {
    const user = await prisma.user.findUnique({
      where: { address: arbitratorAddress },
      include: { arbitratorProfile: true },
    });

    if (!user || !user.arbitratorProfile) return null;

    const profile = user.arbitratorProfile;
    const newCasesVoted = profile.totalCasesVoted + 1;
    const newFees = profile.totalFeesEarned + feeEarned;

    // Reputation bonus for active voting
    const newScore = Math.min(
      150.0,
      100.0 + newCasesVoted * 2.5 - profile.totalCasesSlashed * 35.0
    );

    return prisma.arbitratorProfile.update({
      where: { id: profile.id },
      data: {
        totalCasesVoted: newCasesVoted,
        totalFeesEarned: newFees,
        reputationScore: newScore,
        activeCasesCount: Math.max(0, profile.activeCasesCount - 1),
      },
    });
  }

  async recordSlash(arbitratorAddress: string, slashedAmount: bigint) {
    const user = await prisma.user.findUnique({
      where: { address: arbitratorAddress },
      include: { arbitratorProfile: true },
    });

    if (!user || !user.arbitratorProfile) return null;

    const profile = user.arbitratorProfile;
    const newSlashedCount = profile.totalCasesSlashed + 1;
    const currentStake = profile.stakedAmount;
    const newStake = currentStake > slashedAmount ? currentStake - slashedAmount : 0n;

    // Heavy penalty for being slashed
    const newScore = Math.max(
      10.0,
      100.0 + profile.totalCasesVoted * 2.5 - newSlashedCount * 35.0
    );

    return prisma.arbitratorProfile.update({
      where: { id: profile.id },
      data: {
        totalCasesSlashed: newSlashedCount,
        stakedAmount: newStake,
        reputationScore: newScore,
        isAvailable: newStake >= profile.minStake, // auto-disable if below minStake
        activeCasesCount: Math.max(0, profile.activeCasesCount - 1),
      },
    });
  }

  async listArbitrators(availableOnly = true) {
    return prisma.arbitratorProfile.findMany({
      where: availableOnly ? { isAvailable: true } : undefined,
      include: {
        user: {
          include: { profile: true },
        },
      },
      orderBy: { reputationScore: 'desc' },
    });
  }
}

export const arbitratorService = new ArbitratorService();
