import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Head from 'next/head';
import { useAuth } from '../../hooks/useAuth';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { getApiBaseUrl, getShopName } from '../../utils/runtimeConfig';
import { motion } from 'framer-motion';
import { 
  ShoppingCart, 
  DollarSign, 
  TrendingUp, 
  Package, 
  Users, 
  ArrowUp, 
  ArrowDown, 
  Minus, 
  ChevronLeft, 
  ChevronRight,
  BarChart3,
  LineChart,
  Activity,
  Calendar,
  Crown,
  Medal,
  Award
} from 'lucide-react';

const API_BASE = getApiBaseUrl();
const SHOP_NAME = getShopName();

// --- Utility Functions ---

const parsePeriodValueToDate = (value) => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value;
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
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
};

const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) return 0;
  const num = Number(value);
  if (num === 0) return 0;
  if (Number.isInteger(num)) return num;
  return parseFloat(num.toFixed(decimals));
};

const formatDateTimeLocal = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const pad = (v) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

// --- Components ---

const StatCard = ({ title, value, change, changeType, icon: Icon, subtitle, colorClass }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 relative overflow-hidden group"
    >
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full opacity-5 -translate-y-8 translate-x-8 group-hover:scale-110 transition-transform duration-500 ${colorClass.bg}`} />
      
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className={`p-3 rounded-xl ${colorClass.bg} ${colorClass.text} bg-opacity-10`}>
          <Icon size={24} strokeWidth={2} />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            changeType === 'up' ? 'bg-emerald-50 text-emerald-600' : 
            changeType === 'down' ? 'bg-rose-50 text-rose-600' : 
            'bg-slate-50 text-slate-600'
          }`}>
            {changeType === 'up' && <ArrowUp size={12} />}
            {changeType === 'down' && <ArrowDown size={12} />}
            {changeType === 'same' && <Minus size={12} />}
            <span>{typeof change === 'number' ? `${change > 0 ? '+' : ''}${change}%` : change}</span>
          </div>
        )}
      </div>
      
      <div className="relative z-10">
        <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
        <div className="text-2xl font-bold text-slate-800 tracking-tight">{value}</div>
        {subtitle && (
          <div className="text-xs text-slate-400 mt-2 font-medium">
            {subtitle}
          </div>
        )}
      </div>
    </motion.div>
);
};

