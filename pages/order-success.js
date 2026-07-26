import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getShopName } from '../utils/runtimeConfig';

export default function OrderSuccess() {
  const router = useRouter();
  const { order_id, payment_status } = router.query || {};
  const shopName = getShopName();
  const pageTitle = `订单提交成功 - ${shopName}`;
  // 使用统一状态文案
  const statusText = payment_status === 'processing'
    ? '待确认'
    : payment_status === 'succeeded'
    ? '待配送'
    : '未付款';
  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="min-h-screen bg-[#FDFBF7] flex flex-col justify-start pt-16 py-12 sm:px-6 lg:px-8 animate-apple-fade-in">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-[#6B8F47]/10 mb-6">
              <svg
                className="h-8 w-8 text-[#6B8F47]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h2 className="text-2xl font-semibold text-[#141413] mb-2">{statusText}</h2>
            {order_id && (
              <p className="text-sm text-gray-500 mb-1">订单号：<span className="font-mono">{order_id}</span></p>
            )}
            <p className="text-gray-600 mb-6">我们会尽快为您处理订单。</p>

            <div className="bg-white rounded-2xl shadow-sm border border-[#E8E2D8] p-6 mb-6 text-left">
              <h3 className="text-lg font-medium text-[#141413] mb-3">
                接下来的步骤：
              </h3>

              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-[#D97757]/10 text-[#D97757] rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                    1
                  </span>
                  <span>我们会尽快备齐商品</span>
                </div>

                <div className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-[#D97757]/10 text-[#D97757] rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                    2
                  </span>
                  <span>备齐后，我们会安排配送</span>
                </div>

                <div className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-[#D97757]/10 text-[#D97757] rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                    3
                  </span>
                  <span>若有问题，我们会及时联系</span>
                </div>
              </div>
            </div>

            {payment_status === 'processing' && (
              <div className="bg-[#5A89B8]/5 border border-[#5A89B8]/20 rounded-2xl p-4 mb-6">
                <p className="text-sm text-[#5A89B8] text-center">我们将尽快核验付款并处理订单。</p>
              </div>
            )}

            <div className="space-y-3">
              <Link href="/orders" className="w-full flex justify-center py-3 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-[#141413] hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#D97757]">查看我的订单</Link>

              <Link
                href="/"
                className="w-full flex justify-center py-3 px-4 rounded-full text-sm font-medium text-[#6B6860] hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#D97757]"
              >
                返回首页
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
