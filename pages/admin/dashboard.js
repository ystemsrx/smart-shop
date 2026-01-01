import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Head from 'next/head';
import { useAuth } from '../../hooks/useAuth';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import Toast from '../../components/Toast';
import { useToast } from '../../hooks/useToast';
import { getApiBaseUrl, getShopName } from '../../utils/runtimeConfig';
import { motion, AnimatePresence } from 'framer-motion';
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
  Award,
  ChevronDown,
  Check
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
    const dateOnlyMatch = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
    const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    const candidates = normalized.includes(':')
      ? [`${normalized}Z`, normalized, trimmed]
      : [normalized, trimmed, trimmed.replace(/-/g, '/')];
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

/**
 * 解析周期日期字符串为 Date 对象
 * 后端存储的是 UTC 时间，格式为 "YYYY-MM-DD HH:MM:SS"
 * 解析时明确作为 UTC 处理，以便后续正确转换到本地时区
 */
const parseCycleDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // 仅日期格式：作为本地时间的午夜处理
    const dateOnlyMatch = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
    // 包含时间的格式：后端存储的是 UTC，明确解析为 UTC
    const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    // 如果没有时区标识，添加 Z 表示 UTC
    const utcString = normalized.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(normalized)
      ? normalized
      : `${normalized}Z`;
    const parsed = new Date(utcString);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    // 回退尝试
    const fallback = new Date(trimmed);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }
  return null;
};

/**
 * 格式化周期日期为本地时区显示
 * 使用设备本地时区将 Date 对象转换为 YYYY-MM-DD 格式
 */
const formatCycleDate = (value) => {
  const parsed = parseCycleDate(value);
  if (!parsed) return '';
  // 使用本地时区的年月日
  const pad = (v) => String(v).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
};

const buildCycleRangeLabel = (cycle) => {
  if (!cycle) return '';
  const startLabel = formatCycleDate(cycle.start_time);
  const endLabel = cycle.end_time ? formatCycleDate(cycle.end_time) : '至今';
  if (!startLabel && !endLabel) return '';
  return `${startLabel || '未知'} ~ ${endLabel}`;
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
  
  // 渲染销量变化指示器（徽章样式）
  const renderChangeIndicator = (change) => {
    if (change === undefined || change === null) return null;
    
    const absChange = Math.abs(change);
    
    if (change > 0) {
      return (
        <div 
          className="inline-flex items-center justify-center gap-0.5 min-w-[42px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200" 
          title={`比上期增加 ${absChange}`}
        >
          <ArrowUp size={10} strokeWidth={3} />
          <span className="text-xs font-semibold">{absChange}</span>
        </div>
      );
    } else if (change < 0) {
      return (
        <div 
          className="inline-flex items-center justify-center gap-0.5 min-w-[42px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200" 
          title={`比上期减少 ${absChange}`}
        >
          <ArrowDown size={10} strokeWidth={3} />
          <span className="text-xs font-semibold">{absChange}</span>
        </div>
      );
    } else {
      return (
        <div 
          className="inline-flex items-center justify-center gap-0.5 min-w-[42px] px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-slate-200" 
          title="与上期持平"
        >
          <Minus size={10} strokeWidth={3} />
          <span className="text-xs font-semibold">0</span>
        </div>
      );
    }
  };
  
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
            const change = item.change;
            
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
                <div className="flex items-center gap-2 shrink-0 pl-2">
                  {renderChangeIndicator(change)}
                  <div className="text-sm font-bold text-slate-800">
                      {type === 'quantity' ? value : `¥${formatNumber(value)}`}
                  </div>
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
                  // 日报：按日期分组
                  groupKey = `${parsedDate.getFullYear()}-${parsedDate.getMonth()}-${parsedDate.getDate()}`;
                } else if (period === 'week') {
                  // 周报：按年份分组
                  groupKey = `${parsedDate.getFullYear()}`;
                } else {
                  // 月报：按年月分组
                  groupKey = `${parsedDate.getFullYear()}-${parsedDate.getMonth()}`;
                }
                
                if (!dateGroups.has(groupKey)) {
                  dateGroups.set(groupKey, {
                    indices: [],
                    date: parsedDate
                  });
                }
                dateGroups.get(groupKey).indices.push(index);
              });
              
              // 周报：只有跨年时才显示年份标签（多个年份分组）
              // 月报：只有跨月时才显示年月标签（多个年月分组）
              // 日报：始终显示
              const shouldShowLabels = period === 'day' || dateGroups.size > 1;
              
              if (!shouldShowLabels) {
                // 如果只有一个分组，在中间显示单个标签
                const singleGroup = Array.from(dateGroups.values())[0];
                if (!singleGroup) return null;
                
                const centerX = leftPadding + chartWidth / 2;
                let label;
                if (period === 'week') {
                  label = singleGroup.date.getFullYear();
                } else if (period === 'month') {
                  label = `${singleGroup.date.getFullYear()}.${String(singleGroup.date.getMonth() + 1).padStart(2, '0')}`;
                }
                
                return (
                  <text
                    key="period-single"
                    x={centerX}
                    y={svgHeight - 2}
                    textAnchor="middle"
                    className="text-[11px] fill-slate-500 font-semibold"
                  >
                    {label}
                  </text>
                );
              }
              
              // 渲染多个分组标签
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
                  // 月报：yyyy.mm 格式
                  label = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
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

