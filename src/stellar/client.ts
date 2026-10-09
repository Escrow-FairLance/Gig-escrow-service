import {
  Horizon,
  Keypair,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { config } from '../config/env.js';

export class StellarClient {
  public rpcServer: rpc.Server;
  public horizonServer: Horizon.Server;
  public serverKeypair: Keypair;
  public contractId: string;
  public networkPassphrase: string;

  constructor() {
    this.rpcServer = new rpc.Server(config.SOROBAN_RPC_URL, {
      allowHttp: config.NODE_ENV !== 'production',
    });
    this.horizonServer = new Horizon.Server(config.HORIZON_URL, {
      allowHttp: config.NODE_ENV !== 'production',
    });
    this.serverKeypair = Keypair.fromSecret(config.SERVER_SIGNING_KEY);
    this.contractId = config.ESCROW_CONTRACT_ID;
    this.networkPassphrase = config.STELLAR_NETWORK_PASSPHRASE;
  }

  async getLatestLedger(): Promise<number> {
    try {
      const response = await this.rpcServer.getLatestLedger();
      return response.sequence;
    } catch (err) {
      console.warn('Failed to get latest ledger from Soroban RPC, falling back to Horizon:', err);
      const feeStats = await this.horizonServer.feeStats();
      return parseInt(feeStats.last_ledger, 10);
    }
  }

  async getAccountBalance(publicKey: string): Promise<string> {
    try {
      const account = await this.horizonServer.loadAccount(publicKey);
      const nativeBalance = account.balances.find((b) => b.asset_type === 'native');
      return nativeBalance ? nativeBalance.balance : '0';
    } catch {
      return '0';
    }
  }

  async pollTransaction(hash: string): Promise<rpc.Api.GetTransactionResponse> {
    return this.rpcServer.getTransaction(hash);
  }

  getEscrowContractId(): string {
    return this.contractId;
  }
}

export const stellarClient = new StellarClient();
