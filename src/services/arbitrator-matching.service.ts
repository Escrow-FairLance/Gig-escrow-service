import { prisma } from '../db/client.js';
import { ArbitratorCandidate, ArbitratorMatchQuery } from '../types/domain.js';

export class ArbitratorMatchingService {
  /**
   * Selects an odd-sized panel (1, 3, 5, or 7 members) maximizing skill match and reputation,
   * while strictly excluding client and freelancer (conflict of interest prevention).
   */
  async matchPanel(query: ArbitratorMatchQuery): Promise<{
    panel: ArbitratorCandidate[];
    recommendedSize: number;
    averageFeeBps: number;
  }> {
    let desiredSize = query.targetPanelSize ?? 3;
    if (desiredSize % 2 === 0) {
      desiredSize += 1; // Enforce odd count
    }
    desiredSize = Math.max(1, Math.min(7, desiredSize));

    // Fetch all available arbitrators with sufficient stake
    const profiles = await prisma.arbitratorProfile.findMany({
      where: {
        isAvailable: true,
      },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    // Filter out client and freelancer (Strict Conflict of Interest Check)
    const eligible = profiles.filter((p) => {
      const addr = p.user.address;
      if (addr === query.clientAddress || addr === query.freelancerAddress) {
        return false;
      }
      return p.stakedAmount >= p.minStake;
    });

    // Score candidates based on skill match, language match, reputation, and workload
    const scored = eligible.map((p) => {
      let matchScore = p.reputationScore;

      // Bonus for skill match
      if (query.skills && query.skills.length > 0) {
        const overlap = query.skills.filter((s) => p.skills.includes(s));
        matchScore += overlap.length * 15;
      }

      // Bonus for language match
      if (query.languages && query.languages.length > 0) {
        const langOverlap = query.languages.filter((l) => p.languages.includes(l));
        matchScore += langOverlap.length * 10;
      }

      // Penalty for heavy ongoing workload
      matchScore -= p.activeCasesCount * 5;

      return {
        candidate: {
          address: p.user.address,
          displayName: p.user.profile?.displayName ?? undefined,
          skills: p.skills,
          languages: p.languages,
          feeBps: p.feeBps,
          reputationScore: p.reputationScore,
          stakedAmount: p.stakedAmount.toString(),
          activeCasesCount: p.activeCasesCount,
          totalCasesVoted: p.totalCasesVoted,
        },
        matchScore,
      };
    });

    // Sort by match score descending
    scored.sort((a, b) => b.matchScore - a.matchScore);

    // Pick top candidates up to desiredSize (ensuring odd length)
    let selected = scored.slice(0, desiredSize).map((s) => s.candidate);

    if (selected.length % 2 === 0) {
      // If we have an even count, reduce by 1 to maintain odd size invariant
      selected = selected.slice(0, Math.max(1, selected.length - 1));
    }

    const totalFeeBps = selected.reduce((sum, c) => sum + c.feeBps, 0);
    const averageFeeBps = selected.length > 0 ? Math.round(totalFeeBps / selected.length) : 500;

    return {
      panel: selected,
      recommendedSize: selected.length,
      averageFeeBps,
    };
  }
}

export const arbitratorMatchingService = new ArbitratorMatchingService();