const SimpleBarChart = ({ data, title, type = 'quantity' }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 flex flex-col justify-center items-center text-slate-400" style={{ height: '450px' }}>
        <BarChart3 size={48} className="mb-4 opacity-20" />
        <p>暂无数据</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.sold || d.value || 0));
  
  // SimpleBarChart 用于显示热销商品，不需要日期处理
  
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 flex flex-col"
      style={{ height: '450px' }}
    >
      <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 flex-shrink-0">
        <span className="w-1 h-5 bg-indigo-500 rounded-full"></span>
          {title}
        </h3>
        
      <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0" style={{ maxHeight: '300px' }}>
          {data.map((item, index) => {
            const value = item.sold || item.value || 0;
            const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
            
            return (
              <div key={index} className="group">
                <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    index === 0 ? 'bg-amber-100 text-amber-600' :
                    index === 1 ? 'bg-slate-100 text-slate-600' :
                    index === 2 ? 'bg-orange-100 text-orange-600' :
                    'bg-slate-50 text-slate-400'
                    }`}>
                      {index + 1}
                    </div>
                  <div className="text-sm font-medium text-slate-700 truncate" title={item.name}>
                      {item.name}
                    </div>
                  </div>
                <div className="text-sm font-bold text-slate-800 shrink-0 pl-2">
                      {type === 'quantity' ? value : `¥${formatNumber(value)}`}
                  </div>
                </div>
                
              <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 1, delay: index * 0.1, ease: "easeOut" }}
                  className={`h-full rounded-full ${
                    index === 0 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                    index === 1 ? 'bg-gradient-to-r from-slate-400 to-slate-500' :
                    index === 2 ? 'bg-gradient-to-r from-orange-400 to-orange-500' :
                    'bg-slate-200'
                  }`}
                />
                </div>
              </div>
            );
          })}
        </div>
    </motion.div>
  );
};

const SalesTrendChart = ({ data, title, period, settings, onRangeChange }) => {
  const dataset = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const safeData = data.filter(Boolean).map(item => ({ ...item }));
    safeData.sort((a, b) => {
      const dateA = parsePeriodValueToDate(a?.period);
      const dateB = parsePeriodValueToDate(b?.period);
      if (dateA && dateB) return dateA.getTime() - dateB.getTime();
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
    if (!settings) return base;
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
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [isMobileView, setIsMobileView] = useState(false);

  const startIndex = Math.max(0, Math.min(windowStart, maxStart));
  const endIndex = Math.min(startIndex + windowSize, dataset.length);
  const chartData = dataset.slice(startIndex, endIndex);

  const isEmptyDataset = dataset.length === 0;

  const sliceRevenue = chartData.map(d => d.revenue || 0);
  const sliceProfit = chartData.map(d => d.profit || 0);
  const sliceOrders = chartData.map(d => d.orders || 0);
  const maxRevenue = Math.max(0, ...sliceRevenue);
  const maxProfit = Math.max(0, ...sliceProfit);
  const maxOrders = Math.max(0, ...sliceOrders);
  
  const maxLeftAxis = Math.max(maxRevenue, maxProfit);
  const safeMaxLeftAxis = maxLeftAxis > 0 ? maxLeftAxis : 1;
  const safeMaxOrders = maxOrders > 0 ? maxOrders : 1;

  const isAllZero = maxRevenue === 0 && maxProfit === 0 && maxOrders === 0;
  const showEmptyDayState = period === 'day' && isAllZero;

  const hasMetrics = (item) => {
    if (!item) return false;
    return (Number(item.revenue) || 0) !== 0 || (Number(item.profit) || 0) !== 0 || (Number(item.orders) || 0) !== 0;
  };

  const plottedData = useMemo(() => {
    if (showEmptyDayState) return [];
    if (period === 'day') return chartData.filter(hasMetrics);
    return chartData;
  }, [chartData, period, showEmptyDayState]);

  // useEffect hooks - 必须在所有数据计算之后
  useEffect(() => {
    const periodChanged = previousPeriodRef.current !== period;
    const prevMaxStart = previousMaxStartRef.current;
    previousPeriodRef.current = period;
    previousMaxStartRef.current = maxStart;

    setWindowStart(prev => {
      if (periodChanged) {
        setIsFirstLoad(false); // 切换时间段后不再是首次加载
        return maxStart;
      }
      if (prev > maxStart) return maxStart;
      if (maxStart > prevMaxStart && prev === prevMaxStart) return maxStart;
      return prev;
    });
  }, [maxStart, period]);

  // 首次加载完成后设置为false
  useEffect(() => {
    if (isFirstLoad && plottedData.length > 0) {
      const timer = setTimeout(() => setIsFirstLoad(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [plottedData, isFirstLoad]);
  
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        setIsMobileView(window.matchMedia('(max-width: 768px)').matches);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const svgWidth = 800;
  const svgHeight = 360;
  const leftPadding = 50;
  const rightPadding = 40;
  const topPadding = 20;
  const bottomPadding = isMobileView ? 45 : (period === 'day' ? 70 : 85);
  const chartWidth = svgWidth - leftPadding - rightPadding;
  const chartHeight = svgHeight - topPadding - bottomPadding;
  const revenueClipId = useMemo(() => `revenueClip-${Math.random().toString(36).slice(2)}`, []);
  const profitClipId = useMemo(() => `profitClip-${Math.random().toString(36).slice(2)}`, []);
  const ordersClipId = useMemo(() => `ordersClip-${Math.random().toString(36).slice(2)}`, []);
  
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

  const createSmoothPath = (points) => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = [`M ${points[0].x} ${points[0].y}`];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      const tension = 0.25;
      let cp1x = prev.x + (curr.x - prev.x) * tension;
      let cp1y = prev.y;
      let cp2x = curr.x - (next ? (next.x - prev.x) * tension : (curr.x - prev.x) * tension);
      let cp2y = curr.y;
      if (i === 1) d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`);
      else d.push(`S ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`);
    }
    return d.join(' ');
  };
  
  const revenuePath = createSmoothPath(revenuePoints);
  const profitPath = createSmoothPath(profitPoints);
  const ordersPath = createSmoothPath(ordersPoints);
  const rangeRef = useRef({ start: null, end: null });
  
  const hasPrev = startIndex > 0;
  const hasNext = endIndex < dataset.length;

  const handlePrev = () => hasPrev && setWindowStart(prev => Math.max(prev - step, 0));
  const handleNext = () => hasNext && setWindowStart(prev => Math.min(prev + step, maxStart));

  const formatAxisLabel = (dataPoint) => {
    if (!dataPoint) return '';
    const parsedDate = parsePeriodValueToDate(dataPoint.period);
    if (period === 'day') return parsedDate && hasMetrics(dataPoint) ? `${parsedDate.getHours()}时` : '';
    if (!parsedDate) return dataPoint.period || '';
    if (period === 'month') return parsedDate.getDate();
    return `${parsedDate.getMonth() + 1}/${parsedDate.getDate()}`;
  };

  // 智能标签位置计算 - 根据图表中的实际Y坐标高度决定标签位置
  const getSmartLabelPosition = (point, index, type) => {
    const labelOffset = 18;
    
    if (type === 'profit') {
      // 净利润标签始终在线下方
      return point.y + labelOffset;
    } 
    
    // 获取当前点的销售额和订单数的Y坐标
    const revenueY = revenuePoints[index]?.y;
    const ordersY = ordersPoints[index]?.y;
    
    if (type === 'revenue') {
      // 销售额：比较图表中的视觉高度（Y坐标越小表示位置越高）
      if (revenueY !== undefined && ordersY !== undefined) {
        if (revenueY < ordersY) {
          // 销售额在图表中位置更高，标签在上方
          return point.y - labelOffset;
        } else if (revenueY === ordersY) {
          // 高度相同时，销售额标签在下方（订单数优先上方）
          return point.y + labelOffset;
        } else {
          // 销售额在图表中位置更低，标签在下方
          return point.y + labelOffset;
        }
      }
      return point.y - labelOffset;
    } else if (type === 'orders') {
      // 订单数：与销售额相反
      if (revenueY !== undefined && ordersY !== undefined) {
        if (ordersY < revenueY) {
          // 订单数在图表中位置更高，标签在上方
          return point.y - labelOffset;
        } else if (ordersY === revenueY) {
          // 高度相同时，订单数标签在上方（订单数优先）
          return point.y - labelOffset;
        } else {
          // 订单数在图表中位置更低，标签在下方
          return point.y + labelOffset;
        }
      }
      return point.y + labelOffset;
    }
    
    return point.y;
  };

  useEffect(() => {
    if (!onRangeChange) return;
    const startPeriod = plottedData[0]?.period || null;
    const endPeriod = plottedData[plottedData.length - 1]?.period || null;
    if (rangeRef.current.start === startPeriod && rangeRef.current.end === endPeriod) return;
    rangeRef.current = { start: startPeriod, end: endPeriod };
    onRangeChange({ start: startPeriod, end: endPeriod });
  }, [plottedData, onRangeChange]);
  
  const windowTotals = useMemo(() => {
    const totals = chartData.reduce(
      (acc, item) => {
        acc.revenue += Number(item?.revenue) || 0;
        acc.profit += Number(item?.profit) || 0;
        acc.orders += Number(item?.orders) || 0;
        return acc;
      },
      { revenue: 0, profit: 0, orders: 0 }
    );

    return {
      revenue: formatNumber(totals.revenue),
      profit: formatNumber(totals.profit),
      orders: formatNumber(totals.orders, 0)
    };
  }, [chartData]);
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 h-auto md:h-[450px]"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 flex-shrink-0">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span className="w-1 h-5 bg-indigo-500 rounded-full"></span>
            {title}
          </h3>
          
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-4 text-sm text-slate-500 mr-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              <span>销售额：</span>
              <span className="text-slate-800 font-semibold">¥{windowTotals.revenue}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>净利润：</span>
              <span className="text-slate-800 font-semibold">¥{windowTotals.profit}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>订单数：</span>
              <span className="text-slate-800 font-semibold">{windowTotals.orders}</span>
            </div>
          </div>
          
          <div className="flex bg-slate-100 rounded-lg p-1">
            <button
              onClick={handlePrev}
              disabled={!hasPrev}
              className="p-1.5 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-white hover:shadow-sm disabled:opacity-30 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleNext}
              disabled={!hasNext}
              className="p-1.5 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-white hover:shadow-sm disabled:opacity-30 transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
              </div>
            </div>
            
      <div className="relative w-full min-h-[320px] md:min-h-0 flex-1">
              {isEmptyDataset ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <Activity size={32} className="mb-2 opacity-50" />
            <p className="text-sm">暂无数据</p>
                </div>
              ) : showEmptyDayState ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <Activity size={32} className="mb-2 opacity-50" />
            <p className="text-sm">该日暂无数据</p>
                </div>
              ) : (
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full overflow-visible select-none" preserveAspectRatio="xMidYMid meet">
                <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                  </linearGradient>
              <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
                  </linearGradient>
              <filter id="lineShadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.1" />
                  </filter>
                </defs>
                
            {/* Grid & Axis */}
                {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
              <g key={ratio}>
                  <line
                    x1={leftPadding}
                    y1={topPadding + chartHeight * ratio}
                  x2={svgWidth - rightPadding}
                    y2={topPadding + chartHeight * ratio}
                  stroke="#f1f5f9"
                    strokeWidth="1"
                  />
                  <text
                    x={leftPadding - 10}
                    y={topPadding + chartHeight * ratio + 4}
                    textAnchor="end"
                  className="text-[10px] fill-slate-400 font-medium"
                  >
                    {Math.round(maxLeftAxis * (1 - ratio))}
                  </text>
                  <text
                  x={svgWidth - rightPadding + 10}
                    y={topPadding + chartHeight * ratio + 4}
                    textAnchor="start"
                  className="text-[10px] fill-emerald-500 font-medium opacity-60"
                  >
                    {Math.round(maxOrders * (1 - ratio))}
                  </text>
              </g>
                ))}
                
            {/* Areas - 使用 clipPath 配合线条动画 */}
            <defs>
              <clipPath id={revenueClipId}>
                <motion.rect
                  x={leftPadding}
                  y={0}
                  height={svgHeight}
                  animate={{ width: chartWidth }}
                  initial={{ width: isFirstLoad ? 0 : chartWidth }}
                  transition={{ duration: isFirstLoad ? 1.5 : 0.6, ease: "easeInOut" }}
                />
              </clipPath>
              <clipPath id={profitClipId}>
                <motion.rect
                  x={leftPadding}
                  y={0}
                  height={svgHeight}
                  animate={{ width: chartWidth }}
                  initial={{ width: isFirstLoad ? 0 : chartWidth }}
                  transition={{ duration: isFirstLoad ? 1.5 : 0.6, ease: "easeInOut" }}
                />
              </clipPath>
              <clipPath id={ordersClipId}>
                <motion.rect
                  x={leftPadding}
                  y={0}
                  height={svgHeight}
                  animate={{ width: chartWidth }}
                  initial={{ width: isFirstLoad ? 0 : chartWidth }}
                  transition={{ duration: isFirstLoad ? 1.5 : 0.6, ease: "easeInOut" }}
                />
              </clipPath>
            </defs>
            
                {revenuePoints.length > 1 && (
              <motion.path
                    d={`${revenuePath} L ${revenuePoints[revenuePoints.length - 1].x} ${topPadding + chartHeight} L ${revenuePoints[0].x} ${topPadding + chartHeight} Z`}
                animate={{ 
                  d: `${revenuePath} L ${revenuePoints[revenuePoints.length - 1].x} ${topPadding + chartHeight} L ${revenuePoints[0].x} ${topPadding + chartHeight} Z`,
                  opacity: 1
                }}
                initial={{ 
                  d: `${revenuePath} L ${revenuePoints[revenuePoints.length - 1].x} ${topPadding + chartHeight} L ${revenuePoints[0].x} ${topPadding + chartHeight} Z`,
                  opacity: isFirstLoad ? 0 : 1
                }}
                transition={{ 
                  d: { duration: isFirstLoad ? 0 : 0.6, ease: "easeInOut" },
                  opacity: { duration: 0.3 }
                }}
                fill="url(#revenueGradient)"
                clipPath={`url(#${revenueClipId})`}
              />
            )}
                {profitPoints.length > 1 && (
              <motion.path
                    d={`${profitPath} L ${profitPoints[profitPoints.length - 1].x} ${topPadding + chartHeight} L ${profitPoints[0].x} ${topPadding + chartHeight} Z`}
                animate={{ 
                  d: `${profitPath} L ${profitPoints[profitPoints.length - 1].x} ${topPadding + chartHeight} L ${profitPoints[0].x} ${topPadding + chartHeight} Z`,
                  opacity: 1
                }}
                initial={{ 
                  d: `${profitPath} L ${profitPoints[profitPoints.length - 1].x} ${topPadding + chartHeight} L ${profitPoints[0].x} ${topPadding + chartHeight} Z`,
                  opacity: isFirstLoad ? 0 : 1
                }}
                transition={{ 
                  d: { duration: isFirstLoad ? 0 : 0.6, ease: "easeInOut" },
                  opacity: { duration: 0.3 }
                }}
                fill="url(#profitGradient)"
                clipPath={`url(#${profitClipId})`}
              />
            )}

            {/* Lines */}
            {ordersPath && (
              <motion.path
                d={ordersPath}
                animate={{ 
                  d: ordersPath,
                  opacity: 1
                }}
                initial={{ 
                  d: ordersPath,
                  opacity: isFirstLoad ? 0 : 1
                }}
                transition={{ 
                  d: { duration: isFirstLoad ? 0 : 0.6, ease: "easeInOut" },
                  opacity: { duration: 0.3 }
                }}
                fill="none"
                stroke="#34d399"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6 4"
                clipPath={`url(#${ordersClipId})`}
                filter="url(#lineShadow)"
              />
            )}
            {profitPath && (
              <motion.path
                    d={profitPath}
                animate={{ 
                  d: profitPath,
                  pathLength: 1,
                  opacity: 1
                }}
                initial={{ 
                  d: profitPath,
                  pathLength: isFirstLoad ? 0 : 1,
                  opacity: isFirstLoad ? 0 : 1
                }}
                transition={{ 
                  d: { duration: isFirstLoad ? 0 : 0.6, ease: "easeInOut" },
                  pathLength: { duration: isFirstLoad ? 1.5 : 0, ease: "easeInOut" },
                  opacity: { duration: 0.3 }
                }}
                    fill="none"
                stroke="#fbbf24"
                strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                filter="url(#lineShadow)"
              />
            )}
            {revenuePath && (
              <motion.path
                d={revenuePath}
                animate={{ 
                  d: revenuePath,
                  pathLength: 1,
                  opacity: 1
                }}
                initial={{ 
                  d: revenuePath,
                  pathLength: isFirstLoad ? 0 : 1,
                  opacity: isFirstLoad ? 0 : 1
                }}
                transition={{ 
                  d: { duration: isFirstLoad ? 0 : 0.6, ease: "easeInOut" },
                  pathLength: { duration: isFirstLoad ? 1.5 : 0, ease: "easeInOut" },
                  opacity: { duration: 0.3 }
                }}
                    fill="none"
                stroke="#6366f1"
                strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                filter="url(#lineShadow)"
              />
            )}

            {/* X Axis Labels */}
            {plottedData.map((item, index) => {
              if (index % Math.ceil(plottedData.length / 8) !== 0) return null;
              const x = plottedData.length === 1
                ? leftPadding + chartWidth / 2
                : leftPadding + (index / (plottedData.length - 1)) * chartWidth;
              
              // 防止 NaN
              if (!Number.isFinite(x)) return null;
              
              return (
                <text
                  key={index}
                  x={x}
                  y={svgHeight - 30}
                  textAnchor="middle"
                  className="text-[10px] fill-slate-400 font-medium"
                >
                  {formatAxisLabel(item)}
                </text>
              );
            })}
            
            {/* 日期/月份/年份标签 */}
            {(() => {
              if (plottedData.length === 0) return null;
              
              // 收集所有数据点的日期信息
              const dateGroups = new Map();
              plottedData.forEach((item, index) => {
                const parsedDate = parsePeriodValueToDate(item.period);
                if (!parsedDate) return;
                
                let groupKey;
                if (period === 'day') {
                  // 日报：按日期分组，避免分钟始终为00的无用标签
                  groupKey = `${parsedDate.getFullYear()}-${parsedDate.getMonth()}-${parsedDate.getDate()}`;
                } else if (period === 'week') {
                  // 周报：按月份分组
                  groupKey = `${parsedDate.getFullYear()}-${parsedDate.getMonth()}`;
                } else {
                  // 月报：按年份分组
                  groupKey = `${parsedDate.getFullYear()}`;
                }
                
                if (!dateGroups.has(groupKey)) {
                  dateGroups.set(groupKey, {
                    indices: [],
                    date: parsedDate
                  });
                }
                dateGroups.get(groupKey).indices.push(index);
              });
              
              // 渲染标签
              return Array.from(dateGroups.entries()).map(([key, { indices, date }]) => {
                const positions = indices.map(idx => {
                  const length = plottedData.length;
                  return length === 1
                    ? leftPadding + chartWidth / 2
                    : leftPadding + (idx / (length - 1)) * chartWidth;
                });
                const avgX = positions.reduce((sum, x) => sum + x, 0) / positions.length;
                
                // 防止 NaN 值
                if (!Number.isFinite(avgX)) return null;
                
                let label;
                if (period === 'day') {
                  label = `${date.getMonth() + 1}/${date.getDate()}`;
                } else if (period === 'week') {
                  label = date.getFullYear();
                } else {
                  label = date.getFullYear();
                }
                
                return (
                  <text
                    key={`period-${key}`}
                    x={avgX}
                    y={svgHeight - 2}
                    textAnchor="middle"
                    className="text-[11px] fill-slate-500 font-semibold"
                  >
                    {label}
                  </text>
                );
              });
            })()}
                
            {/* Data Labels - 根据period决定显示哪些标签 */}
            {period !== 'month' && revenuePoints.map((point, index) => {
                  const source = plottedData[index];
              if (!source || (Number(source.revenue) || 0) === 0) return null;
              if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
              const labelY = getSmartLabelPosition(point, index, 'revenue');
              if (!Number.isFinite(labelY)) return null;
                  
                  return (
                <motion.text
                  key={`revenue-label-${index}`}
                  animate={{ x: point.x, y: labelY, opacity: 1 }}
                  initial={{ x: point.x, y: labelY, opacity: 0 }}
                  transition={{ 
                    duration: isFirstLoad ? 0.3 : 0.6, 
                    delay: isFirstLoad ? 1.0 + index * 0.05 : 0,
                    ease: "easeInOut" 
                  }}
                        textAnchor="middle"
                  className="text-[11px] font-semibold fill-indigo-600 pointer-events-none"
                  style={{ textShadow: '0 1px 3px rgba(255,255,255,0.9)' }}
                      >
                  ¥{formatNumber(point.value, 0)}
                </motion.text>
                  );
                })}
                
            {period !== 'month' && profitPoints.map((point, index) => {
                  const source = plottedData[index];
              if (!source || (Number(source.profit) || 0) === 0) return null;
              if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
              const labelY = getSmartLabelPosition(point, index, 'profit');
              if (!Number.isFinite(labelY)) return null;
                  
                  return (
                <motion.text
                  key={`profit-label-${index}`}
                  animate={{ x: point.x, y: labelY, opacity: 1 }}
                  initial={{ x: point.x, y: labelY, opacity: 0 }}
                  transition={{ 
                    duration: isFirstLoad ? 0.3 : 0.6, 
                    delay: isFirstLoad ? 1.0 + index * 0.05 : 0,
                    ease: "easeInOut" 
                  }}
                        textAnchor="middle"
                  className="text-[11px] font-semibold fill-amber-600 pointer-events-none"
                  style={{ textShadow: '0 1px 3px rgba(255,255,255,0.9)' }}
                      >
                  ¥{formatNumber(point.value, 0)}
                </motion.text>
                  );
                })}
                
            {/* 订单数标签 - 所有period都显示 */}
            {ordersPoints.map((point, index) => {
              const source = plottedData[index];
              if (!source || (Number(source.orders) || 0) === 0) return null;
              if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
              const labelY = period === 'month' 
                ? point.y - 18  // 月报时订单数标签固定在上方
                : getSmartLabelPosition(point, index, 'orders');
              if (!Number.isFinite(labelY)) return null;

                  return (
                <motion.text
                  key={`orders-label-${index}`}
                  animate={{ x: point.x, y: labelY, opacity: 1 }}
                  initial={{ x: point.x, y: labelY, opacity: 0 }}
                  transition={{ 
                    duration: isFirstLoad ? 0.3 : 0.6, 
                    delay: isFirstLoad ? 1.0 + index * 0.05 : 0,
                    ease: "easeInOut" 
                  }}
                        textAnchor="middle"
                  className="text-[11px] font-semibold fill-emerald-600 pointer-events-none"
                  style={{ textShadow: '0 1px 3px rgba(255,255,255,0.9)' }}
                      >
                  {point.value}
                </motion.text>
                  );
                })}

            {/* Interactive Dots */}
            {period !== 'month' && revenuePoints.map((p, i) => {
              if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
              return (
                <circle 
                  key={`dot-revenue-${i}`} 
                  cx={p.x} 
                  cy={p.y} 
                  r="3" 
                  fill="white" 
                  stroke="#6366f1" 
                  strokeWidth="2" 
                  className="opacity-0 hover:opacity-100 transition-opacity cursor-pointer" 
                />
              );
            })}
            {period !== 'month' && profitPoints.map((p, i) => {
              if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
              return (
                <circle 
                  key={`dot-profit-${i}`} 
                  cx={p.x} 
                  cy={p.y} 
                  r="3" 
                  fill="white" 
                  stroke="#fbbf24" 
                  strokeWidth="2" 
                  className="opacity-0 hover:opacity-100 transition-opacity cursor-pointer" 
                />
              );
            })}
            {ordersPoints.map((p, i) => {
              if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
              return (
                <circle 
                  key={`dot-orders-${i}`} 
                  cx={p.x} 
                  cy={p.y} 
                  r="3" 
                  fill="white" 
                  stroke="#34d399" 
                  strokeWidth="2" 
                  className="opacity-0 hover:opacity-100 transition-opacity cursor-pointer" 
                />
              );
            })}
                </svg>
              )}
            </div>
    </motion.div>
  );
};

