import { Role, JobStatus, MilestoneStatus, DisputeStatus, AnchorTxKind, AnchorTxStatus } from '@prisma/client';

export { Role, JobStatus, MilestoneStatus, DisputeStatus, AnchorTxKind, AnchorTxStatus };

export interface JwtUserPayload {
  sub: string; // User ID
  address: string; // Stellar public key G...
  role: Role;
  iat?: number;
  exp?: number;
}

export interface Sep10ChallengeResponse {
  transaction: string; // Base64 XDR of challenge transaction
  networkPassphrase: string;
}

export interface Sep10TokenResponse {
  token: string;
  user: {
    id: string;
    address: string;
    role: Role;
  };
}

export interface CreateJobDto {
  clientAddress: string;
  freelancerAddress: string;
  tokenAddress: string;
  milestones: {
    title: string;
    description?: string;
    amount: string; // BigInt as string
    deadline: string; // ISO date string
  }[];
  termsJson: Record<string, unknown>;
  templateHash?: string;
  arbitratorFeeBps?: number;
  clientCancelFeeBps?: number;
  reviewWindowSeconds?: number;
  workTimeoutSeconds?: number;
  disputeWindowSeconds?: number;
  arbitratorStakeReq?: string;
  arbitratorPanel: string[]; // 1 to 7 Stellar addresses (odd size)
}

export interface SubmitMilestoneDto {
  deliverableHash: string; // 32-byte hex hash
  fileMetadata?: {
    fileName: string;
    fileSizeBytes: string;
    mimeType: string;
    s3Key?: string;
  };
}

export interface ReviewMilestoneDto {
  action: 'APPROVE' | 'REQUEST_REVISION' | 'DISPUTE';
  feedback?: string;
  feedbackHash?: string;
  reason?: string;
}

export interface OpenDisputeDto {
  reason: string;
  evidenceItems?: {
    fileName: string;
    sha256Hash: string;
    s3Key: string;
    description?: string;
  }[];
}

export interface CastVoteDto {
  freelancerShareBps: number; // 0 to 10000 basis points
  txHash?: string;
}

export interface ArbitratorMatchQuery {
  skills?: string[];
  languages?: string[];
  clientAddress: string;
  freelancerAddress: string;
  targetPanelSize?: number; // default 3
}

export interface ArbitratorCandidate {
  address: string;
  displayName?: string;
  skills: string[];
  languages: string[];
  feeBps: number;
  reputationScore: number;
  stakedAmount: string;
  activeCasesCount: number;
  totalCasesVoted: number;
}

export interface AnchorDepositRequest {
  assetCode: string;
  account: string;
  amount?: string;
  email?: string;
  countryCode?: string;
}

export interface AnchorWithdrawRequest {
  assetCode: string;
  account: string;
  amount?: string;
  dest?: string;
  destExtra?: string;
}

export function serializeBigInt<T>(obj: T): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_, value) => (typeof value === 'bigint' ? value.toString() : value))
  );
}
