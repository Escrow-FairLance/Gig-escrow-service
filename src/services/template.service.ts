import { prisma } from '../db/client.js';
import { Prisma } from '@prisma/client';
import { hashTerms, sha256Hex } from '../utils/crypto.js';

export interface MilestoneTemplateItem {
  index: number;
  title: string;
  description: string;
  percentage: number; // e.g. 30 for 30%
  estimatedDays: number;
  acceptanceCriteria: string[];
}

export interface StandardJobTemplate {
  title: string;
  category: string;
  description: string;
  termsJson: Record<string, unknown>;
  milestones: MilestoneTemplateItem[];
  acceptanceCriteria: string[];
}

export const BUILTIN_TEMPLATES: StandardJobTemplate[] = [
  {
    title: 'Cross-Border Payment Integration (Stellar/SEP-24)',
    category: 'Blockchain & FinTech',
    description: 'Turnkey integration of Stellar anchors and SEP-24 interactive deposit/withdrawal for local currencies (NGN, KES, USDC).',
    termsJson: {
      framework: 'Next.js & Stellar SDK',
      anchors: ['Cowrie Exchange', 'ClickPesa', 'Yellow Card'],
      slaHours: 48,
      revisionAllowance: 2,
      reviewWindowDays: 3,
    },
    milestones: [
      {
        index: 0,
        title: 'Architecture & SEP-10 Auth Setup',
        description: 'Complete architecture doc, SEP-10 Stellar Web Authentication flow, and testnet keypair configuration.',
        percentage: 30,
        estimatedDays: 5,
        acceptanceCriteria: ['Valid SEP-10 challenge flow', 'JWT generation', 'Unit test coverage > 85%'],
      },
      {
        index: 1,
        title: 'SEP-24 Interactive Flow & Webhooks',
        description: 'Interactive popup webview for NGN/KES cash-in/cash-out, transaction status polling, and webhook listener.',
        percentage: 40,
        estimatedDays: 7,
        acceptanceCriteria: ['Interactive deposit session initiates', 'Withdrawal callback verified', 'Database state synced'],
      },
      {
        index: 2,
        title: 'End-to-End Testing & Mainnet Staging Audit',
        description: 'Testnet simulation with live anchors, stress testing, documentation, and handover.',
        percentage: 30,
        estimatedDays: 4,
        acceptanceCriteria: ['Clean testnet transaction hashes', 'Deployment runbook provided', 'Client acceptance sign-off'],
      },
    ],
    acceptanceCriteria: [
      'All delivered code passes automated test suite',
      'No critical security vulnerabilities',
      'SHA-256 deliverable checksums match contract uploads',
    ],
  },
  {
    title: 'Soroban Smart Contract & Escrow Protocol Development',
    category: 'Smart Contracts',
    description: 'Rust Soroban smart contract development, unit/integration testing with Soroban SDK, and testnet deployment.',
    termsJson: {
      sorobanSdkVersion: '22.0.8',
      rustEdition: '2021',
      maxArbitrators: 7,
      maxRevisions: 2,
    },
    milestones: [
      {
        index: 0,
        title: 'Core Escrow Accounting & State Engine',
        description: 'Implementation of multi-milestone escrow state, deposit, milestone submission, and approval.',
        percentage: 40,
        estimatedDays: 7,
        acceptanceCriteria: ['Clean cargo test passes', 'Invariant balance check holds', 'WASM build succeeds'],
      },
      {
        index: 1,
        title: 'Dispute Arbitration & Staking Mechanics',
        description: 'Arbitrator panel voting with basis points, slashing of inactive arbitrators, and tie-breaking logic.',
        percentage: 40,
        estimatedDays: 7,
        acceptanceCriteria: ['Arbitrator staking enforced', 'Basis points proportional split works', 'Non-voting slash tested'],
      },
      {
        index: 2,
        title: 'Testnet Deployment & TypeScript SDK',
        description: 'Deploy to Stellar Testnet, initialize contract, generate TypeScript client bindings, and publish package.',
        percentage: 20,
        estimatedDays: 3,
        acceptanceCriteria: ['Contract deployed on testnet', 'Bindings compile clean', 'E2E demo script succeeds'],
      },
    ],
    acceptanceCriteria: [
      'Zero compiler warnings with cargo check',
      'Gas/CPU limits strictly within testnet quota',
    ],
  },
  {
    title: 'Full-Stack Web Application MVP',
    category: 'Web Development',
    description: 'Modern, dynamic full-stack MVP with responsive UI, authenticated REST API, and PostgreSQL storage.',
    termsJson: {
      frontend: 'Next.js App Router',
      backend: 'Fastify Node.js',
      database: 'PostgreSQL & Prisma',
      revisionAllowance: 2,
    },
    milestones: [
      {
        index: 0,
        title: 'UI Design System & Core Layouts',
        description: 'Responsive desktop and mobile screens with dark mode, navigation, and theme tokens.',
        percentage: 30,
        estimatedDays: 5,
        acceptanceCriteria: ['Mobile responsive down to 360px', 'Clean accessibility tags', 'Design system documented'],
      },
      {
        index: 1,
        title: 'REST API & State Integration',
        description: 'API controllers, database models, data fetching, forms, and optimistic UI updates.',
        percentage: 45,
        estimatedDays: 9,
        acceptanceCriteria: ['Full CRUD workflows functional', 'Form validation with Zod', 'Error toasts handled'],
      },
      {
        index: 2,
        title: 'QA, Dockerization & Staging Deployment',
        description: 'Production Docker container, automated CI/CD pipeline, and deployment verification.',
        percentage: 25,
        estimatedDays: 4,
        acceptanceCriteria: ['Docker compose builds clean', 'Lighthouse score > 90', 'Staging URL live'],
      },
    ],
    acceptanceCriteria: [
      'Full TypeScript type safety across frontend and backend',
      'Automated test coverage for business logic',
    ],
  },
];

export class TemplateService {
  async ensureBuiltinTemplates(): Promise<void> {
    for (const t of BUILTIN_TEMPLATES) {
      const templateHash = sha256Hex(t.title + t.category);
      await prisma.jobTemplate.upsert({
        where: { templateHash },
        update: {
          title: t.title,
          category: t.category,
          description: t.description,
          termsJson: t.termsJson as unknown as Prisma.InputJsonValue,
          milestoneTemplates: t.milestones as any,
          acceptanceCriteria: t.acceptanceCriteria as any,
        },
        create: {
          title: t.title,
          category: t.category,
          description: t.description,
          templateHash,
          termsJson: t.termsJson as unknown as Prisma.InputJsonValue,
          milestoneTemplates: t.milestones as any,
          acceptanceCriteria: t.acceptanceCriteria as any,
        },
      });
    }
  }

  async listTemplates(category?: string) {
    await this.ensureBuiltinTemplates();
    return prisma.jobTemplate.findMany({
      where: category ? { category } : undefined,
      orderBy: { title: 'asc' },
    });
  }

  async getTemplateById(id: string) {
    return prisma.jobTemplate.findUnique({
      where: { id },
    });
  }

  async getTemplateByHash(templateHash: string) {
    return prisma.jobTemplate.findUnique({
      where: { templateHash },
    });
  }

  computeTermsHash(terms: Record<string, unknown>): string {
    return hashTerms(terms);
  }
}

export const templateService = new TemplateService();
