import { Networks } from '@stellar/stellar-sdk';

// Testnet only, by design. There is no mainnet configuration anywhere in this repo.
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';
export const EXPLORER_TX = 'https://stellar.expert/explorer/testnet/tx/';

// Every customer issues the same code; the issuer (the customer's account) tells them apart.
export const FIADO_CODE = 'FIADO';

// Fees in stroops. The inner fee is never charged when the shop fee-bumps.
export const BASE_FEE = '100';
export const BUMP_FEE = '200';
// Long enough for two people to pass a transaction between two phones, short enough to expire if abandoned.
export const TX_TIMEOUT_S = 300;
