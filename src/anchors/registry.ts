export interface StellarAnchorConfig {
  id: string;
  name: string;
  homeDomain: string;
  country: string;
  countryCode: string; // ISO 3166-1 alpha-2: NG, KE, GH, ZA, SN, CI, US, EU, GLOBAL
  currencies: {
    code: string;
    stellarAssetCode: string;
    issuerAccount?: string;
    depositEnabled: boolean;
    withdrawEnabled: boolean;
    paymentRails: string[]; // e.g., ['Bank Transfer', 'M-Pesa', 'Cash Pick-up']
    minAmount?: number;
    maxAmount?: number;
    feeDescription?: string;
  }[];
  sep24Url?: string;
  kycRequired: boolean;
  status: 'ACTIVE' | 'TESTNET_MOCK';
}

export const TARGET_COUNTRY_ANCHORS: StellarAnchorConfig[] = [
  {
    id: 'cowrie-ngn',
    name: 'Cowrie Exchange',
    homeDomain: 'cowrie.exchange',
    country: 'Nigeria',
    countryCode: 'NG',
    currencies: [
      {
        code: 'NGN',
        stellarAssetCode: 'NGNT',
        depositEnabled: true,
        withdrawEnabled: true,
        paymentRails: ['NIP Direct Bank Transfer', 'USSD', 'Debit Card'],
        minAmount: 1000,
        maxAmount: 10000000,
        feeDescription: '1.0% or min 100 NGN',
      },
      {
        code: 'USDC',
        stellarAssetCode: 'USDC',
        depositEnabled: true,
        withdrawEnabled: true,
        paymentRails: ['Local NGN Bank Account Payout'],
        minAmount: 5,
        feeDescription: 'Interbank spread + 0.5%',
      },
    ],
    sep24Url: 'https://api.cowrie.exchange/sep24',
    kycRequired: true,
    status: 'ACTIVE',
  },
  {
    id: 'clickpesa-kes',
    name: 'ClickPesa East Africa',
    homeDomain: 'clickpesa.com',
    country: 'Kenya',
    countryCode: 'KE',
    currencies: [
      {
        code: 'KES',
        stellarAssetCode: 'KES',
        depositEnabled: true,
        withdrawEnabled: true,
        paymentRails: ['Safaricom M-Pesa', 'Airtel Money', 'PESALINK Bank Transfer'],
        minAmount: 200,
        maxAmount: 300000,
        feeDescription: '1.2% instant mobile money transfer',
      },
      {
        code: 'USDC',
        stellarAssetCode: 'USDC',
        depositEnabled: true,
        withdrawEnabled: true,
        paymentRails: ['M-Pesa Express Instant Payout'],
        minAmount: 5,
        feeDescription: '0.8% + telco tariff',
      },
    ],
    sep24Url: 'https://api.clickpesa.com/sep24',
    kycRequired: true,
    status: 'ACTIVE',
  },
  {
    id: 'yellowcard-africa',
    name: 'Yellow Card Financial',
    homeDomain: 'yellowcard.io',
    country: 'Pan-Africa (Nigeria, Ghana, Kenya, South Africa, Senegal, Côte d’Ivoire)',
    countryCode: 'GLOBAL',
    currencies: [
      {
        code: 'USDC',
        stellarAssetCode: 'USDC',
        depositEnabled: true,
        withdrawEnabled: true,
        paymentRails: ['Orange Money', 'MTN MoMo', 'Wave', 'Local Bank Rails'],
        minAmount: 2,
        feeDescription: 'Zero fee deposit, 0.5% withdrawal fee',
      },
    ],
    sep24Url: 'https://stellar.yellowcard.io/sep24',
    kycRequired: true,
    status: 'ACTIVE',
  },
  {
    id: 'moneygram-access',
    name: 'MoneyGram Access (Cash On/Off-Ramp)',
    homeDomain: 'moneygram.com',
    country: 'Global (180+ Countries)',
    countryCode: 'GLOBAL',
    currencies: [
      {
        code: 'USD',
        stellarAssetCode: 'USDC',
        depositEnabled: true,
        withdrawEnabled: true,
        paymentRails: ['Physical Cash In-Hand', '400,000+ Retail Counter Locations'],
        minAmount: 10,
        maxAmount: 2500,
        feeDescription: 'Zero fees on USDC cash-in/cash-out promotion',
      },
    ],
    sep24Url: 'https://extc-stellar.moneygram.com/sep24',
    kycRequired: true,
    status: 'ACTIVE',
  },
  {
    id: 'tempo-europe',
    name: 'Tempo France',
    homeDomain: 'tempo.eu.com',
    country: 'European Union & West Africa',
    countryCode: 'EU',
    currencies: [
      {
        code: 'EUR',
        stellarAssetCode: 'EURT',
        depositEnabled: true,
        withdrawEnabled: true,
        paymentRails: ['SEPA Instant Credit Transfer', 'Direct Debit'],
        minAmount: 10,
        feeDescription: '0.30 EUR flat SEPA transfer',
      },
    ],
    sep24Url: 'https://api.tempo.eu.com/sep24',
    kycRequired: true,
    status: 'ACTIVE',
  },
];

export class AnchorRegistry {
  getAll(): StellarAnchorConfig[] {
    return TARGET_COUNTRY_ANCHORS;
  }

  findByCountryCode(code: string): StellarAnchorConfig[] {
    const upper = code.toUpperCase();
    return TARGET_COUNTRY_ANCHORS.filter(
      (a) => a.countryCode === upper || a.countryCode === 'GLOBAL'
    );
  }

  findByDomain(domain: string): StellarAnchorConfig | undefined {
    return TARGET_COUNTRY_ANCHORS.find((a) => a.homeDomain === domain.toLowerCase());
  }

  findById(id: string): StellarAnchorConfig | undefined {
    return TARGET_COUNTRY_ANCHORS.find((a) => a.id === id);
  }
}

export const anchorRegistry = new AnchorRegistry();
