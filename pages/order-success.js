import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getShopName } from '../utils/runtimeConfig';

export default function OrderSuccess() {
  const router = useRouter();
  const { order_id, payment_status } = router.query || {};
  const shopName = getShopName();
  // 使用统一状态文案
  const statusText = payment_status === 'processing'
    ? '待确认'
    : payment_status === 'succeeded'
    ? '待配送'
    : '未付款';
  return (
    <>
      <Head>
        <title>订单提交成功 - {shopName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
              <svg
                className="h-8 w-8 text-green-600"
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
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{statusText}</h2>
            {order_id && (
              <p className="text-sm text-gray-500 mb-1">订单号：<span className="font-mono">{order_id}</span></p>
            )}
            <p className="text-gray-600 mb-6">我们会尽快为您处理订单。</p>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 text-left">
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                接下来的步骤：
              </h3>
              
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                    1
                  </span>
                  <span>我们会通过短信或电话与您确认订单详情</span>
                </div>
                
                <div className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                    2
                  </span>
                  <span>商品备齐后，我们会安排配送</span>
                </div>
                
                <div className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                    3
                  </span>
                  <span>配送员会提前联系您确认收货时间</span>
                </div>
              </div>
            </div>
            
            {payment_status === 'processing' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800 text-center">请保持手机畅通，管理员将尽快核验付款并处理订单。</p>
              </div>
            )}
            
            <div className="space-y-3">
              <Link href="/orders" className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">查看我的订单</Link>
              
              <Link 
                href="/"
                className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
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
