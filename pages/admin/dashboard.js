import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../hooks/useAuth';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { getApiBaseUrl } from '../../utils/runtimeConfig';


const API_BASE = getApiBaseUrl();

// 现代化的StatCard组件
const StatCard = ({ title, value, change, changeType, icon, subtitle }) => (
  <div className="bg-gradient-to-br from-white to-gray-50/50 rounded-3xl p-8 shadow-lg border border-gray-100/50 hover:shadow-xl hover:border-gray-200/50 transition-all duration-500 group backdrop-blur-sm relative overflow-hidden">
    {/* 背景装饰 */}
    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-current/5 to-transparent rounded-full transform translate-x-8 -translate-y-8 group-hover:translate-x-6 group-hover:-translate-y-6 transition-transform duration-500"></div>
    
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-6">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg ${
          icon.bg || 'bg-gradient-to-br from-blue-500 to-blue-600'
        }`}>
          <i className={`${icon.class} text-xl text-white drop-shadow-sm`}></i>
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold backdrop-blur-sm border shadow-sm transition-all duration-300 group-hover:scale-105 ${
            changeType === 'up' ? 'bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700 border-emerald-200' : 
            changeType === 'down' ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-700 border-red-200' : 
            'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-700 border-gray-200'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              changeType === 'up' ? 'bg-emerald-500' : 
              changeType === 'down' ? 'bg-red-500' : 'bg-gray-500'
            }`}></div>
            {changeType === 'up' && <i className="fas fa-arrow-up text-xs"></i>}
            {changeType === 'down' && <i className="fas fa-arrow-down text-xs"></i>}
            {changeType === 'same' && <i className="fas fa-minus text-xs"></i>}
            {typeof change === 'number' ? `${change > 0 ? '+' : ''}${change}%` : change}
          </div>
        )}
      </div>
      
      <div className="mb-2">
        <div className="text-3xl font-bold text-gray-900 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-purple-600 group-hover:bg-clip-text transition-all duration-500">
          {value}
        </div>
        {subtitle && (
          <div className="text-sm text-gray-600 mt-2 px-3 py-1 bg-gray-100/50 rounded-lg border border-gray-200/50 backdrop-blur-sm">
            {subtitle}
          </div>
        )}
      </div>
      
      <div className="text-sm font-medium text-gray-600 uppercase tracking-wide">{title}</div>
    </div>
  </div>
);