const CycleSelector = ({ cycles = [], selectedId, onChange, disabled, selectedCycle, cycleMode, onCycleModeChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  
  const total = cycles.length;
  const selectedIndex = useMemo(() => {
    const idx = cycles.findIndex((cycle) => cycle.id === selectedId);
    return idx >= 0 ? idx : 0;
  }, [cycles, selectedId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStep = (direction) => {
    if (!cycles.length || !cycleMode) return;
    const nextIndex = Math.max(0, Math.min(total - 1, selectedIndex + direction));
    const cycle = cycles[nextIndex];
    if (cycle) {
      onChange?.(cycle.id);
      // 确保切换周期时开启周期模式
      if (!cycleMode) onCycleModeChange?.(true);
    }
  };

  const handleSelectAll = () => {
    onCycleModeChange?.(false);
    setIsOpen(false);
  };

  const handleSelectCycle = (cycleId) => {
    onChange?.(cycleId);
    onCycleModeChange?.(true);
    setIsOpen(false);
  };

  if (!cycles.length) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Calendar size={14} className="opacity-50" />
        <span>暂无周期</span>
      </div>
    );
  }

  const currentLabel = !cycleMode 
    ? '全部周期'
    : selectedCycle 
      ? `第${selectedCycle.sequence || selectedIndex + 1}周期`
      : `第${selectedIndex + 1}周期`;

  const showStepButtons = cycleMode && total > 1;

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-0.5">
        {showStepButtons && (
          <button
            type="button"
            onClick={() => handleStep(-1)}
            disabled={disabled || selectedIndex <= 0}
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={14} />
          </button>
        )}
        
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed ${
            cycleMode 
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' 
              : 'bg-blue-50 hover:bg-blue-100 text-blue-700'
          }`}
        >
          <span>{currentLabel}</span>
          <ChevronDown size={12} className={`opacity-50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {showStepButtons && (
          <button
            type="button"
            onClick={() => handleStep(1)}
            disabled={disabled || selectedIndex >= total - 1}
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-40"
          >
            <div className="max-h-72 overflow-y-auto py-1 custom-scrollbar">
              {/* 全部选项 */}
              <button
                onClick={handleSelectAll}
                className={`w-full px-3 py-2.5 text-left text-sm flex items-center justify-between transition-colors border-b border-slate-100 ${
                  !cycleMode 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span className="font-medium">全部周期</span>
                </div>
                {!cycleMode && <Check size={14} className="text-blue-500" />}
              </button>
              
              {/* 周期列表 */}
              {cycles.map((cycle, index) => {
                const isSelected = cycleMode && cycle.id === selectedId;
                const cycleLabel = `第${cycle.sequence || index + 1}周期`;
                const isActive = !cycle.end_time;
                const cycleRange = buildCycleRangeLabel(cycle);
                
                return (
                  <button
                    key={cycle.id}
                    onClick={() => handleSelectCycle(cycle.id)}
                    className={`w-full px-3 py-2 text-left transition-colors ${
                      isSelected 
                        ? 'bg-slate-50' 
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isActive ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                        )}
                        <span className={`text-sm font-medium ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>{cycleLabel}</span>
                      </div>
                      {isSelected && <Check size={14} className="text-slate-500 shrink-0" />}
                    </div>
                    {cycleRange && (
                      <div className="mt-0.5 ml-[14px] text-[10px] text-slate-400 truncate">
                        {cycleRange}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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

const AgentSelector = ({ selectedId, options, onChange, loading }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  // 计算下拉列表位置，确保不出界
  const updateDropdownPosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownWidth = 208; // w-52 = 13rem = 208px
    const dropdownHeight = 340; // 预估最大高度
    const padding = 8;

    // 计算水平位置
    let left = 'auto';
    let right = '0';
    
    // 检查右侧是否会出界
    if (rect.left + dropdownWidth > window.innerWidth - padding) {
      // 尝试右对齐
      right = '0';
      left = 'auto';
    }
    // 检查左侧是否会出界（当右对齐时）
    const rightEdge = rect.right;
    if (rightEdge - dropdownWidth < padding) {
      // 使用固定左侧定位
      left = `${Math.max(padding, rect.left)}px`;
      right = 'auto';
    }

    // 计算垂直位置
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    let top = 'calc(100% + 8px)';
    let bottom = 'auto';
    let transformOrigin = 'top right';

    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      // 在上方显示
      top = 'auto';
      bottom = 'calc(100% + 8px)';
      transformOrigin = 'bottom right';
    }

    setDropdownStyle({ left, right, top, bottom, transformOrigin });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const truncateNameForDropdown = (name) => {
    if (!name) return '';
    return name.length > 6 ? name.substring(0, 5) + '...' : name;
  };

  const isAgentDeleted = (agent) => !!(agent?.isDeleted || agent?.is_deleted);

  const formatAgentLocation = (agent) => {
    const buildings = Array.isArray(agent?.buildings) ? agent.buildings : [];
    const primary = buildings.find((item) => item?.address_name || item?.building_name);
    if (!primary) return '';
    const addressName = (primary.address_name || '').trim();
    const buildingName = (primary.building_name || '').trim();
    if (!addressName && !buildingName) return '';
    const safeAddress = addressName || '未知园区';
    const safeBuilding = buildingName || '未知楼栋';
    return `${safeAddress} · ${safeBuilding}`;
  };

  const selectedAgent = options.find(a => a.id === selectedId);
  const selectedBaseName = selectedAgent?.account || selectedAgent?.name || '代理';
  const selectedIsDeleted = isAgentDeleted(selectedAgent);

  return (
    <div className="relative z-20" ref={containerRef}>
      <motion.button
        ref={buttonRef}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          if (!isOpen) updateDropdownPosition();
          setIsOpen(!isOpen);
        }}
        className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm hover:shadow-md hover:border-indigo-100 transition-colors duration-200 group min-w-[160px]"
      >
        <div className="flex flex-col items-start text-left">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">当前查看</span>
          <span
            className={`text-sm font-bold transition-colors max-w-[120px] truncate ${
              selectedId === 'admin'
                ? 'text-slate-700'
                : selectedIsDeleted
                  ? 'text-slate-400'
                  : 'text-slate-700 group-hover:text-indigo-600'
            }`}
          >
            {selectedId === 'admin' ? (
              '自营'
            ) : (
              <>
                <span className={selectedIsDeleted ? 'line-through' : ''}>{selectedBaseName}</span>
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="w-px h-8 bg-slate-100"></div>
          
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-50 group-hover:bg-indigo-50 transition-colors">
            {loading ? (
              <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <ChevronDown size={14} className={`text-slate-400 group-hover:text-indigo-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            )}
          </div>
        </div>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: dropdownStyle.bottom !== 'auto' ? 10 : -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: dropdownStyle.bottom !== 'auto' ? 10 : -10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25, mass: 0.8 }}
            className="absolute w-52 bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 ring-1 ring-black/5 overflow-hidden z-30"
            style={dropdownStyle}
          >
            <div className="p-2 max-h-[320px] overflow-y-auto custom-scrollbar">
                <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">选择视角</div>
                
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    onChange('admin');
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-3 rounded-xl text-sm font-medium transition-colors duration-150 flex items-center justify-between mb-1 ${
                    selectedId === 'admin' ? 'bg-indigo-50 text-indigo-600 shadow-sm ring-1 ring-indigo-100' : 'text-slate-600 hover:text-slate-900 hover:bg-indigo-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${selectedId === 'admin' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                      <Crown size={14} />
                    </div>
                    <span>自营 (管理员)</span>
                  </div>
                  {selectedId === 'admin' && <Check size={16} className="text-indigo-600" />}
                </motion.button>
                
                {options.length > 0 && <div className="h-px bg-slate-100 my-2 mx-2"></div>}
                
                {options.map((agent) => {
                  const isDeleted = isAgentDeleted(agent);
                  const isInactive = agent?.is_active === false || agent?.is_active === 0;
                  const location = formatAgentLocation(agent);
                  return (
                  <motion.button
                    key={agent.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      onChange(agent.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-3 rounded-xl text-sm font-medium transition-colors duration-150 flex items-center justify-between mb-1 ${
                      selectedId === agent.id ? 'bg-indigo-50 text-indigo-600 shadow-sm ring-1 ring-indigo-100' : 'text-slate-600 hover:text-slate-900 hover:bg-indigo-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${selectedId === agent.id ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                        <Users size={14} />
                      </div>
                      <div className="flex flex-col">
                        <span className={`truncate ${isDeleted ? 'text-slate-400 line-through' : ''}`}>
                          {truncateNameForDropdown(agent.name || agent.account || agent.id)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {location ? `${agent.account || agent.name || '—'} (${location})` : (agent.account || agent.name || '—')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      {isDeleted && <span className="w-2 h-2 rounded-full bg-red-500" />}
                      {!isDeleted && isInactive && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
                      {selectedId === agent.id && <Check size={16} className="text-indigo-600" />}
                    </div>
                  </motion.button>
                )})}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

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
  const dashboardLoadedRef = useRef(false);
  const [selectedAgentId, setSelectedAgentId] = useState('admin');
  const [agentOptions, setAgentOptions] = useState([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const agentRequestIdRef = useRef(0);
  const [topProducts, setTopProducts] = useState([]);
  const [topProductsLoading, setTopProductsLoading] = useState(false);
  const topProductsRequestIdRef = useRef(0);
  const [trendRange, setTrendRange] = useState(null);
  const [timePeriod, setTimePeriod] = useState('week');
  const [customersData, setCustomersData] = useState({ customers: [], total: 0, currentPage: 0, hasMore: false });
  const [customersLoading, setCustomersLoading] = useState(false);
  const customersRequestIdRef = useRef(0);
  const [cycleData, setCycleData] = useState({ cycles: [], active_cycle_id: null, latest_cycle_id: null, locked: false, is_deleted: false });
  const [cycleLoading, setCycleLoading] = useState(false);
  const [cycleActionLoading, setCycleActionLoading] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState(null);
  const [cycleMode, setCycleMode] = useState(true);
  const cycleRequestIdRef = useRef(0);
  const { toast, showToast, hideToast } = useToast();

  const expectedRole = role === 'agent' ? 'agent' : 'admin';
  const isAdmin = expectedRole === 'admin';
  const staffPrefix = isAdmin ? '/admin' : '/agent';
  const selectedAgentParam = useMemo(() => (
    isAdmin && selectedAgentId && selectedAgentId !== 'admin' ? selectedAgentId : null
  ), [isAdmin, selectedAgentId]);

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
  }, [isInitialized, user, expectedRole]);

  const loadAgentOptions = useCallback(async () => {
    if (!isAdmin) return;
    const requestId = agentRequestIdRef.current + 1;
    agentRequestIdRef.current = requestId;
    setAgentLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/agents?include_inactive=true&include_deleted=true`, { credentials: 'include' });
      const json = await res.json();
      if (agentRequestIdRef.current !== requestId) return;
      if (json.success) {
        const agentsList = Array.isArray(json.data?.agents) ? json.data.agents : Array.isArray(json.data) ? json.data : [];
        const deletedList = Array.isArray(json.data?.deleted_agents) ? json.data.deleted_agents : [];
        setAgentOptions([...agentsList, ...deletedList]);
      } else {
        setAgentOptions([]);
      }
    } catch (error) {
      if (agentRequestIdRef.current === requestId) {
        setAgentOptions([]);
      }
      console.error('Agent list load error:', error);
    } finally {
      if (agentRequestIdRef.current === requestId) {
        setAgentLoading(false);
      }
    }
  }, [isAdmin]);

  const applyCyclePayload = useCallback((payload) => {
    const cycles = Array.isArray(payload?.cycles) ? payload.cycles : [];
    setCycleData({
      cycles,
      active_cycle_id: payload?.active_cycle_id || null,
      latest_cycle_id: payload?.latest_cycle_id || null,
      locked: !!payload?.locked,
      is_deleted: !!payload?.is_deleted
    });
    setSelectedCycleId((prev) => {
      if (prev && cycles.some((cycle) => cycle.id === prev)) {
        return prev;
      }
      return payload?.active_cycle_id || payload?.latest_cycle_id || (cycles[cycles.length - 1]?.id ?? null);
    });
  }, []);

  const loadCycleData = useCallback(async () => {
    if (!user || user.type !== expectedRole) return;
    const requestId = cycleRequestIdRef.current + 1;
    cycleRequestIdRef.current = requestId;
    setCycleLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedAgentParam) {
        params.append('agent_id', selectedAgentParam);
      }
      const url = `${API_BASE}${staffPrefix}/sales-cycles${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      const json = await res.json();
      if (cycleRequestIdRef.current !== requestId) return;
      if (json.success) {
        applyCyclePayload(json.data);
      } else {
        setCycleData({ cycles: [], active_cycle_id: null, latest_cycle_id: null, locked: false });
      }
    } catch (error) {
      if (cycleRequestIdRef.current === requestId) {
        setCycleData({ cycles: [], active_cycle_id: null, latest_cycle_id: null, locked: false });
      }
      console.error('Cycle data load error:', error);
    } finally {
      if (cycleRequestIdRef.current === requestId) {
        setCycleLoading(false);
      }
    }
  }, [applyCyclePayload, expectedRole, selectedAgentParam, staffPrefix, user]);

  useEffect(() => {
    if (!isAdmin || !isInitialized || !user) return;
    loadAgentOptions();
  }, [isAdmin, isInitialized, user, loadAgentOptions]);

  useEffect(() => {
    if (!user || user.type !== expectedRole) return;
    loadCycleData();
  }, [expectedRole, loadCycleData, selectedAgentParam, user]);

  useEffect(() => {
    if (!user || user.type !== expectedRole) return;
    loadDashboardData();
  }, [timePeriod, selectedAgentParam, cycleMode, selectedCycleId, user, expectedRole]);

  useEffect(() => {
    if (!user || user.type !== expectedRole) return;
    loadCustomersData(0);
  }, [selectedAgentParam, cycleMode, selectedCycleId, user, expectedRole]);

  const loadDashboardData = async () => {
    const requestId = dashboardRequestIdRef.current + 1;
    dashboardRequestIdRef.current = requestId;
    const shouldBlock = !dashboardLoadedRef.current;
    if (shouldBlock) {
      setLoading(true);
    }
    try {
      const dashboardParams = new URLSearchParams({ period: timePeriod });
      const statsParams = new URLSearchParams();
      if (selectedAgentParam) {
        dashboardParams.append('agent_id', selectedAgentParam);
        statsParams.append('owner_id', selectedAgentParam);
      }
      if (cycleMode && selectedCycleId) {
        dashboardParams.append('cycle_id', selectedCycleId);
      }
      const dashboardUrl = `${API_BASE}${staffPrefix}/dashboard-stats?${dashboardParams.toString()}`;
      const statsUrl = `${API_BASE}/admin/stats${statsParams.toString() ? `?${statsParams.toString()}` : ''}`;
      const [dashboardRes, statsRes] = await Promise.all([
        fetch(dashboardUrl, { credentials: 'include' }),
        fetch(statsUrl, { credentials: 'include' })
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
        if (shouldBlock) {
          setLoading(false);
        }
        dashboardLoadedRef.current = true;
      }
    }
  };

  const loadCustomersData = async (page = 0) => {
    const requestId = customersRequestIdRef.current + 1;
    customersRequestIdRef.current = requestId;
    setCustomersLoading(true);
    if (cycleMode && !selectedCycleId) {
      if (customersRequestIdRef.current === requestId) {
        setCustomersData({ customers: [], total: 0, currentPage: 0, hasMore: false });
        setCustomersLoading(false);
      }
      return;
    }
    try {
      const offset = page * 5;
      const params = new URLSearchParams({
        limit: '5',
        offset: `${offset}`
      });
      if (selectedAgentParam) {
        params.append('agent_id', selectedAgentParam);
      }
      if (cycleMode && selectedCycleId) {
        params.append('cycle_id', selectedCycleId);
        if (selectedCycle?.start_time) {
          params.append('cycle_start', selectedCycle.start_time);
        }
        if (selectedCycle?.end_time) {
          params.append('cycle_end', selectedCycle.end_time);
        }
      }
      const res = await fetch(`${API_BASE}/admin/customers?${params.toString()}`, { credentials: 'include' });
      const json = await res.json();
      if (customersRequestIdRef.current !== requestId) return;
      if (json.success) {
        setCustomersData({
          customers: json.data?.customers || [],
          total: json.data?.total || 0,
          currentPage: page,
          hasMore: json.data?.has_more || false
        });
      } else {
        setCustomersData({ customers: [], total: 0, currentPage: page, hasMore: false });
      }
    } catch (error) {
      if (customersRequestIdRef.current === requestId) {
        setCustomersData({ customers: [], total: 0, currentPage: page, hasMore: false });
      }
      console.error('Customer data error:', error);
    } finally {
      if (customersRequestIdRef.current === requestId) {
        setCustomersLoading(false);
      }
    }
  };

  const handleCycleSelect = useCallback((cycleId) => {
    setSelectedCycleId(cycleId);
    if (!cycleMode && cycleId) {
      setCycleMode(true);
    }
  }, [cycleMode]);

  const executeCycleAction = useCallback(async (action, confirmMessage) => {
    if (cycleActionLoading) return;
    if (confirmMessage && typeof window !== 'undefined') {
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) return;
    }
    setCycleActionLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedAgentParam) {
        params.append('agent_id', selectedAgentParam);
      }
      const url = `${API_BASE}${staffPrefix}/sales-cycles/${action}${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { method: 'POST', credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        applyCyclePayload(json.data);
        if (action === 'start') {
          setCycleMode(true);
          const nextCycleId = json.data?.active_cycle_id || json.data?.latest_cycle_id || null;
          if (nextCycleId) {
            setSelectedCycleId(nextCycleId);
          }
        }
      } else {
        showToast(json.message || '周期操作失败');
      }
    } catch (error) {
      console.error('Cycle action error:', error);
      showToast('周期操作失败');
    } finally {
      setCycleActionLoading(false);
    }
  }, [applyCyclePayload, cycleActionLoading, selectedAgentParam, showToast, staffPrefix]);

  const handleEndCycle = useCallback(() => {
    executeCycleAction('end');
  }, [executeCycleAction]);

  const handleCancelEnd = useCallback(() => {
    executeCycleAction('cancel-end');
  }, [executeCycleAction]);

  const handleStartNewCycle = useCallback(() => {
    executeCycleAction('start', '确认开启新周期？当前周期数据将进入历史周期。');
  }, [executeCycleAction]);

  const { dashboardStats, basicStats } = dashboardData;
  const cycles = Array.isArray(cycleData?.cycles) ? cycleData.cycles : [];
  const selectedCycle = useMemo(() => cycles.find((cycle) => cycle.id === selectedCycleId) || null, [cycles, selectedCycleId]);
  const selectedCycleTitle = selectedCycle
    ? `第${selectedCycle.sequence || cycles.indexOf(selectedCycle) + 1}周期`
    : '未选择周期';
  const selectedCycleRange = selectedCycle ? buildCycleRangeLabel(selectedCycle) : '';
  const selectedCycleStatus = selectedCycle?.end_time ? '已结束' : '进行中';
  const hasActiveCycle = !!cycleData.active_cycle_id;
  const cycleActionDisabled = cycleLoading || cycleActionLoading || cycleData.is_deleted;
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
      if (selectedAgentParam) {
        params.append('agent_id', selectedAgentParam);
      }
      if (cycleMode && selectedCycleId) {
        params.append('cycle_id', selectedCycleId);
      }
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
    // 切换时间段或周期时重置趋势范围
    setTrendRange(null);
    setTopProductsLoading(false);
  }, [timePeriod, selectedAgentParam, cycleMode, selectedCycleId]);

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
        <Toast message={toast.message} show={toast.visible} onClose={hideToast} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Sales Cycle - Compact Design */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 relative z-30"
          >
            {/* 桌面端布局 */}
            <div className="hidden sm:flex items-center gap-4 py-2.5 px-4 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-100/80 shadow-sm overflow-visible">
              {/* 左侧：周期选择器 */}
              <div className="flex items-center gap-2 shrink-0">
                <Calendar size={15} className="text-slate-400" />
                <CycleSelector
                  cycles={cycles}
                  selectedId={selectedCycleId}
                  selectedCycle={selectedCycle}
                  onChange={handleCycleSelect}
                  cycleMode={cycleMode}
                  onCycleModeChange={setCycleMode}
                  disabled={cycleLoading}
                />
                
                {/* 状态标签 */}
                {cycleMode && selectedCycle && (
                  <div className={`flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded ${
                    selectedCycle.end_time 
                      ? 'bg-slate-100 text-slate-500' 
                      : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    {!selectedCycle.end_time && (
                      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                    {selectedCycleStatus}
                  </div>
                )}
                
                {cycleData.is_deleted && (
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600">
                    已删除
                  </span>
                )}
              </div>

              {/* 分隔线 */}
              <div className="w-px h-5 bg-slate-200 shrink-0" />

              {/* 中间：左侧时间 + 右侧数据 */}
              <div className="flex-1 flex items-center justify-between px-3">
                {/* 左侧：日期范围 */}
                <div className="flex items-center">
                  {cycleMode && selectedCycleRange ? (
                    <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
                      <Calendar size={12} className="opacity-50" />
                      <span>{selectedCycleRange}</span>
                    </div>
                  ) : (
                    <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
                      <Calendar size={12} className="opacity-50" />
                      <span>全部时间</span>
                    </div>
                  )}
                </div>
                
                {/* 右侧：统计数据 */}
                <div className="flex items-center gap-4 lg:gap-5 xl:gap-6">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span className="text-xs text-slate-400">订单</span>
                    <span className="text-sm font-bold text-slate-700">{dashboardStats.total_orders || 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                    <span className="text-xs text-slate-400">销售额</span>
                    <span className="text-sm font-bold text-slate-700">¥{formatNumber(dashboardStats.total_revenue || 0)}</span>
                  </div>
                  <div className="hidden md:flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-xs text-slate-400">利润</span>
                    <span className="text-sm font-bold text-emerald-600">¥{formatNumber(dashboardStats.profit_stats?.total_profit || 0)}</span>
                  </div>
                  <div className="hidden lg:flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span className="text-xs text-slate-400">用户</span>
                    <span className="text-sm font-bold text-slate-700">{dashboardStats.users?.total || 0}</span>
                  </div>
                </div>
              </div>

              {/* 分隔线 */}
              <div className="w-px h-5 bg-slate-200 shrink-0" />
                
              {/* 右侧：操作按钮 */}
              <div className="flex items-center gap-2 shrink-0">
                {hasActiveCycle ? (
                  <button
                    type="button"
                    onClick={handleEndCycle}
                    disabled={cycleActionDisabled}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {cycleActionLoading && (
                      <div className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                    )}
                    结束周期
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCancelEnd}
                      disabled={cycleActionDisabled}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      撤销
                    </button>
                    <button
                      type="button"
                      onClick={handleStartNewCycle}
                      disabled={cycleActionDisabled}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {cycleActionLoading && (
                        <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                      )}
                      新周期
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 移动端布局 */}
            <div className="sm:hidden">
              <div className="flex items-center justify-between gap-3 py-2.5 px-3 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-100/80 shadow-sm overflow-visible">
                {/* 周期选择器 */}
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-slate-400" />
                  <CycleSelector
                    cycles={cycles}
                    selectedId={selectedCycleId}
                    selectedCycle={selectedCycle}
                    onChange={handleCycleSelect}
                    cycleMode={cycleMode}
                    onCycleModeChange={setCycleMode}
                    disabled={cycleLoading}
                  />
                  
                  {/* 状态标签 */}
                  {cycleMode && selectedCycle && !selectedCycle.end_time && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1.5">
                  {hasActiveCycle ? (
                    <button
                      type="button"
                      onClick={handleEndCycle}
                      disabled={cycleActionDisabled}
                      className="px-2 py-1 rounded-md text-[11px] font-medium text-rose-600 bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      结束周期
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleCancelEnd}
                        disabled={cycleActionDisabled}
                        className="px-2 py-1 rounded-md text-[11px] font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        撤销
                      </button>
                      <button
                        type="button"
                        onClick={handleStartNewCycle}
                        disabled={cycleActionDisabled}
                        className="px-2 py-1 rounded-md text-[11px] font-medium text-white bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        新周期
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
             <div>
               <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">
                 {isAdmin ? '运营概览' : '代理概览'}
            </h1>
               <p className="text-slate-500">
                 {isAdmin ? '欢迎回来，这里是您最近的业务概况。' : '欢迎回来，查看您的区域销售表现。'}
               </p>
             </div>
             <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
               {isAdmin && (
                 <AgentSelector 
                   selectedId={selectedAgentId}
                   options={agentOptions}
                   onChange={setSelectedAgentId}
                   loading={agentLoading}
                 />
               )}
               <TimePeriodSelector period={timePeriod} onChange={setTimePeriod} />
             </div>
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
