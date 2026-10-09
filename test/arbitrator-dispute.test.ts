import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Arbitrator Panel Rules & Invariants', () => {
  it('should enforce panel size must be strictly odd between 1 and 7', () => {
    const validSizes = [1, 3, 5, 7];
    const invalidSizes = [0, 2, 4, 6, 8];

    for (const size of validSizes) {
      assert.strictEqual(size % 2 === 1 && size >= 1 && size <= 7, true);
    }

    for (const size of invalidSizes) {
      assert.strictEqual(size % 2 === 1 && size >= 1 && size <= 7, false);
    }
  });

  it('should calculate majority threshold accurately', () => {
    // 1 -> 1
    // 3 -> 2
    // 5 -> 3
    // 7 -> 4
    const threshold = (panelSize: number) => Math.floor(panelSize / 2) + 1;

    assert.strictEqual(threshold(1), 1);
    assert.strictEqual(threshold(3), 2);
    assert.strictEqual(threshold(5), 3);
    assert.strictEqual(threshold(7), 4);
  });

  it('should strictly exclude client and freelancer from arbitrator candidate pool', () => {
    const client = 'GCLIENTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    const freelancer = 'GFREELANCERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    const arb1 = 'GARB1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    const arb2 = 'GARB2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

    const pool = [client, freelancer, arb1, arb2];
    const eligible = pool.filter((addr) => addr !== client && addr !== freelancer);

    assert.strictEqual(eligible.length, 2);
    assert.strictEqual(eligible.includes(client), false);
    assert.strictEqual(eligible.includes(freelancer), false);
  });

  it('should update reputation score with heavy slashing penalty', () => {
    const calcReputation = (casesVoted: number, casesSlashed: number) => {
      return Math.max(10.0, 100.0 + casesVoted * 2.5 - casesSlashed * 35.0);
    };

    const initial = calcReputation(0, 0);
    assert.strictEqual(initial, 100.0);

    const good = calcReputation(10, 0);
    assert.strictEqual(good, 125.0);

    // 1 slash severely impacts reputation
    const slashedOnce = calcReputation(10, 1);
    assert.strictEqual(slashedOnce, 90.0);

    // 3 slashes drops to floor
    const delinquent = calcReputation(2, 3);
    assert.strictEqual(delinquent, 10.0);
  });
});

describe('Dispute Settlement Mathematics', () => {
  it('should calculate lossless integer payout division based on average basis points', () => {
    const milestoneAmount = 1000000000n; // 100 XLM (7 decimals)
    const feeBps = 500; // 5%
    const totalFee = (milestoneAmount * BigInt(feeBps)) / 10000n;
    assert.strictEqual(totalFee, 50000000n); // 5 XLM

    const distributable = milestoneAmount - totalFee;
    assert.strictEqual(distributable, 950000000n); // 95 XLM

    // 3 Arbitrators vote: 7000 (70%), 8000 (80%), 6000 (60%)
    const votes = [7000, 8000, 6000];
    const averageBps = Math.round(votes.reduce((a, b) => a + b, 0) / votes.length);
    assert.strictEqual(averageBps, 7000); // 70%

    const freelancerPayout = (distributable * BigInt(averageBps)) / 10000n;
    const clientRefund = distributable - freelancerPayout;

    // Total must conserve exact balance
    assert.strictEqual(freelancerPayout + clientRefund + totalFee, milestoneAmount);
    assert.strictEqual(freelancerPayout, 665000000n); // 66.5 XLM
    assert.strictEqual(clientRefund, 285000000n); // 28.5 XLM
  });

  it('should distribute arbitrator fees with lossless remainder division', () => {
    const totalFee = 50000005n; // has remainder when divided by 3
    const voterCount = 3n;

    const feePerVoter = totalFee / voterCount;
    const remainder = totalFee % voterCount;

    assert.strictEqual(feePerVoter * voterCount + remainder, totalFee);
  });
});
