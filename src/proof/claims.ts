// The claims on /how, as data. Each one points at a real transaction on the Stellar test network and says what the
// network must show. `npm run check:proof` asks Horizon whether every claim still holds, so the page cannot drift
// from the ledger without a failing check. No imports on purpose: the check script reads this file directly.

export type TxExpect = {
  successful: boolean;
  /** Operation types, in order. */
  ops: string[];
  /** The outer transaction is a fee-bump paid by someone other than the signer of the inner one. */
  feeBump?: boolean;
  memo?: string;
  /** For a refused transaction: the result code the network gave. */
  code?: string;
};

export type Claim = {
  id: string;
  /** One sentence, as the visitor reads it. */
  claim: string;
  /** What the network did, in plain words. */
  plain: string;
  /** What to look for when the explorer opens. */
  look: string;
  tx?: { hash: string; expect: TxExpect };
  /** A customer's address whose record page is linked. */
  record?: string;
  /** Not on the ledger: how to reproduce it instead. */
  reproduce?: { command: string; why: string };
};

export const EXPLORER = 'https://stellar.expert/explorer/testnet';

export const CLAIMS: readonly Claim[] = [
  {
    id: 'credit-line',
    claim: 'The shop’s credit limit is a limit on a Stellar trustline.',
    plain:
      'One transaction opened a customer’s account (paid for by the shop, so the customer holds no XLM), turned on approval-only holding, and let the shop trust the customer’s FIADO up to 5,000.',
    look: 'In the operations, find change_trust on FIADO with limit 5000.0000000.',
    tx: {
      hash: 'c8522956c6c3c52b613399c78527d30782fd50d15241b8019c664ffa2c0b0da9',
      expect: {
        successful: true,
        ops: [
          'begin_sponsoring_future_reserves',
          'create_account',
          'set_options',
          'manage_data',
          'end_sponsoring_future_reserves',
          'change_trust',
          'set_trust_line_flags',
        ],
      },
    },
  },
  {
    id: 'customer-signs',
    claim: 'Only the customer can write a debt, and the shop pays the fee.',
    plain:
      'A purchase is a payment of the customer’s own FIADO to the shop. The customer is the source and signs it. The shop wraps it in a fee-bump and pays the fee, so the customer never needs XLM.',
    look: 'The transaction source is the customer. The fee account is the shop. The memo is the item and due date.',
    tx: {
      hash: 'faadd337eaeab2d61f56dedb5bb9c3d692561ea114e6fae569d5ad073bd08bdc',
      expect: { successful: true, ops: ['payment'], feeBump: true, memo: 'Rice 2 bags|261005' },
    },
  },
  {
    id: 'over-limit',
    claim: 'A purchase over the limit is refused by the network.',
    plain:
      'Bisi owed ₦3,200 of a ₦10,000 limit and tried to buy ₦9,000 more on credit. The network refused it because the shop’s trustline would be over its limit, and nothing was added to the tab.',
    look: 'The transaction shows as failed, with op_line_full on the payment.',
    tx: {
      hash: 'd04d57899f3ea8e5aae1b14026c1d7c3a6a643bb8e3def11f05a83c14059c3db',
      expect: { successful: false, ops: ['payment'], feeBump: true, code: 'op_line_full' },
    },
  },
  {
    id: 'repay',
    claim: 'A repayment burns the debt.',
    plain:
      'When a customer pays in cash, the shop sends their FIADO back to the one account that issued it, the customer’s. That removes it from the shop’s balance, so the tab goes down by exactly that amount.',
    look: 'A payment of FIADO from the shop to the customer, memo “cash”.',
    tx: {
      hash: '8a98c0b8f783f37d685dc7556581cfe41d336326d7c2062161b193458fea9283',
      expect: { successful: true, ops: ['payment'], memo: 'cash' },
    },
  },
  {
    id: 'record',
    claim: 'The record belongs to the customer and any shop can read it.',
    plain:
      'A customer’s history is their own account’s public payment feed. A new shop opens one link and reads what was bought, what was paid, and how fast, with no account and no permission from the first shop.',
    look: 'The record page counts the same payments you can see in the explorer.',
    record: 'GBN2AIKJIQVUBO4EMA4VIKNEIV7ERJQYJGQCNZZXTSF3D4Y7GJFX7P6G',
  },
  {
    id: 'no-forgery',
    claim: 'A shop cannot add to a tab without the customer’s signature.',
    plain:
      'The network rejects a purchase the customer did not sign (op_bad_auth) before it is ever recorded, so there is no ledger entry to point at. The test that proves it runs the attempt against the live network.',
    look: 'Run the command and read the line that says the forged purchase was refused.',
    reproduce: { command: 'npm run spike', why: 'The network rejects it before recording it, so it never reaches the ledger.' },
  },
];

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAccount = (account: string) => `${EXPLORER}/account/${account}`;