const TimePeriodSelector = ({ period, onChange }) => (
  <div className="flex bg-slate-100 p-1 rounded-xl">
      {['day', 'week', 'month'].map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
        className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all duration-300 ${
            period === p 
            ? 'bg-white text-indigo-600 shadow-sm' 
            : 'text-slate-500 hover:text-slate-700'
          }`}
        >
        {p === 'day' ? '日报' : p === 'week' ? '周报' : '月报'}
        </button>
      ))}
  </div>
);

// --- Main Page Component ---

function StaffDashboardPage({ role = 'admin', navActive = 'staff-dashboard' }) {
  const router = useRouter();
  const { user, isInitialized } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    dashboardStats: { current_period: { data: [] } },
    basicStats: {}
  });
  const dashboardRequestIdRef = useRef(0);
  const [topProducts, setTopProducts] = useState([]);
  const [topProductsLoading, setTopProductsLoading] = useState(false);
  const topProductsRequestIdRef = useRef(0);
  const [trendRange, setTrendRange] = useState(null);
  const [timePeriod, setTimePeriod] = useState('week');
  const [customersData, setCustomersData] = useState({ customers: [], total: 0, currentPage: 0, hasMore: false });
  const [customersLoading, setCustomersLoading] = useState(false);

  const expectedRole = role === 'agent' ? 'agent' : 'admin';
  const isAdmin = expectedRole === 'admin';
  const staffPrefix = isAdmin ? '/admin' : '/agent';

  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.type !== expectedRole) {
      const fallback = user.type === 'admin' ? '/admin/dashboard' : user.type === 'agent' ? '/agent/dashboard' : '/';
      router.replace(fallback);
      return;
    }
    loadDashboardData();
    loadCustomersData(0);
  }, [isInitialized, user, expectedRole]);

  useEffect(() => {
    if (!user || user.type !== expectedRole) return;
    loadDashboardData();
  }, [timePeriod, user, expectedRole]);

  const loadDashboardData = async () => {
    const requestId = dashboardRequestIdRef.current + 1;
    dashboardRequestIdRef.current = requestId;
    setLoading(true);
    try {
      const [dashboardRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}${staffPrefix}/dashboard-stats?period=${timePeriod}`, { credentials: 'include' }),
        fetch(`${API_BASE}/admin/stats`, { credentials: 'include' })
      ]);
      const [dashboardJson, statsJson] = await Promise.all([dashboardRes.json(), statsRes.json()]);
      if (dashboardRequestIdRef.current !== requestId) return;
      
      setDashboardData({
        dashboardStats: dashboardJson.data || {},
        basicStats: statsJson.data || {}
      });
      setTopProducts(dashboardJson.data?.top_products || []);
    } catch (error) {
      console.error('Dashboard data error:', error);
    } finally {
      if (dashboardRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  };

  const loadCustomersData = async (page = 0) => {
    setCustomersLoading(true);
    try {
      const offset = page * 5;
      const res = await fetch(`${API_BASE}/admin/customers?limit=5&offset=${offset}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setCustomersData({
          customers: json.data?.customers || [],
          total: json.data?.total || 0,
          currentPage: page,
          hasMore: json.data?.has_more || false
        });
      }
  } catch (error) {
    console.error('Customer data error:', error);
  } finally {
    setCustomersLoading(false);
  }
  };

  const { dashboardStats, basicStats } = dashboardData;
  const pageTitle = isAdmin ? `管理仪表盘 - ${SHOP_NAME}` : `代理仪表盘 - ${SHOP_NAME}`;

  // Helper for growth
  const getChangeType = (value) => {
    if (!value) return 'same';
    return value > 0 ? 'up' : value < 0 ? 'down' : 'same';
  };
  
  const formatChange = (val) => val != null ? Math.round(val * 100) / 100 : null;
  const periodLabel = timePeriod === 'day' ? '今日' : timePeriod === 'week' ? '本周' : '本月';
  
  const buildTopRangeForPeriod = useCallback((range) => {
    if (!range?.start || !range?.end) return null;
    const startDate = parsePeriodValueToDate(range.start);
    const endDate = parsePeriodValueToDate(range.end);
    if (!startDate || !endDate) return null;

    const dayStart = new Date(startDate);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(timePeriod === 'day' ? startDate : endDate);
    dayEnd.setHours(23, 59, 59, 999);

    const startStr = formatDateTimeLocal(dayStart);
    const endStr = formatDateTimeLocal(dayEnd);
    if (!startStr || !endStr) return null;

    return { start: startStr, end: endStr };
  }, [timePeriod]);

  const handleTrendRangeChange = useCallback((range) => {
    const normalizedRange = buildTopRangeForPeriod(range);
    if (!normalizedRange) return;
    setTrendRange(normalizedRange);
  }, [buildTopRangeForPeriod]);

  const loadTopProductsForRange = async (range) => {
    const requestId = topProductsRequestIdRef.current + 1;
    topProductsRequestIdRef.current = requestId;
    if (!range?.start || !range?.end) {
      setTopProducts(dashboardData.dashboardStats?.top_products || []);
      return;
    }
    setTopProductsLoading(true);
    try {
      const params = new URLSearchParams({
        period: timePeriod,
        range_start: range.start,
        range_end: range.end
      });
      const res = await fetch(`${API_BASE}${staffPrefix}/dashboard-stats?${params.toString()}`, { credentials: 'include' });
      const json = await res.json();
      if (topProductsRequestIdRef.current !== requestId) return;
      setTopProducts(json.data?.top_products || []);
    } catch (error) {
      console.error('Top products load error:', error);
    } finally {
      if (topProductsRequestIdRef.current === requestId) {
        setTopProductsLoading(false);
      }
    }
  };

  useEffect(() => {
    // 切换时间段时重置趋势范围
    setTrendRange(null);
    setTopProductsLoading(false);
  }, [timePeriod]);

  useEffect(() => {
    // 只在有效范围时加载窗口数据
    if (trendRange?.start && trendRange?.end) {
      loadTopProductsForRange(trendRange);
    }
  }, [trendRange]);

  const trendData = useMemo(() => {
    if (dashboardStats?.period && dashboardStats.period !== timePeriod) return [];
    return dashboardStats.chart_data || dashboardStats.current_period?.data || [];
  }, [dashboardStats, timePeriod]);

  if (!user || user.type !== expectedRole) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-500 font-medium">正在加载数据...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>

      <Nav active={navActive} />

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-slate-50/50 pt-20 pb-20"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
             <div>
               <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">
                 {isAdmin ? '运营概览' : '代理概览'}
            </h1>
               <p className="text-slate-500">
                 {isAdmin ? '欢迎回来，这里是您今天的业务概况。' : '欢迎回来，查看您的区域销售表现。'}
               </p>
             </div>
             <TimePeriodSelector period={timePeriod} onChange={setTimePeriod} />
          </div>

          {/* Stat Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-10">
            <StatCard
              title="总订单数"
              value={dashboardStats.total_orders || 0}
              change={formatChange(dashboardStats.comparison?.orders_growth)}
              changeType={getChangeType(dashboardStats.comparison?.orders_growth)}
              subtitle={`${dashboardStats.period_name || '本期'}新增: ${dashboardStats.current_period?.orders || 0}`}
              icon={ShoppingCart}
              colorClass={{ bg: 'bg-blue-500', text: 'text-blue-500' }}
            />
            <StatCard
              title="总销售额"
              value={`¥${formatNumber(dashboardStats.total_revenue || 0)}`}
              change={formatChange(dashboardStats.comparison?.revenue_growth)}
              changeType={getChangeType(dashboardStats.comparison?.revenue_growth)}
              subtitle={`${dashboardStats.period_name || '本期'}收入: ¥${formatNumber(dashboardStats.current_period?.revenue || 0)}`}
              icon={DollarSign}
              colorClass={{ bg: 'bg-indigo-500', text: 'text-indigo-500' }}
            />
            <StatCard
              title="净利润"
              value={`¥${formatNumber(dashboardStats.profit_stats?.total_profit || 0)}`}
              change={formatChange(dashboardStats.comparison?.profit_growth)}
              changeType={getChangeType(dashboardStats.comparison?.profit_growth)}
              subtitle={`${timePeriod === 'day' ? '今日' : timePeriod === 'week' ? '本周' : '本月'}盈利: ¥${formatNumber(dashboardStats.profit_stats?.current_period_profit || 0)}`}
              icon={TrendingUp}
              colorClass={{ bg: 'bg-amber-500', text: 'text-amber-500' }}
            />
            <StatCard
              title="商品总数"
              value={basicStats.total_products || 0}
              subtitle={`分类: ${basicStats.categories || 0}`}
              icon={Package}
              colorClass={{ bg: 'bg-purple-500', text: 'text-purple-500' }}
            />
            <StatCard
              title="消费用户"
              value={dashboardStats.users?.total || 0}
              change={formatChange(dashboardStats.users?.growth)}
              changeType={getChangeType(dashboardStats.users?.growth)}
              subtitle={`${periodLabel}用户: ${dashboardStats.users?.current_period_new ?? dashboardStats.users?.new_this_week ?? 0}`}
              icon={Users}
              colorClass={{ bg: 'bg-emerald-500', text: 'text-emerald-500' }}
            />
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10 items-start">
            <div className="lg:col-span-2">
            <SalesTrendChart 
              data={trendData}
                title="销售趋势"
              period={timePeriod}
              settings={dashboardStats.chart_settings}
              onRangeChange={handleTrendRangeChange}
            />
            </div>
            <div>
              <SimpleBarChart 
                data={topProducts} 
                title="热销商品排行" 
                key={`top-${timePeriod}`}
              />
              {topProductsLoading && (
                <div className="mt-3 text-xs text-slate-400 text-right pr-1">正在同步当前窗口排行榜...</div>
              )}
            </div>
          </div>

          {/* Customers Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
             <div className="p-6 border-b border-slate-50 flex items-center justify-between">
               <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-1 h-5 bg-indigo-500 rounded-full"></span>
                  最新客户动态
                </h3>
               <span className="text-sm text-slate-400">共 {customersData.total} 位客户</span>
              </div>

             <div className="p-6">
              {customersLoading ? (
                 <div className="flex justify-center py-12">
                   <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
               ) : customersData.customers && customersData.customers.length > 0 ? (
                  <div className="space-y-4">
                    {customersData.customers.map((customer, index) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        key={customer.id} 
                        className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100"
                      >
                          <div className="flex items-center gap-4">
                           <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                              index === 0 ? 'bg-amber-400' : 
                              index === 1 ? 'bg-slate-400' : 
                              index === 2 ? 'bg-orange-400' : 'bg-indigo-200'
                            }`}>
                              {customersData.currentPage * 5 + index + 1}
                            </div>
                            <div>
                             <div className="font-semibold text-slate-800">{customer.name}</div>
                             <div className="text-xs text-slate-500 mt-0.5">ID: {customer.id}</div>
                            </div>
                          </div>
                          
                        <div className="flex items-center gap-8">
                           <div className="text-right hidden sm:block">
                              <div className="text-sm font-medium text-slate-600">{customer.order_count} 笔订单</div>
                              <div className="text-xs text-slate-400">平均 ¥{formatNumber(customer.avg_order_amount)}</div>
                            </div>
                           <div className="text-right min-w-[100px]">
                              <div className="text-lg font-bold text-indigo-600">¥{formatNumber(customer.total_spent)}</div>
                              <div className="text-xs text-slate-400">总消费</div>
                            </div>
                          </div>
                      </motion.div>
                    ))}
                  </div>
               ) : (
                  <div className="text-center py-16 text-slate-400">
                    <Users size={48} className="mx-auto mb-4 opacity-20" />
                    <p>暂无客户数据</p>
                  </div>
               )}
               
               {/* Pagination */}
                  {customersData.total > 5 && (
                 <div className="flex items-center justify-between mt-8 pt-4 border-t border-slate-50">
                      <button
                        onClick={() => loadCustomersData(customersData.currentPage - 1)}
                        disabled={customersData.currentPage === 0}
                     className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                     <ChevronLeft size={16} />
                        上一页
                      </button>
                   <span className="text-sm text-slate-400">
                     第 {customersData.currentPage + 1} 页 / 共 {Math.ceil(customersData.total / 5)} 页
                   </span>
                      <button
                        onClick={() => loadCustomersData(customersData.currentPage + 1)}
                        disabled={!customersData.hasMore}
                     className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        下一页
                     <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                      </div>
                    </div>

            </div>
      </motion.div>
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
