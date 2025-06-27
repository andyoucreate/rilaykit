import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Streamline Playground</title>
        <meta name="description" content="Test playground for Streamline library" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="min-h-screen p-8 bg-gray-50">
        <Component {...pageProps} />
      </div>
    </>
  );
}