// 现代化的柱状图组件
const SimpleBarChart = ({ data, title, height = 200, type = 'quantity' }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-gradient-to-br from-white to-gray-50 rounded-3xl p-8 shadow-lg border border-gray-100 backdrop-blur-sm">
        <h3 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-3">
          <div className="w-2 h-8 bg-gradient-to-b from-purple-500 to-pink-600 rounded-full"></div>
          {title}
        </h3>
        <div className="flex items-center justify-center h-48 text-gray-500">
          <div className="text-center">
            <i className="fas fa-chart-bar text-4xl mb-4 opacity-30"></i>
            <p className="text-lg">暂无数据</p>
          </div>
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value || d.sold || 0));
  
  return (
    <div className="bg-gradient-to-br from-white to-gray-50 rounded-3xl p-8 shadow-lg border border-gray-100 backdrop-blur-sm relative overflow-hidden h-full flex flex-col">
      {/* 背景装饰 */}
      <div className="absolute top-0 left-0 w-24 h-24 bg-gradient-to-br from-purple-100/30 to-transparent rounded-full transform -translate-x-8 -translate-y-8"></div>
      
      <div className="relative z-10 flex flex-col h-full">
        <h3 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-3">
          <div className="w-2 h-8 bg-gradient-to-b from-purple-500 to-pink-600 rounded-full"></div>
          {title}
        </h3>
        
        <div className="space-y-5 flex-1 overflow-y-auto custom-scrollbar">
          {data.map((item, index) => {
            const value = item.value || item.sold || 0;
            const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
            
            const colorClasses = [
              'from-gradient-to-r from-amber-400 via-orange-500 to-red-500',
              'from-gradient-to-r from-blue-400 via-purple-500 to-indigo-600',
              'from-gradient-to-r from-emerald-400 via-teal-500 to-cyan-600',
              'from-gradient-to-r from-pink-400 via-rose-500 to-red-500',
              'from-gradient-to-r from-violet-400 via-purple-500 to-indigo-600'
            ];
            
            return (
              <div key={index} className="group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-lg ${
                      index === 0 ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
                      index === 1 ? 'bg-gradient-to-r from-blue-400 to-purple-500' :
                      index === 2 ? 'bg-gradient-to-r from-emerald-400 to-teal-500' :
                      'bg-gradient-to-r from-gray-400 to-gray-500'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="text-sm font-medium text-gray-700 max-w-32 truncate" title={item.name}>
                      {item.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-bold text-gray-900">
                      {type === 'quantity' ? value : `¥${value}`}
                    </div>
                    {item.revenue && (
                      <div className="text-xs text-gray-500 bg-gray-100/50 px-2 py-1 rounded-lg">
                        ¥{item.revenue}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="relative">
                  <div className="flex-1 bg-gradient-to-r from-gray-100 to-gray-200 rounded-xl h-4 relative overflow-hidden shadow-inner">
                    <div 
                      className={`h-full rounded-xl transition-all duration-1000 ease-out shadow-lg ${
                        index === 0 ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-red-500' :
                        index === 1 ? 'bg-gradient-to-r from-blue-400 via-purple-500 to-indigo-600' :
                        index === 2 ? 'bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-600' :
                        index === 3 ? 'bg-gradient-to-r from-pink-400 via-rose-500 to-red-500' :
                        'bg-gradient-to-r from-violet-400 via-purple-500 to-indigo-600'
                      }`}
                      style={{ width: `${percentage}%` }}
                    >
                      <div className="h-full bg-white/20 rounded-xl"></div>
                    </div>
                  </div>
                  
                  {/* 排名徽章 */}
                  {index < 3 && (
                    <div className={`absolute right-2 top-1/2 transform -translate-y-1/2 ${
                      index === 0 ? 'text-amber-600' :
                      index === 1 ? 'text-blue-600' :
                      'text-emerald-600'
                    }`}>
                      {index === 0 && <i className="fas fa-crown text-xs"></i>}
                      {index === 1 && <i className="fas fa-medal text-xs"></i>}
                      {index === 2 && <i className="fas fa-award text-xs"></i>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};


// 现代化的折线图组件
const SalesTrendChart = ({ data, title, period }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-gradient-to-br from-white via-slate-50/30 to-blue-50/50 rounded-3xl p-8 shadow-xl border border-gray-100/50 backdrop-blur-md">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
          <div className="w-2 h-8 bg-gradient-to-b from-blue-500 via-indigo-500 to-purple-600 rounded-full shadow-lg"></div>
          {title}
        </h3>
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <i className="fas fa-chart-line text-blue-400 text-2xl"></i>
            </div>
            <p className="text-lg font-medium">暂无数据</p>
          </div>
        </div>
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map(d => d.revenue || 0));
  const maxProfit = Math.max(...data.map(d => d.profit || 0));
  const maxOrders = Math.max(...data.map(d => d.orders || 0));
  const chartData = data.slice(-7);
  
  // 销售额和净利润共用左侧Y轴，取两者的最大值
  const maxLeftAxis = Math.max(maxRevenue, maxProfit);
  
  // SVG 图表参数 - 调整以撑满卡片，为右侧Y轴预留空间
  const svgWidth = 600;
  const svgHeight = 400;
  const leftPadding = 40;
  const rightPadding = 40; // 为右侧Y轴预留空间
  const topPadding = 40;
  const bottomPadding = 40;
  const chartWidth = svgWidth - leftPadding - rightPadding;
  const chartHeight = svgHeight - topPadding - bottomPadding;
  
  // 计算坐标点
  const getPoints = (values, maxValue) => {
    return values.map((value, index) => {
      const x = leftPadding + (index / (values.length - 1)) * chartWidth;
      const y = topPadding + chartHeight - ((value / maxValue) * chartHeight);
      return { x, y, value };
    });
  };
  
  const revenuePoints = getPoints(chartData.map(d => d.revenue || 0), maxLeftAxis);
  const profitPoints = getPoints(chartData.map(d => d.profit || 0), maxLeftAxis);
  const ordersPoints = getPoints(chartData.map(d => d.orders || 0), maxOrders);
  
  // 生成平滑曲线路径
  const createSmoothPath = (points) => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    
    let d = [`M ${points[0].x} ${points[0].y}`];
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      // 计算控制点
      const tension = 0.3;
      let cp1x = prev.x + (curr.x - prev.x) * tension;
      let cp1y = prev.y;
      let cp2x = curr.x - (next ? (next.x - prev.x) * tension : (curr.x - prev.x) * tension);
      let cp2y = curr.y;
      
      if (i === 1) {
        d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`);
      } else {
        d.push(`S ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`);
      }
    }
    
    return d.join(' ');
  };
  
  const revenuePath = createSmoothPath(revenuePoints);
  const profitPath = createSmoothPath(profitPoints);
  const ordersPath = createSmoothPath(ordersPoints);
  
  // 智能标签位置计算 - 根据每个点的实际高度动态调整
  const getSmartLabelPosition = (point, index, points, type) => {
    const labelOffset = 12;
    
    if (type === 'profit') {
      // 净利润标签固定在线下方
      return point.y + labelOffset;
    } 
    
    // 获取当前点的蓝色线和绿色线的Y坐标
    const revenuePoint = revenuePoints[index];
    const orderPoint = ordersPoints[index];
    
    if (type === 'revenue') {
      // 比较蓝色线和绿色线在当前点的视觉高度（Y坐标越小表示位置越高）
      if (revenuePoint && orderPoint) {
        if (revenuePoint.y <= orderPoint.y) {
          // 蓝色线在绿色线上方或同高度，蓝色标签在上方
          return point.y - labelOffset;
        } else {
          // 蓝色线在绿色线下方，蓝色标签在下方
          return point.y + labelOffset;
        }
      }
      return point.y - labelOffset;
    } else if (type === 'orders') {
      // 订单数标签位置
      if (revenuePoint && orderPoint) {
        if (orderPoint.y < revenuePoint.y) {
          // 绿色线在蓝色线上方（严格高于），绿色标签在上方
          return point.y - labelOffset;
        } else {
          // 绿色线在蓝色线下方或同高度，绿色标签在下方（默认蓝色优先上方）
          return point.y + labelOffset;
        }
      }
      return point.y + labelOffset;
    }
    
    return point.y;
  };
  
  return (
    <div className="bg-gradient-to-br from-white via-slate-50/30 to-blue-50/50 rounded-3xl p-8 shadow-xl border border-gray-100/50 backdrop-blur-md overflow-hidden relative">
      {/* 背景装饰 */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-blue-100/20 via-indigo-100/10 to-transparent rounded-full transform translate-x-20 -translate-y-20"></div>
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-purple-100/15 to-transparent rounded-full transform -translate-x-16 translate-y-16"></div>
      
      <div className="relative z-10">
        <h3 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-3">
          <div className="w-2 h-8 bg-gradient-to-b from-blue-500 via-indigo-500 to-purple-600 rounded-full shadow-lg"></div>
          {title}
        </h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* 图例和汇总 */}
          <div className="space-y-6">
            {/* 图例 */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50/80 to-blue-100/60 rounded-xl border border-blue-200/30 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="w-4 h-4 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg"></div>
                <span className="text-sm font-medium text-gray-700">销售额</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-amber-50/80 to-amber-100/60 rounded-xl border border-amber-200/30 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="w-4 h-4 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg"></div>
                <span className="text-sm font-medium text-gray-700">净利润</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-emerald-50/80 to-emerald-100/60 rounded-xl border border-emerald-200/30 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="w-4 h-4 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-lg"></div>
                <span className="text-sm font-medium text-gray-700">订单数</span>
              </div>
            </div>
            
            {/* 当前数据汇总 */}
            <div className="space-y-3">
              <div className="p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/70 rounded-xl border border-blue-200/40 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="text-xs text-blue-600 font-medium uppercase tracking-wide">最新销售额</div>
                <div className="text-2xl font-bold text-blue-700 mt-1">¥{chartData[chartData.length - 1]?.revenue || 0}</div>
                <div className="w-full h-1 bg-blue-200/50 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full w-3/4 transition-all duration-1000"></div>
                </div>
              </div>
              <div className="p-4 bg-gradient-to-br from-amber-50/80 to-amber-100/70 rounded-xl border border-amber-200/40 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="text-xs text-amber-600 font-medium uppercase tracking-wide">最新净利润</div>
                <div className="text-2xl font-bold text-amber-700 mt-1">¥{chartData[chartData.length - 1]?.profit || 0}</div>
                <div className="w-full h-1 bg-amber-200/50 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-400 to-orange-600 rounded-full w-2/3 transition-all duration-1000"></div>
                </div>
              </div>
              <div className="p-4 bg-gradient-to-br from-emerald-50/80 to-emerald-100/70 rounded-xl border border-emerald-200/40 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="text-xs text-emerald-600 font-medium uppercase tracking-wide">最新订单</div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">{chartData[chartData.length - 1]?.orders || 0}</div>
                <div className="w-full h-1 bg-emerald-200/50 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full w-2/3 transition-all duration-1000"></div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 折线图 */}
          <div className="lg:col-span-2">
            <div className="bg-white/80 rounded-2xl p-4 border border-gray-200/50 backdrop-blur-sm shadow-inner h-full">
              <svg 
                width="100%" 
                height="480" 
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="overflow-visible"
              >
                <defs>
                  {/* 渐变定义 */}
                  <linearGradient id="revenueAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2"/>
                    <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.1"/>
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"/>
                  </linearGradient>
                  <linearGradient id="profitAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.2"/>
                    <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.1"/>
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0"/>
                  </linearGradient>
                  <linearGradient id="ordersAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.2"/>
                    <stop offset="50%" stopColor="#10b981" stopOpacity="0.1"/>
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
                  </linearGradient>
                  
                  {/* 阴影滤镜 */}
                  <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.1"/>
                  </filter>
                  
                  {/* 发光效果 */}
                  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge> 
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                
                {/* 背景网格 */}
                <pattern id="grid" width="40" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 30" fill="none" stroke="#f1f5f9" strokeWidth="0.5" opacity="0.5"/>
                </pattern>
                <rect width="100%" height="100%" fill="url(#grid)" />
                
                {/* 水平网格线 */}
                {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
                  <line
                    key={ratio}
                    x1={leftPadding}
                    y1={topPadding + chartHeight * ratio}
                    x2={leftPadding + chartWidth}
                    y2={topPadding + chartHeight * ratio}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    strokeDasharray="3,3"
                    opacity="0.6"
                  />
                ))}
                
                {/* 左侧Y轴标签 */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => (
                  <text
                    key={ratio}
                    x={leftPadding - 10}
                    y={topPadding + chartHeight * ratio + 4}
                    textAnchor="end"
                    className="text-xs fill-gray-400 font-medium"
                  >
                    {Math.round(maxLeftAxis * (1 - ratio))}
                  </text>
                ))}
                
                {/* 右侧Y轴标签 - 订单数专用 */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => (
                  <text
                    key={`right-${ratio}`}
                    x={leftPadding + chartWidth + 10}
                    y={topPadding + chartHeight * ratio + 4}
                    textAnchor="start"
                    className="text-xs fill-emerald-500 font-medium"
                  >
                    {Math.round(maxOrders * (1 - ratio))}
                  </text>
                ))}
                
                {/* 销售额面积 */}
                {revenuePoints.length > 1 && (
                  <path
                    d={`${revenuePath} L ${revenuePoints[revenuePoints.length - 1].x} ${topPadding + chartHeight} L ${revenuePoints[0].x} ${topPadding + chartHeight} Z`}
                    fill="url(#revenueAreaGradient)"
                    className="transition-all duration-1000"
                  />
                )}
                
                {/* 净利润面积 */}
                {profitPoints.length > 1 && (
                  <path
                    d={`${profitPath} L ${profitPoints[profitPoints.length - 1].x} ${topPadding + chartHeight} L ${profitPoints[0].x} ${topPadding + chartHeight} Z`}
                    fill="url(#profitAreaGradient)"
                    className="transition-all duration-1000"
                  />
                )}
                
                {/* 订单数面积 */}
                {ordersPoints.length > 1 && (
                  <path
                    d={`${ordersPath} L ${ordersPoints[ordersPoints.length - 1].x} ${topPadding + chartHeight} L ${ordersPoints[0].x} ${topPadding + chartHeight} Z`}
                    fill="url(#ordersAreaGradient)"
                    className="transition-all duration-1000"
                  />
                )}
                
                {/* 销售额折线 */}
                {revenuePoints.length > 1 && (
                  <path
                    d={revenuePath}
                    fill="none"
                    stroke="url(#revenueLineGradient)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#dropShadow)"
                    className="transition-all duration-1000"
                  />
                )}
                
                {/* 净利润折线 */}
                {profitPoints.length > 1 && (
                  <path
                    d={profitPath}
                    fill="none"
                    stroke="url(#profitLineGradient)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#dropShadow)"
                    className="transition-all duration-1000"
                  />
                )}
                
                {/* 订单数折线 */}
                {ordersPoints.length > 1 && (
                  <path
                    d={ordersPath}
                    fill="none"
                    stroke="url(#ordersLineGradient)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#dropShadow)"
                    className="transition-all duration-1000"
                  />
                )}
                
                {/* 线条渐变定义 */}
                <defs>
                  <linearGradient id="revenueLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#60a5fa"/>
                    <stop offset="50%" stopColor="#3b82f6"/>
                    <stop offset="100%" stopColor="#2563eb"/>
                  </linearGradient>
                  <linearGradient id="profitLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#fbbf24"/>
                    <stop offset="50%" stopColor="#f59e0b"/>
                    <stop offset="100%" stopColor="#d97706"/>
                  </linearGradient>
                  <linearGradient id="ordersLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#34d399"/>
                    <stop offset="50%" stopColor="#10b981"/>
                    <stop offset="100%" stopColor="#059669"/>
                  </linearGradient>
                </defs>
                
                {/* 数据点和标签 - 销售额 */}
                {revenuePoints.map((point, index) => {
                  const labelY = getSmartLabelPosition(point, index, revenuePoints, 'revenue');
                  
                  return (
                    <g key={`revenue-${index}`} className="transition-all duration-300">
                      {/* 数据点 */}
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="2"
                        fill="#3b82f6"
                        className="hover:r-3 transition-all cursor-pointer filter drop-shadow-sm"
                      />
                      {/* 标签文字 */}
                      <text
                        x={point.x}
                        y={labelY}
                        textAnchor="middle"
                        className="text-xs font-semibold fill-blue-600 pointer-events-none filter drop-shadow-sm"
                        style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}
                      >
                        ¥{point.value}
                      </text>
                    </g>
                  );
                })}
                
                {/* 数据点和标签 - 净利润 */}
                {profitPoints.map((point, index) => {
                  const labelY = getSmartLabelPosition(point, index, profitPoints, 'profit');
                  
                  return (
                    <g key={`profit-${index}`} className="transition-all duration-300">
                      {/* 数据点 */}
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="2"
                        fill="#f59e0b"
                        className="hover:r-3 transition-all cursor-pointer filter drop-shadow-sm"
                      />
                      {/* 标签文字 */}
                      <text
                        x={point.x}
                        y={labelY}
                        textAnchor="middle"
                        className="text-xs font-semibold fill-amber-600 pointer-events-none filter drop-shadow-sm"
                        style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}
                      >
                        ¥{point.value}
                      </text>
                    </g>
                  );
                })}
                
                {/* 数据点和标签 - 订单数 */}
                {ordersPoints.map((point, index) => {
                  const labelY = getSmartLabelPosition(point, index, ordersPoints, 'orders');
                  
                  return (
                    <g key={`orders-${index}`} className="transition-all duration-300">
                      {/* 数据点 */}
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="2"
                        fill="#10b981"
                        className="hover:r-3 transition-all cursor-pointer filter drop-shadow-sm"
                      />
                      {/* 标签文字 */}
                      <text
                        x={point.x}
                        y={labelY}
                        textAnchor="middle"
                        className="text-xs font-semibold fill-emerald-600 pointer-events-none filter drop-shadow-sm"
                        style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}
                      >
                        {point.value}
                      </text>
                    </g>
                  );
                })}
                
                {/* X轴标签 */}
                {chartData.map((item, index) => {
                  const x = leftPadding + (index / (chartData.length - 1)) * chartWidth;
                  // 格式化日期，去掉年份
                  const formatPeriod = (period) => {
                    try {
                      if (!period) return '';
                      
                      // 检查是否是时间戳格式 "YYYY-MM-DD HH:00:00"
                      if (period.includes(':')) {
                        // 提取小时部分
                        const timePart = period.split(' ')[1];
                        if (timePart) {
                          const hour = timePart.split(':')[0];
                          return `${hour}时`;
                        }
                      }
                      
                      // 检查是否是日期格式 "YYYY-MM-DD"
                      if (period.includes('-') && !period.includes(':')) {
                        const dateParts = period.split('-');
                        if (dateParts.length === 3) {
                          const year = parseInt(dateParts[0]);
                          const month = parseInt(dateParts[1]) - 1;
                          const day = parseInt(dateParts[2]);
                          const date = new Date(year, month, day);
                          
                          if (!isNaN(date.getTime())) {
                            return date.toLocaleDateString('zh-CN', {
                              month: 'short',
                              day: 'numeric'
                            });
                          }
                        }
                      }
                      
                      return period;
                    } catch (error) {
                      console.error('Format period error:', error);
                      return period;
                    }
                  };
                  
                  return (
                    <g key={index}>
                      {/* X轴标签文字 */}
                      <text
                        x={x}
                        y={svgHeight - 10}
                        textAnchor="middle"
                        className="text-xs fill-gray-500 font-medium filter drop-shadow-sm"
                        style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}
                      >
                        {formatPeriod(item.period)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TimePeriodSelector = ({ period, onChange, className = "" }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <span className="text-sm font-medium text-gray-600">时间范围:</span>
    <div className="flex bg-gradient-to-r from-gray-100 to-gray-200 rounded-xl p-1.5 shadow-inner border border-gray-200/50">
      {['day', 'week', 'month'].map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-300 min-w-12 ${
            period === p 
              ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg transform scale-105 border border-blue-300' 
              : 'text-gray-600 hover:text-gray-800 hover:bg-white/70 hover:shadow-sm'
          }`}
        >
          {p === 'day' ? '日' : p === 'week' ? '周' : '月'}
        </button>
      ))}
    </div>
  </div>
);

function StaffDashboardPage({ role = 'admin', navActive = 'staff-dashboard', viewAllOrdersHref }) {
  const router = useRouter();
  const { user, isInitialized } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    stats: {},
    orderStats: {},
    topProducts: [],
    recentOrders: []
  });
  const [timePeriod, setTimePeriod] = useState('week');
  const [customersData, setCustomersData] = useState({
    customers: [],
    total: 0,
    currentPage: 0,
    hasMore: false
  });
  const [customersLoading, setCustomersLoading] = useState(false);

  const expectedRole = role === 'agent' ? 'agent' : 'admin';
  const isAdmin = expectedRole === 'admin';
  const isAgent = expectedRole === 'agent';
  const ordersListHref = viewAllOrdersHref || (isAdmin ? '/admin' : '/agent/orders');
  const staffPrefix = isAgent ? '/agent' : '/admin';

  // 验证管理员权限
  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.type !== expectedRole) {
      const fallback = user.type === 'admin'
        ? '/admin/dashboard'
        : user.type === 'agent'
          ? '/agent/dashboard'
          : '/';
      router.replace(fallback);
      return;
    }
    loadDashboardData();
    loadCustomersData(0);
  }, [isInitialized, user, expectedRole]);

  // 当时间段改变时重新加载数据
  useEffect(() => {
    if (!user || user.type !== expectedRole) return;
    loadDashboardData();
  }, [timePeriod, user, expectedRole]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // 获取详细的仪表盘统计数据  
      const dashboardRes = await fetch(`${API_BASE}${staffPrefix}/dashboard-stats?period=${timePeriod}`, {
        credentials: 'include'
      });
      const dashboardData = await dashboardRes.json();

      // 获取基本统计（产品数量等）
      const statsRes = await fetch(`${API_BASE}/admin/stats`, {
        credentials: 'include'
      });
      const statsData = await statsRes.json();

      // 获取最近订单
      const ordersRes = await fetch(`${API_BASE}${staffPrefix}/orders?limit=5`, {
        credentials: 'include'
      });
      const ordersData = await ordersRes.json();

      const dashboardStats = dashboardData.data || {};
      
      setDashboardData({
        dashboardStats: dashboardStats,
        basicStats: statsData.data || {},
        recentOrders: ordersData.data?.orders || []
      });
    } catch (error) {
      console.error('加载仪表盘数据失败:', error);
      // 设置默认数据以防API调用失败
      setDashboardData({
        dashboardStats: {
          total_orders: 0,
          total_revenue: 0,
          current_period: { revenue: 0, orders: 0, data: [] },
          comparison: { revenue_growth: 0, orders_growth: 0 },
          top_products: [],
          users: { total: 0, new_this_week: 0 }
        },
        basicStats: { total_products: 0, users_count: 0 },
        recentOrders: []
      });
    } finally {
      setLoading(false);
    }
  };

  const loadCustomersData = async (page = 0) => {
    if (!user || user.type !== expectedRole) {
      return;
    }
    setCustomersLoading(true);
    try {
      const offset = page * 5;
      const customersRes = await fetch(`${API_BASE}/admin/customers?limit=5&offset=${offset}`, {
        credentials: 'include'
      });
      const customersData = await customersRes.json();

      if (customersData.success) {
        setCustomersData({
          customers: customersData.data?.customers || [],
          total: customersData.data?.total || 0,
          currentPage: page,
          hasMore: customersData.data?.has_more || false
        });
      }
    } catch (error) {
      console.error('加载客户数据失败:', error);
      setCustomersData({
        customers: [],
        total: 0,
        currentPage: 0,
        hasMore: false
      });
    } finally {
      setCustomersLoading(false);
    }
  };


  // 如果不是管理员，不渲染内容
  if (!user || user.type !== expectedRole) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">正在加载仪表盘...</p>
        </div>
      </div>
    );
  }

  const { dashboardStats, basicStats } = dashboardData;
  const pageTitle = isAdmin ? '管理仪表盘 - [商店名称]' : '代理仪表盘 - [商店名称]';
  const headingTitle = isAdmin ? '管理仪表盘' : '代理仪表盘';
  const headingSubtitle = isAdmin
    ? '实时监控商城运营数据和关键指标，助力业务决策优化'
    : '查看您负责区域的订单和销售表现，及时掌握业务动态';

  // 计算增长类型
  const getChangeType = (value) => {
    if (!value || isNaN(value)) return 'same';
    if (value > 0) return 'up';
    if (value < 0) return 'down';
    return 'same';
  };

  // 格式化变化百分比
  const formatChange = (value) => {
    if (value === undefined || value === null || isNaN(value)) return null;
    return Math.round(value * 100) / 100; // 保留两位小数，包括0
  };

  // 安全获取订单状态计数
  const getStatusCount = (status) => {
    return dashboardStats.status_counts?.[status] || 
           dashboardStats[`${status}_orders`] || 
           dashboardStats[`${status}Orders`] || 0;
  };

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      {/* 通用导航栏 */}
      <Nav active={navActive} />

      <div className="min-h-screen pt-16 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">

        {/* 主要内容 */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* 页面标题 */}
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent mb-4">
              {headingTitle}
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">{headingSubtitle}</p>
            <div className="mt-6 w-24 h-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mx-auto"></div>
          </div>


          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
            <StatCard
              title="总订单数"
              value={dashboardStats.total_orders || 0}
              change={formatChange(dashboardStats.comparison?.orders_growth)}
              changeType={getChangeType(dashboardStats.comparison?.orders_growth)}
              subtitle={`${dashboardStats.period_name || '本期'}订单: ${dashboardStats.current_period?.orders || 0}`}
              icon={{ class: "fas fa-shopping-cart", bg: "bg-gradient-to-br from-blue-500 to-blue-600" }}
            />
            <StatCard
              title="总销售额"
              value={`¥${dashboardStats.total_revenue || 0}`}
              change={formatChange(dashboardStats.comparison?.revenue_growth)}
              changeType={getChangeType(dashboardStats.comparison?.revenue_growth)}
              subtitle={`${dashboardStats.period_name || '本期'}销售额: ¥${dashboardStats.current_period?.revenue || 0}`}
              icon={{ class: "fas fa-dollar-sign", bg: "bg-gradient-to-br from-emerald-500 to-emerald-600" }}
            />
            <StatCard
              title="净利润"
              value={`¥${dashboardStats.profit_stats?.total_profit || 0}`}
              change={formatChange(dashboardStats.comparison?.profit_growth)}
              changeType={getChangeType(dashboardStats.comparison?.profit_growth)}
              subtitle={`今日净利润: ¥${dashboardStats.profit_stats?.today_profit || 0}`}
              icon={{ class: "fas fa-chart-line", bg: "bg-gradient-to-br from-amber-500 to-amber-600" }}
            />
            <StatCard
              title="商品总数"
              value={basicStats.total_products || 0}
              subtitle={`分类数: ${basicStats.categories || 0}`}
              icon={{ class: "fas fa-cube", bg: "bg-gradient-to-br from-purple-500 to-purple-600" }}
            />
            <StatCard
              title="注册用户"
              value={dashboardStats.users?.total || 0}
              subtitle={`本周新用户: ${dashboardStats.users?.new_this_week || 0}`}
              icon={{ class: "fas fa-user-friends", bg: "bg-gradient-to-br from-orange-500 to-orange-600" }}
            />
          </div>

          {/* 销售趋势和商品统计 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12 min-h-[600px]">
            {/* 销售趋势 */}
            <div className="bg-gradient-to-br from-white to-blue-50/30 rounded-3xl p-8 shadow-lg border border-gray-100/50 backdrop-blur-sm relative overflow-hidden">
              {/* 背景装饰 */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-100/20 to-transparent rounded-full transform translate-x-16 -translate-y-16"></div>
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                    <div className="w-2 h-8 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full"></div>
                    销售趋势
                  </h3>
                  <TimePeriodSelector period={timePeriod} onChange={setTimePeriod} />
                </div>
                
                {/* 对比数据展示 */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="text-center p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/10 rounded-2xl border border-blue-200/30 backdrop-blur-sm">
                    <div className="text-sm text-blue-600 font-medium mb-2">当前{dashboardStats.period_name}</div>
                    <div className="text-2xl font-bold text-blue-700">¥{dashboardStats.current_period?.revenue || 0}</div>
                    <div className="text-xs text-gray-600 mt-1">{dashboardStats.current_period?.orders || 0} 订单</div>
                  </div>
                  <div className="text-center p-6 bg-gradient-to-br from-gray-100/50 to-gray-200/50 rounded-2xl border border-gray-200/50 backdrop-blur-sm">
                    <div className="text-sm text-gray-600 font-medium mb-2">上个周期</div>
                    <div className="text-2xl font-bold text-gray-700">¥{dashboardStats.comparison?.prev_revenue || 0}</div>
                    <div className="text-xs text-gray-600 mt-1">{dashboardStats.comparison?.prev_orders || 0} 订单</div>
                  </div>
                </div>

                {/* 订单状态统计 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-gray-200/50 hover:bg-white/70 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-gray-700">今日订单</span>
                    </div>
                    <span className="font-bold text-blue-600">{dashboardStats.today_orders || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-gray-200/50 hover:bg-white/70 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                      <span className="text-sm font-medium text-gray-700">待处理订单</span>
                    </div>
                    <span className="font-bold text-amber-600">{getStatusCount('pending')}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-gray-200/50 hover:bg-white/70 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                      <span className="text-sm font-medium text-gray-700">已完成订单</span>
                    </div>
                    <span className="font-bold text-emerald-600">{getStatusCount('delivered')}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-gray-200/50 hover:bg-white/70 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="text-sm font-medium text-gray-700">已确认订单</span>
                    </div>
                    <span className="font-bold text-blue-600">{getStatusCount('confirmed')}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-gray-200/50 hover:bg-white/70 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                      <span className="text-sm font-medium text-gray-700">已发货订单</span>
                    </div>
                    <span className="font-bold text-purple-600">{getStatusCount('shipped')}</span>
                  </div>
                </div>

                {/* 增长趋势指示器 */}
                <div className="mt-8 p-6 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 rounded-2xl border border-indigo-200/30 backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full animate-pulse shadow-lg ${
                      (dashboardStats.comparison?.revenue_growth || 0) > 0 ? 'bg-emerald-500' : 
                      (dashboardStats.comparison?.revenue_growth || 0) < 0 ? 'bg-red-500' : 'bg-gray-500'
                    }`}></div>
                    <span className="text-sm font-medium text-gray-700">
                      {(dashboardStats.comparison?.revenue_growth || 0) > 0 ? '销售增长良好' :
                       (dashboardStats.comparison?.revenue_growth || 0) < 0 ? '销售有所下降' : '销售保持稳定'}
                      ，趋势{(dashboardStats.comparison?.orders_growth || 0) > 0 ? '向上' : 
                      (dashboardStats.comparison?.orders_growth || 0) < 0 ? '向下' : '平稳'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 热门商品排行 */}
            <div className="bg-gradient-to-br from-white to-gray-50 rounded-3xl p-8 shadow-lg border border-gray-100 backdrop-blur-sm relative overflow-hidden h-full flex flex-col">
              {/* 背景装饰 */}
              <div className="absolute top-0 left-0 w-24 h-24 bg-gradient-to-br from-purple-100/30 to-transparent rounded-full transform -translate-x-8 -translate-y-8"></div>
              
              <div className="relative z-10 flex flex-col h-full">
                <h3 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-3">
                  <div className="w-2 h-8 bg-gradient-to-b from-purple-500 to-pink-600 rounded-full"></div>
                  热门商品销量排行 ({
                    timePeriod === 'day' ? '今日' :
                    timePeriod === 'week' ? '近7天' : '近30天'
                  })
                </h3>
                
                {/* 简化的商品排行内容 */}
                {(!dashboardStats.top_products || dashboardStats.top_products.length === 0) ? (
                  <div className="flex items-center justify-center h-48 text-gray-500 flex-1">
                    <div className="text-center">
                      <i className="fas fa-chart-bar text-4xl mb-4 opacity-30"></i>
                      <p className="text-lg">暂无数据</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5 flex-1 overflow-y-auto custom-scrollbar">
                    {dashboardStats.top_products.map((item, index) => {
                      const maxValue = Math.max(...dashboardStats.top_products.map(d => d.sold || 0));
                      const percentage = maxValue > 0 ? (item.sold / maxValue) * 100 : 0;
                      
                      return (
                        <div key={index} className="group">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-lg ${
                                index === 0 ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
                                index === 1 ? 'bg-gradient-to-r from-blue-400 to-purple-500' :
                                index === 2 ? 'bg-gradient-to-r from-emerald-400 to-teal-500' :
                                'bg-gradient-to-r from-gray-400 to-gray-500'
                              }`}>
                                {index + 1}
                              </div>
                              <div className="text-sm font-medium text-gray-700 max-w-32 truncate" title={item.name}>
                                {item.name}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-sm font-bold text-gray-900">
                                {item.sold}
                              </div>
                              {item.revenue && (
                                <div className="text-xs text-gray-500 bg-gray-100/50 px-2 py-1 rounded-lg">
                                  ¥{item.revenue}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="relative">
                            <div className="flex-1 bg-gradient-to-r from-gray-100 to-gray-200 rounded-xl h-4 relative overflow-hidden shadow-inner">
                              <div 
                                className={`h-full rounded-xl transition-all duration-1000 ease-out shadow-lg ${
                                  index === 0 ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-red-500' :
                                  index === 1 ? 'bg-gradient-to-r from-blue-400 via-purple-500 to-indigo-600' :
                                  index === 2 ? 'bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-600' :
                                  index === 3 ? 'bg-gradient-to-r from-pink-400 via-rose-500 to-red-500' :
                                  'bg-gradient-to-r from-violet-400 via-purple-500 to-indigo-600'
                                }`}
                                style={{ width: `${percentage}%` }}
                              >
                                <div className="h-full bg-white/20 rounded-xl"></div>
                              </div>
                            </div>
                            
                            {/* 排名徽章 */}
                            {index < 3 && (
                              <div className={`absolute right-2 top-1/2 transform -translate-y-1/2 ${
                                index === 0 ? 'text-amber-600' :
                                index === 1 ? 'text-blue-600' :
                                'text-emerald-600'
                              }`}>
                                {index === 0 && <i className="fas fa-crown text-xs"></i>}
                                {index === 1 && <i className="fas fa-medal text-xs"></i>}
                                {index === 2 && <i className="fas fa-award text-xs"></i>}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 详细趋势图 */}
          <div className="grid grid-cols-1 mb-12">
            <SalesTrendChart 
              data={dashboardStats.current_period?.data || []}
              title={`销售趋势 - ${dashboardStats.period_name || ''}`}
              period={timePeriod}
            />
          </div>

          {/* 最近订单和客户信息 */}
          <div className="grid grid-cols-1 gap-8 mb-12">
            {/* 最近订单 */}
            <div className="bg-gradient-to-br from-white to-gray-50 rounded-3xl p-8 shadow-lg border border-gray-100/50 backdrop-blur-sm relative overflow-hidden">
            {/* 背景装饰 */}
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-indigo-100/20 to-transparent rounded-full transform -translate-x-20 translate-y-20"></div>
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                  <div className="w-2 h-8 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full"></div>
                  最近订单
                </h3>
                <Link 
                  href={ordersListHref}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/50 border border-indigo-200/50 hover:border-indigo-300/50 transition-all duration-300 hover:shadow-sm"
                >
                  查看全部
                  <i className="fas fa-arrow-right text-xs"></i>
                </Link>
              </div>
              
              <div className="overflow-hidden rounded-2xl border border-gray-200/50 bg-white/50 backdrop-blur-sm">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-gray-50/80 to-gray-100/80 border-b border-gray-200/50">
                        <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700 uppercase tracking-wide">订单号</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700 uppercase tracking-wide">客户</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700 uppercase tracking-wide">金额</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700 uppercase tracking-wide">状态</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700 uppercase tracking-wide">时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200/50">
                      {dashboardData.recentOrders?.map((order, index) => (
                        <tr key={order.id} className="hover:bg-white/70 transition-all duration-200 group">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-lg flex items-center justify-center">
                                <i className="fas fa-receipt text-indigo-600 text-xs"></i>
                              </div>
                              <span className="text-sm font-mono font-medium text-gray-900">
                                #{order.id?.slice(-8)}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center">
                                <i className="fas fa-user text-blue-600 text-xs"></i>
                              </div>
                              <span className="text-sm font-medium text-gray-900">
                                {order.customer_name || order.student_id}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2">
                              <i className="fas fa-yuan-sign text-emerald-600 text-xs"></i>
                              <span className="text-sm font-bold text-gray-900">
                                {order.total_amount}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border shadow-sm transition-all duration-200 ${
                              order.status === 'delivered' ? 'bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700 border-emerald-200' :
                              order.status === 'pending' ? 'bg-gradient-to-r from-amber-50 to-amber-100 text-amber-700 border-amber-200' :
                              order.status === 'confirmed' ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border-blue-200' :
                              order.status === 'shipped' ? 'bg-gradient-to-r from-purple-50 to-purple-100 text-purple-700 border-purple-200' :
                              order.status === 'cancelled' ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-700 border-red-200' :
                              'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-700 border-gray-200'
                            }`}>
                              <div className={`w-2 h-2 rounded-full ${
                                order.status === 'delivered' ? 'bg-emerald-500' :
                                order.status === 'pending' ? 'bg-amber-500' :
                                order.status === 'confirmed' ? 'bg-blue-500' :
                                order.status === 'shipped' ? 'bg-purple-500' :
                                order.status === 'cancelled' ? 'bg-red-500' : 'bg-gray-500'
                              }`}></div>
                              {order.status === 'delivered' ? '已完成' :
                               order.status === 'pending' ? '待处理' :
                               order.status === 'confirmed' ? '已确认' :
                               order.status === 'shipped' ? '已发货' :
                               order.status === 'cancelled' ? '已取消' : order.status}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2">
                              <i className="fas fa-clock text-gray-400 text-xs"></i>
                              <span className="text-sm text-gray-600 font-medium">
                                {(() => {
                                  // 获取时间戳（秒），优先使用后端提供的timestamp，否则从字符串解析
                                  const timestamp = order.created_at_timestamp || Math.floor(new Date(order.created_at).getTime() / 1000);
                                  // 转换为毫秒并创建Date对象，使用本地时区
                                  const date = new Date(timestamp * 1000);
                                  // 格式化为本地时间
                                  return date.toLocaleString('zh-CN', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: false
                                  });
                                })()}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(!dashboardData.recentOrders || dashboardData.recentOrders.length === 0) && (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-inbox text-gray-400 text-xl"></i>
                  </div>
                  <p className="text-lg font-medium text-gray-500 mb-2">暂无订单数据</p>
                  <p className="text-sm text-gray-400">订单数据将在这里显示</p>
                </div>
              )}
            </div>
            </div>

            {/* 客户信息卡片 */}
            <div className="bg-gradient-to-br from-white to-cyan-50/30 rounded-3xl p-8 shadow-lg border border-gray-100/50 backdrop-blur-sm relative overflow-hidden">
            {/* 背景装饰 */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-cyan-100/20 to-transparent rounded-full transform translate-x-16 -translate-y-16"></div>
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                  <div className="w-2 h-8 bg-gradient-to-b from-cyan-500 to-blue-600 rounded-full"></div>
                  优质客户
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">共 {customersData.total} 位客户</span>
                </div>
              </div>

              {customersLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600">正在加载客户数据...</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {customersData.customers?.map((customer, index) => (
                      <div key={customer.id} className="bg-white/60 rounded-2xl p-6 border border-gray-200/50 hover:bg-white/80 transition-all duration-200 group">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {/* 排名徽章 */}
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg ${
                              index === 0 ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
                              index === 1 ? 'bg-gradient-to-r from-gray-400 to-gray-500' :
                              index === 2 ? 'bg-gradient-to-r from-amber-600 to-amber-700' :
                              'bg-gradient-to-r from-cyan-400 to-cyan-500'
                            }`}>
                              {customersData.currentPage * 5 + index + 1}
                            </div>
                            
                            {/* 客户信息 */}
                            <div>
                              <div className="font-semibold text-gray-900 flex items-center gap-2">
                                <span>{customer.name}</span>
                                <span className="text-sm text-gray-500 font-mono">({customer.id})</span>
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                共 {customer.order_count} 笔订单 · 平均 ¥{customer.avg_order_amount}
                              </div>
                            </div>
                          </div>
                          
                          {/* 总消费 */}
                          <div className="text-right">
                            <div className="text-2xl font-bold text-cyan-600">
                              ¥{Number(customer.total_spent).toFixed(2)}
                            </div>
                            <div className="text-sm text-gray-500">
                              总消费
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 分页控制 */}
                  {customersData.total > 5 && (
                    <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200/50">
                      <button
                        onClick={() => loadCustomersData(customersData.currentPage - 1)}
                        disabled={customersData.currentPage === 0}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-cyan-600 hover:text-cyan-700 bg-cyan-50/50 hover:bg-cyan-100/50 border border-cyan-200/50 hover:border-cyan-300/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <i className="fas fa-chevron-left text-xs"></i>
                        上一页
                      </button>
                      
                      <div className="text-sm text-gray-600">
                        第 {customersData.currentPage + 1} 页，共 {Math.ceil(customersData.total / 5)} 页
                      </div>
                      
                      <button
                        onClick={() => loadCustomersData(customersData.currentPage + 1)}
                        disabled={!customersData.hasMore}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-cyan-600 hover:text-cyan-700 bg-cyan-50/50 hover:bg-cyan-100/50 border border-cyan-200/50 hover:border-cyan-300/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        下一页
                        <i className="fas fa-chevron-right text-xs"></i>
                      </button>
                    </div>
                  )}

                  {(!customersData.customers || customersData.customers.length === 0) && (
                    <div className="text-center py-16">
                      <div className="w-16 h-16 bg-gradient-to-br from-cyan-100 to-cyan-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <i className="fas fa-users text-cyan-500 text-xl"></i>
                      </div>
                      <p className="text-lg font-medium text-gray-500 mb-2">暂无客户数据</p>
                      <p className="text-sm text-gray-400">客户数据将在这里显示</p>
                    </div>
                  )}
                </>
              )}
            </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function StaffDashboard(props) {
  return <StaffDashboardPage {...props} />;
}

export default function AdminDashboardPage() {
  return (
    <StaffDashboardPage
      role="admin"
      navActive="staff-dashboard"
      viewAllOrdersHref="/admin"
    />
  );
}
