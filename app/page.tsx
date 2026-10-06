import styles from './page.module.css';

// Temporary landing until Phase 7 designs the real one. It states only what is verified today.
export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Fiado</h1>
      <p className={styles.lede}>The credit book the network keeps.</p>
      <p>
        A shop gives a customer a credit line. Only the customer can write a debt into it, and the Stellar
        network refuses any purchase over the limit.
      </p>
      <p className={styles.status}>
        Status: in build, testnet only. The mechanism is verified on testnet; see{' '}
        <a href="https://github.com/JUICEWRLD998/fiado/blob/main/DECISIONS.md">DECISIONS.md</a>.
      </p>
    </main>
  );
}
