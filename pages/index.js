import React from 'react'
import Head from 'next/head'
import ChatModern from '../components/ChatUI'

export default function Home() {
  return (
    <>
      <Head>
        <title>AI Chat</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" type="image/svg+xml" href="/vite.svg" />
      </Head>
      <ChatModern />
    </>
  )
}
