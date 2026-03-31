import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useAuth } from '../../../hooks/useAuth';
import { getShopName } from '../../../utils/runtimeConfig';
import ChatVendorScripts from '../../../components/ChatVendorScripts';

const ChatModern = dynamic(() => import('../../../components/ChatUI'), { ssr: false });

const shopName = getShopName();

export default function AgentAiChatDetailPage() {
  const { user, isInitialized } = useAuth();
  const router = useRouter();
  const { chatId } = router.query;

  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.type !== 'agent') {
      router.push('/');
    }
  }, [user, isInitialized, router]);

  if (!user || user.type !== 'agent') return null;

  return (
    <>
      <ChatVendorScripts />
      <Head>
        <title>管理助手 - {shopName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <ChatModern
        user={user}
        initialConversationId={chatId || null}
        apiPathPrefix="/agent/ai"
        enableImageUpload={true}
        mode="admin"
      />
    </>
  );
}
