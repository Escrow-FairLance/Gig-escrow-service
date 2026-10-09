import { PrismaClient, Role, JobStatus, MilestoneStatus } from '@prisma/client';
import { hashMilestoneTitle, hashTerms, sha256Hex } from '../src/utils/crypto.js';
import { BUILTIN_TEMPLATES } from '../src/services/template.service.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding FairLance database...');

  // 1. Seed Builtin Templates
  for (const t of BUILTIN_TEMPLATES) {
    const templateHash = sha256Hex(t.title + t.category);
    await prisma.jobTemplate.upsert({
      where: { templateHash },
      update: {},
      create: {
        title: t.title,
        category: t.category,
        description: t.description,
        templateHash,
        termsJson: t.termsJson as any,
        milestoneTemplates: t.milestones as any,
        acceptanceCriteria: t.acceptanceCriteria as any,
      },
    });
  }

  // 2. Seed Users & Arbitrators
  const usersData = [
    {
      address: 'GB6CML3GZYGJ4BLR2PK5QTKQIF6KTT56ZXXTIHXTWG4JAPB3RKDVQTU4', // Deployer / Admin
      role: Role.ADMIN,
      profile: {
        displayName: 'FairLance Protocol Admin',
        email: 'admin@fairlance.io',
        country: 'Global',
        languages: ['en'],
        skills: ['Governance', 'Smart Contracts'],
      },
    },
    {
      address: 'GCLAUDECLIENT7777777777777777777777777777777777777777777777', // Client
      role: Role.CLIENT,
      profile: {
        displayName: 'Apex FinTech Global',
        email: 'partnerships@apexfintech.com',
        country: 'United Kingdom',
        languages: ['en'],
        skills: ['Product Management', 'FinTech'],
      },
    },
    {
      address: 'GAFREELANCERNG8888888888888888888888888888888888888888888888', // Freelancer 1 (Nigeria)
      role: Role.FREELANCER,
      profile: {
        displayName: 'Chukwudi Okafor',
        email: 'chukwudi.codes@gmail.com',
        bio: 'Senior Rust & Soroban engineer building decentralized finance rails across West Africa.',
        country: 'Nigeria',
        timezone: 'Africa/Lagos',
        languages: ['en', 'yo', 'ig'],
        skills: ['Rust', 'Soroban', 'TypeScript', 'Stellar SDK', 'Next.js'],
      },
    },
    {
      address: 'GAFREELANCERKE9999999999999999999999999999999999999999999999', // Freelancer 2 (Kenya)
      role: Role.FREELANCER,
      profile: {
        displayName: 'Wanjiku Kamau',
        email: 'wanjiku.kamau@dev.ke',
        bio: 'Full-stack UI/UX architect specializing in mobile-first financial experiences.',
        country: 'Kenya',
        timezone: 'Africa/Nairobi',
        languages: ['en', 'sw'],
        skills: ['React', 'Next.js', 'TailwindCSS', 'SEP-24', 'Figma'],
      },
    },
    // Arbitrator 1 (Senegal - Francophone)
    {
      address: 'GARBITRATORFR1111111111111111111111111111111111111111111111',
      role: Role.ARBITRATOR,
      profile: {
        displayName: 'Mamadou Diallo',
        email: 'm.diallo@legaltech.sn',
        country: 'Senegal',
        languages: ['fr', 'en'],
        skills: ['Smart Contracts', 'Security Audit', 'Arbitration'],
      },
      arbitrator: {
        skills: ['Smart Contracts', 'Rust', 'Security Audit'],
        languages: ['fr', 'en'],
        feeBps: 500,
        minStake: 10000000n,
        stakedAmount: 50000000n,
        reputationScore: 125.0,
        totalCasesVoted: 12,
        totalCasesSlashed: 0,
      },
    },
    // Arbitrator 2 (Nigeria)
    {
      address: 'GARBITRATORNG2222222222222222222222222222222222222222222222',
      role: Role.ARBITRATOR,
      profile: {
        displayName: 'Amina Bello, Esq.',
        email: 'amina.bello@blockchainlaw.ng',
        country: 'Nigeria',
        languages: ['en', 'ha'],
        skills: ['Commercial Law', 'Web3 Disputes', 'Frontend Architecture'],
      },
      arbitrator: {
        skills: ['Web Development', 'Commercial Law', 'TypeScript'],
        languages: ['en', 'ha'],
        feeBps: 450,
        minStake: 10000000n,
        stakedAmount: 30000000n,
        reputationScore: 115.0,
        totalCasesVoted: 8,
        totalCasesSlashed: 0,
      },
    },
    // Arbitrator 3 (South Africa)
    {
      address: 'GARBITRATORZA3333333333333333333333333333333333333333333333',
      role: Role.ARBITRATOR,
      profile: {
        displayName: 'Kobus van der Merwe',
        email: 'kobus@cryptosec.capetown',
        country: 'South Africa',
        languages: ['en'],
        skills: ['Security Audit', 'Cryptography', 'Soroban'],
      },
      arbitrator: {
        skills: ['Security Audit', 'Smart Contracts', 'Cryptography'],
        languages: ['en'],
        feeBps: 600,
        minStake: 10000000n,
        stakedAmount: 100000000n,
        reputationScore: 140.0,
        totalCasesVoted: 18,
        totalCasesSlashed: 0,
      },
    },
  ];

  for (const u of usersData) {
    await prisma.user.upsert({
      where: { address: u.address },
      update: {},
      create: {
        address: u.address,
        role: u.role,
        profile: {
          create: u.profile,
        },
        arbitratorProfile: u.arbitrator
          ? {
              create: u.arbitrator,
            }
          : undefined,
      },
    });
  }

  // 3. Seed Sample Active Job with 3 Milestones
  const terms = {
    deliverableScope: 'Production Soroban Escrow Platform MVP',
    targetNetwork: 'Stellar Testnet',
    maxRevisions: 2,
    reviewWindowDays: 3,
  };

  const termsHash = hashTerms(terms);
  const clientAddr = 'GCLAUDECLIENT7777777777777777777777777777777777777777777777';
  const freelancerAddr = 'GAFREELANCERNG8888888888888888888888888888888888888888888888';
  const panel = [
    'GARBITRATORFR1111111111111111111111111111111111111111111111',
    'GARBITRATORNG2222222222222222222222222222222222222222222222',
    'GARBITRATORZA3333333333333333333333333333333333333333333333',
  ];

  const existingJob = await prisma.job.findFirst({
    where: { termsHash },
  });

  if (!existingJob) {
    await prisma.job.create({
      data: {
        onChainJobId: 101n,
        clientAddress: clientAddr,
        freelancerAddress: freelancerAddr,
        tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
        totalAmount: 3000000000n, // 300 XLM in stroops
        escrowBalance: 3000000000n,
        status: JobStatus.ACTIVE,
        currentMilestoneIndex: 0,
        milestoneCount: 3,
        termsHash,
        templateHash: sha256Hex('Soroban Smart Contract & Escrow Protocol DevelopmentSmart Contracts'),
        arbitratorFeeBps: 500,
        arbitratorPanel: panel,
        milestones: {
          create: [
            {
              index: 0,
              title: 'Milestone 1: Smart Contract Core Logic',
              amount: 1000000000n,
              deadline: new Date(Date.now() + 7 * 86400 * 1000),
              titleHash: hashMilestoneTitle('Milestone 1: Smart Contract Core Logic'),
              status: MilestoneStatus.PENDING,
            },
            {
              index: 1,
              title: 'Milestone 2: Arbitrator Dispute Mechanism',
              amount: 1000000000n,
              deadline: new Date(Date.now() + 14 * 86400 * 1000),
              titleHash: hashMilestoneTitle('Milestone 2: Arbitrator Dispute Mechanism'),
              status: MilestoneStatus.PENDING,
            },
            {
              index: 2,
              title: 'Milestone 3: Client SDK & Testnet Deployment',
              amount: 1000000000n,
              deadline: new Date(Date.now() + 21 * 86400 * 1000),
              titleHash: hashMilestoneTitle('Milestone 3: Client SDK & Testnet Deployment'),
              status: MilestoneStatus.PENDING,
            },
          ],
        },
      },
    });
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
