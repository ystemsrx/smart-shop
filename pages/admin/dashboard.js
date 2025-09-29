import React, { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import { useAuth } from '../../hooks/useAuth';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { getApiBaseUrl, getShopName } from '../../utils/runtimeConfig';


const API_BASE = getApiBaseUrl();
const SHOP_NAME = getShopName();

const parsePeriodValueToDate = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'number') {
    const timestamp = value > 1e12 ? value : value * 1000;
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const candidates = [trimmed, trimmed.replace(' ', 'T'), trimmed.replace(/-/g, '/')];
    for (const candidate of candidates) {
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  return null;
};

// 数字格式化函数，处理浮点数精度问题
const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }
  const num = Number(value);
  if (num === 0) return 0;
  
  // 对于整数，直接返回整数显示
  if (Number.isInteger(num)) {
    return num;
  }
  
  // 对于小数，保留指定位数并去除尾部零
  return parseFloat(num.toFixed(decimals));
};

// 现代化的StatCard组件
const StatCard = ({ title, value, change, changeType, icon, subtitle }) => (
  <div className="bg-gradient-to-br from-white to-gray-50/50 rounded-3xl p-8 shadow-lg border border-gray-100/50 hover:shadow-xl hover:border-gray-200/50 transition-all duration-500 group backdrop-blur-sm relative overflow-hidden">
    {/* 背景装饰 */}
    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-current/5 to-transparent rounded-full transform translate-x-8 -translate-y-8 group-hover:translate-x-6 group-hover:-translate-y-6 transition-transform duration-500"></div>
    
    <div className="relative z-10">
      <div className="flex items-start justify-between mb-6 gap-3">
        {/* 左侧图标 - 固定尺寸，防止被挤压 */}
        <div className={`flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg ${
          icon.bg || 'bg-gradient-to-br from-blue-500 to-blue-600'
        }`}>
          <i className={`${icon.class} text-xl text-white drop-shadow-sm`}></i>
        </div>
        
        {/* 右侧变化指示器 - 调整布局使其更紧凑 */}
        {change !== undefined && (
          <div className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-semibold backdrop-blur-sm border shadow-sm transition-all duration-300 group-hover:scale-105 ${
            changeType === 'up' ? 'bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700 border-emerald-200' : 
            changeType === 'down' ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-700 border-red-200' : 
            'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-700 border-gray-200'
          }`}>
            {changeType === 'up' && <i className="fas fa-arrow-up text-xs"></i>}
            {changeType === 'down' && <i className="fas fa-arrow-down text-xs"></i>}
            {changeType === 'same' && <i className="fas fa-minus text-xs"></i>}
            <span className="whitespace-nowrap">
              {typeof change === 'number' ? `${change > 0 ? '+' : ''}${change}%` : change}
            </span>
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
                      {type === 'quantity' ? value : `¥${formatNumber(value)}`}
                    </div>
                    {item.revenue && (
                      <div className="text-xs text-gray-500 bg-gray-100/50 px-2 py-1 rounded-lg">
                        ¥{formatNumber(item.revenue)}
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
const SalesTrendChart = ({ data, title, period, settings }) => {
  const dataset = useMemo(() => {
    if (!Array.isArray(data)) {
      return [];
    }
    const safeData = data
      .filter(Boolean)
      .map(item => ({ ...item }));
    safeData.sort((a, b) => {
      const dateA = parsePeriodValueToDate(a?.period);
      const dateB = parsePeriodValueToDate(b?.period);
      if (dateA && dateB) {
        return dateA.getTime() - dateB.getTime();
      }
      if (dateA) return 1;
      if (dateB) return -1;
      return 0;
    });
    return safeData;
  }, [data]);

  const chartConfig = useMemo(() => {
    const defaults = {
      day: { windowSize: 24, step: 24 },
      week: { windowSize: 7, step: 7 },
      month: { windowSize: 30, step: 30 }
    };
    const base = defaults[period] || defaults.week;
    if (!settings) {
      return base;
    }
    const normalizedWindowSize = settings.window_size ?? settings.windowSize ?? base.windowSize;
    const normalizedStep = settings.step ?? settings.windowStep ?? base.step;
    return {
      windowSize: normalizedWindowSize > 0 ? normalizedWindowSize : base.windowSize,
      step: normalizedStep > 0 ? normalizedStep : base.step
    };
  }, [period, settings]);

  const windowSize = chartConfig.windowSize;
  const step = chartConfig.step;
  const initialWindowStart = Math.max(dataset.length - windowSize, 0);
  const [windowStart, setWindowStart] = useState(initialWindowStart);
  const maxStart = Math.max(dataset.length - windowSize, 0);

  const previousPeriodRef = useRef(period);
  const previousMaxStartRef = useRef(maxStart);

  useEffect(() => {
    const periodChanged = previousPeriodRef.current !== period;
    const prevMaxStart = previousMaxStartRef.current;

    previousPeriodRef.current = period;
    previousMaxStartRef.current = maxStart;

    setWindowStart(prev => {
      if (periodChanged) {
        return maxStart;
      }
      if (prev > maxStart) {
        return maxStart;
      }
      if (maxStart > prevMaxStart && prev === prevMaxStart) {
        return maxStart;
      }
      return prev;
    });
  }, [maxStart, period]);

  const startIndex = Math.max(0, Math.min(windowStart, maxStart));
  const endIndex = Math.min(startIndex + windowSize, dataset.length);
  const chartData = dataset.slice(startIndex, endIndex);

  if (dataset.length === 0) {
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

  const sliceRevenue = chartData.map(d => d.revenue || 0);
  const sliceProfit = chartData.map(d => d.profit || 0);
  const sliceOrders = chartData.map(d => d.orders || 0);
  const maxRevenue = Math.max(0, ...sliceRevenue);
  const maxProfit = Math.max(0, ...sliceProfit);
  const maxOrders = Math.max(0, ...sliceOrders);
  
  // 销售额和净利润共用左侧Y轴，取两者的最大值
  const maxLeftAxis = Math.max(maxRevenue, maxProfit);
  const safeMaxLeftAxis = maxLeftAxis > 0 ? maxLeftAxis : 1;
  const safeMaxOrders = maxOrders > 0 ? maxOrders : 1;

  const isAllZero = maxRevenue === 0 && maxProfit === 0 && maxOrders === 0;
  const hasMetrics = (item) => {
    if (!item) {
      return false;
    }
    const revenue = Number(item.revenue) || 0;
    const profit = Number(item.profit) || 0;
    const orders = Number(item.orders) || 0;
    return revenue !== 0 || profit !== 0 || orders !== 0;
  };

  const showEmptyDayState = period === 'day' && isAllZero;
  const plottedData = useMemo(() => {
    if (showEmptyDayState) {
      return [];
    }
    if (period === 'day') {
      return chartData.filter(hasMetrics);
    }
    return chartData;
  }, [chartData, period, showEmptyDayState]);

  const visibleDayInfo = useMemo(() => {
    if (period !== 'day' || chartData.length === 0) {
      return null;
    }
    const firstWithDate = chartData.find(item => parsePeriodValueToDate(item.period));
    if (!firstWithDate) {
      return null;
    }
    const parsed = parsePeriodValueToDate(firstWithDate.period);
    if (!parsed) {
      return null;
    }
    const display = `${parsed.getFullYear()}.${parsed.getMonth() + 1}.${parsed.getDate()}`;
    return { display };
  }, [chartData, period]);

  const hasPrev = startIndex > 0;
  const hasNext = endIndex < dataset.length;

  const handlePrev = () => {
    if (!hasPrev) return;
    setWindowStart(prev => Math.max(prev - step, 0));
  };

  const handleNext = () => {
    if (!hasNext) return;
    setWindowStart(prev => Math.min(prev + step, maxStart));
  };

  // SVG 图表参数 - 调整以撑满卡片，为右侧Y轴预留空间
  const svgWidth = 600;
  const svgHeight = 400;
  const leftPadding = 40;
  const rightPadding = 40; // 为右侧Y轴预留空间
  const topPadding = 40;
  const bottomPadding = period === 'month' ? 60 : period === 'day' ? 80 : 50;
  const chartWidth = svgWidth - leftPadding - rightPadding;
  const chartHeight = svgHeight - topPadding - bottomPadding;
  
  // 计算坐标点
  const getPoints = (values, maxValue) => {
    const safeMaxValue = maxValue > 0 ? maxValue : 1;
    const length = values.length;

    return values.map((value, index) => {
      const x = length === 1
        ? leftPadding + chartWidth / 2
        : leftPadding + (index / (length - 1)) * chartWidth;
      const y = topPadding + chartHeight - ((value / safeMaxValue) * chartHeight);
      return { x, y, value };
    });
  };

  const revenuePoints = getPoints(plottedData.map(d => d.revenue || 0), safeMaxLeftAxis);
  const profitPoints = getPoints(plottedData.map(d => d.profit || 0), safeMaxLeftAxis);
  const ordersPoints = getPoints(plottedData.map(d => d.orders || 0), safeMaxOrders);

  const dayLabelY = (() => {
    if (period === 'month') return svgHeight - 30;
    if (period === 'day') return svgHeight - 35;
    return svgHeight - 20;
  })();
  const monthLabelY = svgHeight - 10;
  const dateLabelY = svgHeight - 15;

  const formatAxisLabel = (dataPoint) => {
    if (!dataPoint) {
      return '';
    }

    const periodValue = dataPoint.period;
    const parsedDate = parsePeriodValueToDate(periodValue);

    if (period === 'day') {
      if (!parsedDate || !hasMetrics(dataPoint)) {
        return '';
      }
      return `${parsedDate.getHours()}时`;
    }

    if (!parsedDate) {
      if (period === 'month') {
        const parts = String(periodValue || '').split('-');
        const dayPart = parts[parts.length - 1] || '';
        return dayPart.replace(/^0/, '') || periodValue || '';
      }
      return periodValue || '';
    }

    if (period === 'month') {
      return parsedDate.getDate();
    }

    return `${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日`;
  };

  const monthLabels = [];

  if (period === 'month' && plottedData.length > 0) {
    const monthBuckets = new Map();

    plottedData.forEach((item, index) => {
      const parsedDate = parsePeriodValueToDate(item.period);
      if (!parsedDate) {
        return;
      }
      const key = `${parsedDate.getFullYear()}-${parsedDate.getMonth()}`;
      if (!monthBuckets.has(key)) {
        monthBuckets.set(key, {
          label: `${parsedDate.getMonth() + 1}月`,
          indices: []
        });
      }
      monthBuckets.get(key).indices.push(index);
    });

    monthBuckets.forEach(({ label, indices }) => {
      const positions = indices
        .map(idx => revenuePoints[idx]?.x)
        .filter(x => typeof x === 'number' && !Number.isNaN(x));
      const averageX = positions.length > 0
        ? positions.reduce((sum, value) => sum + value, 0) / positions.length
        : leftPadding + chartWidth / 2;
      monthLabels.push({ label, x: averageX });
    });
  }

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
        {/* 标题和按钮在同一行 */}
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-2 h-8 bg-gradient-to-b from-blue-500 via-indigo-500 to-purple-600 rounded-full shadow-lg"></div>
            {title}
          </h3>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrev}
              disabled={!hasPrev}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/90 border border-blue-100 text-blue-500 shadow-lg transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
              aria-label="查看前7天数据"
            >
              <i className="fas fa-chevron-left"></i>
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!hasNext}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/90 border border-blue-100 text-blue-500 shadow-lg transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
              aria-label="查看后7天数据"
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
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
                <div className="text-xs text-blue-600 font-medium uppercase tracking-wide">
                  {period === 'day' ? '当日销售额' : period === 'week' ? '当周销售额' : '当月销售额'}
                </div>
                <div className="text-2xl font-bold text-blue-700 mt-1">¥{formatNumber(chartData.reduce((sum, item) => sum + (Number(item.revenue) || 0), 0))}</div>
                <div className="w-full h-1 bg-blue-200/50 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full w-3/4 transition-all duration-1000"></div>
                </div>
              </div>
              <div className="p-4 bg-gradient-to-br from-amber-50/80 to-amber-100/70 rounded-xl border border-amber-200/40 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="text-xs text-amber-600 font-medium uppercase tracking-wide">
                  {period === 'day' ? '当日净利润' : period === 'week' ? '当周净利润' : '当月净利润'}
                </div>
                <div className="text-2xl font-bold text-amber-700 mt-1">¥{formatNumber(chartData.reduce((sum, item) => sum + (Number(item.profit) || 0), 0))}</div>
                <div className="w-full h-1 bg-amber-200/50 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-400 to-orange-600 rounded-full w-2/3 transition-all duration-1000"></div>
                </div>
              </div>
              <div className="p-4 bg-gradient-to-br from-emerald-50/80 to-emerald-100/70 rounded-xl border border-emerald-200/40 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="text-xs text-emerald-600 font-medium uppercase tracking-wide">
                  {period === 'day' ? '当日订单数' : period === 'week' ? '当周订单数' : '当月订单数'}
                </div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">{formatNumber(chartData.reduce((sum, item) => sum + (Number(item.orders) || 0), 0), 0)}</div>
                <div className="w-full h-1 bg-emerald-200/50 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full w-2/3 transition-all duration-1000"></div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 折线图 - 调整高度匹配左侧 */}
          <div className="lg:col-span-2 flex flex-col">
            <div className="bg-white/80 rounded-2xl p-4 border border-gray-200/50 backdrop-blur-sm shadow-inner flex-1">
              {showEmptyDayState ? (
                <div className="flex h-full flex-col items-center justify-center text-gray-500">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                    <i className="fas fa-chart-line text-blue-400 text-2xl"></i>
                  </div>
                  <p className="text-lg font-medium">该日暂无数据</p>
                  {visibleDayInfo && (
                    <p className="mt-2 text-sm text-gray-400">{visibleDayInfo.display}</p>
                  )}
                </div>
              ) : (
                <svg 
                  width="100%" 
                  height="100%" 
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="overflow-visible h-full"
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
                    className="transition-all duration-500 ease-out"
                  />
                )}
                
                {/* 净利润面积 */}
                {profitPoints.length > 1 && (
                  <path
                    d={`${profitPath} L ${profitPoints[profitPoints.length - 1].x} ${topPadding + chartHeight} L ${profitPoints[0].x} ${topPadding + chartHeight} Z`}
                    fill="url(#profitAreaGradient)"
                    className="transition-all duration-500 ease-out"
                  />
                )}
                
                {/* 订单数面积 */}
                {ordersPoints.length > 1 && (
                  <path
                    d={`${ordersPath} L ${ordersPoints[ordersPoints.length - 1].x} ${topPadding + chartHeight} L ${ordersPoints[0].x} ${topPadding + chartHeight} Z`}
                    fill="url(#ordersAreaGradient)"
                    className="transition-all duration-500 ease-out"
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
                    className="transition-all duration-500 ease-out"
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
                    className="transition-all duration-500 ease-out"
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
                    className="transition-all duration-500 ease-out"
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
                {period !== 'month' && revenuePoints.map((point, index) => {
                  const source = plottedData[index];
                  if (!source || (Number(source.revenue) || 0) === 0) {
                    return null;
                  }
                  const labelY = getSmartLabelPosition(point, index, revenuePoints, 'revenue');
                  
                  return (
                    <g key={`revenue-${index}`} className="transition-all duration-500 ease-out">
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
                {period !== 'month' && profitPoints.map((point, index) => {
                  const source = plottedData[index];
                  if (!source || (Number(source.profit) || 0) === 0) {
                    return null;
                  }
                  const labelY = getSmartLabelPosition(point, index, profitPoints, 'profit');
                  
                  return (
                    <g key={`profit-${index}`} className="transition-all duration-500 ease-out">
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
                  const source = plottedData[index];
                  if (!source || (Number(source.orders) || 0) === 0) {
                    return null;
                  }
                  const labelY = getSmartLabelPosition(point, index, ordersPoints, 'orders');
                  
                  return (
                    <g key={`orders-${index}`} className="transition-all duration-500 ease-out">
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
                {plottedData.map((item, index) => {
                  const length = plottedData.length;
                  const x = length === 1
                    ? leftPadding + chartWidth / 2
                    : leftPadding + (index / (length - 1)) * chartWidth;
                  const label = formatAxisLabel(item);
                  if (!label) {
                    return null;
                  }

                  return (
                    <g key={`axis-${item.period}-${index}`}>
                      {/* X轴标签文字 */}
                      <text
                        x={x}
                        y={dayLabelY}
                        textAnchor="middle"
                        className="text-xs fill-gray-500 font-medium filter drop-shadow-sm"
                        style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}

                {period === 'month' && monthLabels.map(({ label, x }, index) => (
                  <text
                    key={`month-${label}-${index}`}
                    x={x}
                    y={monthLabelY}
                    textAnchor="middle"
                    className="text-xs font-semibold fill-gray-600 tracking-wide"
                    style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}
                  >
                    {label}
                  </text>
                ))}

                {period === 'day' && visibleDayInfo && (
                  <text
                    x={leftPadding + chartWidth / 2}
                    y={dateLabelY}
                    textAnchor="middle"
                    className="text-xs font-semibold fill-gray-400 tracking-wide"
                    style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}
                  >
                    {visibleDayInfo.display}
                  </text>
                )}
                </svg>
              )}
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

function StaffDashboardPage({ role = 'admin', navActive = 'staff-dashboard' }) {
  const router = useRouter();
  const { user, isInitialized } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    dashboardStats: {
      current_period: { data: [] }
    },
    basicStats: {}
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

      const dashboardStats = dashboardData.data || {};
      
      setDashboardData({
        dashboardStats: dashboardStats,
        basicStats: statsData.data || {}
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
        basicStats: { total_products: 0, users_count: 0 }
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
  const pageTitle = isAdmin ? `管理仪表盘 - ${SHOP_NAME}` : `代理仪表盘 - ${SHOP_NAME}`;
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
              value={`¥${formatNumber(dashboardStats.total_revenue || 0)}`}
              change={formatChange(dashboardStats.comparison?.revenue_growth)}
              changeType={getChangeType(dashboardStats.comparison?.revenue_growth)}
              subtitle={`${dashboardStats.period_name || '本期'}销售额: ¥${formatNumber(dashboardStats.current_period?.revenue || 0)}`}
              icon={{ class: "fas fa-dollar-sign", bg: "bg-gradient-to-br from-emerald-500 to-emerald-600" }}
            />
            <StatCard
              title="净利润"
              value={`¥${formatNumber(dashboardStats.profit_stats?.total_profit || 0)}`}
              change={formatChange(dashboardStats.comparison?.profit_growth)}
              changeType={getChangeType(dashboardStats.comparison?.profit_growth)}
              subtitle={`${timePeriod === 'day' ? '今日' : timePeriod === 'week' ? '本周' : '本月'}净利润: ¥${formatNumber(dashboardStats.profit_stats?.current_period_profit || 0)}`}
              icon={{ class: "fas fa-chart-line", bg: "bg-gradient-to-br from-amber-500 to-amber-600" }}
            />
            <StatCard
              title="商品总数"
              value={basicStats.total_products || 0}
              subtitle={`分类数: ${basicStats.categories || 0}`}
              icon={{ class: "fas fa-cube", bg: "bg-gradient-to-br from-purple-500 to-purple-600" }}
            />
            <StatCard
              title="消费用户"
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
                    销售数据
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
                    <div className="text-sm text-gray-600 font-medium mb-2">
                      {timePeriod === 'day' ? '昨日' : timePeriod === 'week' ? '前7天' : '前30天'}
                    </div>
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
                            <div className="flex items-center gap-3">
                              <div className="text-sm font-bold text-gray-900 w-10 text-right">
                                {item.sold}
                              </div>
                              {item.change !== undefined && item.change !== 0 && (
                                <div className={`flex items-center justify-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg min-w-[52px] ${
                                  item.change > 0 
                                    ? 'text-green-600 bg-green-50' 
                                    : 'text-red-600 bg-red-50'
                                }`}>
                                  <i className={`fas fa-arrow-${item.change > 0 ? 'up' : 'down'}`}></i>
                                  {Math.abs(item.change)}
                                </div>
                              )}
                              {(item.change === undefined || item.change === 0) && (
                                <div className="flex items-center justify-center text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg min-w-[52px]">
                                  --
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
              data={dashboardStats.chart_data || dashboardStats.current_period?.data || []}
              title={`销售趋势 - ${dashboardStats.period_name || ''}`}
              period={timePeriod}
              settings={dashboardStats.chart_settings}
            />
          </div>

          {/* 客户信息 */}
          <div className="grid grid-cols-1 gap-8 mb-12">
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
                                共 {customer.order_count} 笔订单 · 平均 ¥{formatNumber(customer.avg_order_amount)}
                              </div>
                            </div>
                          </div>
                          
                          {/* 总消费 */}
                          <div className="text-right">
                            <div className="text-2xl font-bold text-cyan-600">
                              ¥{formatNumber(customer.total_spent)}
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
    />
  );
}
