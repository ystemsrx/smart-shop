import '../styles/globals.css'
import Head from 'next/head'
import { MotionConfig } from 'framer-motion'
import AppWrapper from '../components/AppWrapper'

export default function App({ Component, pageProps }) {
  return (
    <MotionConfig reducedMotion="user">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#FDFBF7" />
      </Head>
      <AppWrapper Component={Component} pageProps={pageProps} />
    </MotionConfig>
  )
}
