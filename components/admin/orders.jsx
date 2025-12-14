import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { formatReservationCutoff } from './helpers';
import { getApiBaseUrl } from '../../utils/runtimeConfig';

// 统一状态映射（显示）
export const UNIFIED_STATUS_MAP = {
  '未付款': { text: '未付款', color: 'slate', bg: 'bg-slate-100', textCol: 'text-slate-700', ring: 'ring-slate-200', hoverBg: 'hover:bg-slate-200' },
  '待确认': { text: '待确认', color: 'amber', bg: 'bg-amber-100', textCol: 'text-amber-700', ring: 'ring-amber-200', hoverBg: 'hover:bg-amber-200' },
  '待配送': { text: '待配送', color: 'blue', bg: 'bg-blue-100', textCol: 'text-blue-700', ring: 'ring-blue-200', hoverBg: 'hover:bg-blue-200' },
  '配送中': { text: '配送中', color: 'purple', bg: 'bg-purple-100', textCol: 'text-purple-700', ring: 'ring-purple-200', hoverBg: 'hover:bg-purple-200' },
  '已完成': { text: '已完成', color: 'emerald', bg: 'bg-emerald-100', textCol: 'text-emerald-700', ring: 'ring-emerald-200', hoverBg: 'hover:bg-emerald-200' }
};


// Double Handle Time Slider Component
const DualTimeSlider = ({ startTime, endTime, onChange, minDate, maxDate }) => {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(null); // 'left' | 'right'

  // Convert date to percentage (0-100)
  const getPercent = (date) => {
    if (!date) return 0;
    const total = maxDate.getTime() - minDate.getTime();
    const current = date.getTime() - minDate.getTime();
    return Math.max(0, Math.min(100, (current / total) * 100));
  };

  const startPercent = startTime ? getPercent(startTime) : 0;
  const endPercent = endTime ? getPercent(endTime) : 100;

  useEffect(() => {
    if (!dragging) return;

    const handlePointerMove = (e) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const totalMs = maxDate.getTime() - minDate.getTime();
      const newTime = new Date(minDate.getTime() + totalMs * percent);

      if (dragging === 'left') {
        const newStart = newTime;
        // Prevent crossing
        if (endTime && newStart > endTime) return;
        onChange(newStart, endTime);
      } else {
        const newEnd = newTime;
        // Prevent crossing
        if (startTime && newEnd < startTime) return;
        onChange(startTime, newEnd);
      }
    };

    const handlePointerUp = () => {
      setDragging(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragging, startTime, endTime, minDate, maxDate, onChange]);

  return (
    <div className="relative w-full h-12 flex items-center select-none touch-none">
      {/* Track Background */}
      <div ref={trackRef} className="absolute w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        {/* Active Range */}
        <div 
          className="absolute h-full bg-gradient-to-r from-gray-800 to-black rounded-full"
          style={{ 
            left: `${startPercent}%`, 
            width: `${endPercent - startPercent}%` 
          }}
        />
      </div>

      {/* Left Handle */}
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          setDragging('left');
        }}
        className="absolute top-1/2 w-6 h-6 -ml-3 bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.15)] border border-gray-200 cursor-grab active:cursor-grabbing flex items-center justify-center z-10 hover:scale-110 transition-transform"
        style={{ left: `${startPercent}%`, transform: 'translateY(-50%)' }}
      >
        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
        {/* Tooltip */}
        <div className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] font-medium px-2 py-1 rounded-lg whitespace-nowrap pointer-events-none transition-all duration-200 ${dragging === 'left' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
          {startTime ? startTime.toLocaleDateString() : minDate.toLocaleDateString()}
        </div>
      </div>

      {/* Right Handle */}
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          setDragging('right');
        }}
        className="absolute top-1/2 w-6 h-6 -ml-3 bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.15)] border border-gray-200 cursor-grab active:cursor-grabbing flex items-center justify-center z-10 hover:scale-110 transition-transform"
        style={{ left: `${endPercent}%`, transform: 'translateY(-50%)' }}
      >
        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
        {/* Tooltip */}
        <div className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] font-medium px-2 py-1 rounded-lg whitespace-nowrap pointer-events-none transition-all duration-200 ${dragging === 'right' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
          {endTime ? endTime.toLocaleDateString() : maxDate.toLocaleDateString()}
        </div>
      </div>
    </div>
  );
};

// New Export Modal Component
const ExportModal = ({ 
  open, 
  onClose, 
  onExport, 
  isExporting, 
  exportState, 
  exportHistory, 
  onLoadHistory,
  minDate: propMinDate,
  showToast
}) => {
  const [step, setStep] = useState('config'); // 'config' | 'exporting'
  const [rangeMode, setRangeMode] = useState('all'); // 'all', '7d', '30d', '90d', '180d' - 控制滑条范围
  const [isManuallyAdjusted, setIsManuallyAdjusted] = useState(false); // 是否手动调整过滑条（控制快捷按钮选中效果）
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const historyButtonRef = useRef(null);
  const historyPanelRef = useRef(null);

  // Close history panel when clicking outside
  useEffect(() => {
    if (!showHistory) return;
    
    const handleClickOutside = (e) => {
      if (
        historyPanelRef.current && 
        !historyPanelRef.current.contains(e.target) &&
        historyButtonRef.current &&
        !historyButtonRef.current.contains(e.target)
      ) {
        setShowHistory(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHistory]);

  // Prevent scroll on overlay without hiding scrollbar
  const handleOverlayWheel = (e) => {
    e.preventDefault();
  };

  const handleOverlayTouchMove = (e) => {
    e.preventDefault();
  };

  // Global max date (today)
  const globalMaxDate = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);
  
  // Global min date (first order date or fallback) - 确保是那天的凌晨00:00:00
  const globalMinDate = useMemo(() => {
    const d = propMinDate ? new Date(propMinDate) : new Date();
    if (!propMinDate) {
      d.setDate(d.getDate() - 180);
    }
    // 确保是那天的凌晨00:00:00（设备本地时区）
    d.setHours(0, 0, 0, 0);
    return d;
  }, [propMinDate]);

  // Dynamic slider bounds based on rangeMode
  const { sliderMinDate, sliderMaxDate } = useMemo(() => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    
    switch (rangeMode) {
      case '7d': {
        const start = new Date(now);
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        return { sliderMinDate: start, sliderMaxDate: now };
      }
      case '30d': {
        const start = new Date(now);
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        return { sliderMinDate: start, sliderMaxDate: now };
      }
      case '90d': {
        const start = new Date(now);
        start.setDate(start.getDate() - 90);
        start.setHours(0, 0, 0, 0);
        return { sliderMinDate: start, sliderMaxDate: now };
      }
      case '180d': {
        const start = new Date(now);
        start.setDate(start.getDate() - 180);
        start.setHours(0, 0, 0, 0);
        return { sliderMinDate: start, sliderMaxDate: now };
      }
      case 'all':
      case 'custom':
      default:
        return { sliderMinDate: globalMinDate, sliderMaxDate: now };
    }
  }, [rangeMode, globalMinDate]);

  // Check if endTime is "today"
  const isEndTimeToday = useMemo(() => {
    if (!endTime) return true;
    const today = new Date();
    return endTime.toDateString() === today.toDateString();
  }, [endTime]);

  // Check if current range covers the full time span (for display purposes)
  const isFullRange = useMemo(() => {
    if (!startTime || !endTime) return false;
    // Check if start is at or before globalMinDate and end is at or after today
    const startAtMin = startTime.getTime() <= globalMinDate.getTime() + 86400000; // 1 day tolerance
    const endAtMax = endTime.toDateString() === globalMaxDate.toDateString();
    return startAtMin && endAtMax;
  }, [startTime, endTime, globalMinDate, globalMaxDate]);

  useEffect(() => {
    if (open) {
      setStep('config');
      setRangeMode('all');
      setIsManuallyAdjusted(false); // 重置手动调整标记
      // Initialize with first order date to now for "all"
      setStartTime(globalMinDate);
      setEndTime(globalMaxDate);
      setShowHistory(false);
    }
  }, [open, globalMinDate, globalMaxDate]);

  useEffect(() => {
    if (isExporting) {
      setStep('exporting');
    }
  }, [isExporting]);

  const handleShortcut = (mode) => {
    setRangeMode(mode);
    setIsManuallyAdjusted(false); // 点击快捷按钮时重置手动调整标记
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    let start = null;
    let end = now;

    switch (mode) {
      case 'all':
        start = globalMinDate;
        end = now;
        break;
      case '7d': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        d.setHours(0, 0, 0, 0);
        start = d;
        break;
      }
      case '30d': {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        d.setHours(0, 0, 0, 0);
        start = d;
        break;
      }
      case '90d': {
        const d = new Date(now);
        d.setDate(d.getDate() - 90);
        d.setHours(0, 0, 0, 0);
        start = d;
        break;
      }
      case '180d': {
        const d = new Date(now);
        d.setDate(d.getDate() - 180);
        d.setHours(0, 0, 0, 0);
        start = d;
        break;
      }
    }
    setStartTime(start);
    setEndTime(end);
  };

  const handleSliderChange = (newStart, newEnd) => {
    // 手动调整时，标记为已手动调整，取消快捷选项的选中效果（但保持滑条范围不变）
    setIsManuallyAdjusted(true);
    setStartTime(newStart);
    setEndTime(newEnd);
  };

  const handleStartExport = () => {
    setStep('exporting');
    
    // 计算正确的起始时间（那天凌晨00:00:00，设备本地时区）
    let finalStartMs = null;
    if (startTime) {
      const startOfDay = new Date(startTime);
      startOfDay.setHours(0, 0, 0, 0);
      finalStartMs = startOfDay.getTime();
    }
    
    // 计算正确的结束时间
    let finalEndMs = null;
    if (endTime) {
      const today = new Date();
      const isToday = endTime.toDateString() === today.toDateString();
      
      if (isToday) {
        // 如果结束时间是今天，使用当前时刻
        finalEndMs = new Date().getTime();
      } else {
        // 如果结束时间不是今天，使用那天的23:59:59
        const endOfDay = new Date(endTime);
        endOfDay.setHours(23, 59, 59, 999);
        finalEndMs = endOfDay.getTime();
      }
    }
    
    onExport({
      startTimeMs: finalStartMs,
      endTimeMs: finalEndMs,
    });
  };

  const shortcuts = [
    { id: 'all', label: '全部' },
    { id: '7d', label: '近7天' },
    { id: '30d', label: '近30天' },
    { id: '90d', label: '近90天' },
    { id: '180d', label: '近半年' },
  ];

  const progressValue = Math.min(100, Math.max(0, exportState?.progress || 0));

  const statusLabelMap = {
    idle: '等待开始',
    running: '导出中',
    completed: '已完成',
    failed: '失败',
    expired: '已过期'
  };

  const formatHistoryTime = (val) => {
    if (!val) return '--';
    // Handle SQLite UTC timestamp format: "YYYY-MM-DD HH:MM:SS"
    let parsed;
    if (typeof val === 'string' && val.includes(' ') && !val.includes('T')) {
      // Convert SQLite format to ISO format with UTC timezone
      parsed = new Date(val.replace(' ', 'T') + 'Z');
    } else {
      parsed = new Date(val);
    }
    if (Number.isNaN(parsed.valueOf())) return val;
    // Display in local timezone
    return parsed.toLocaleString('zh-CN', { 
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // Build full download URL with API base
  const buildDownloadUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${getApiBaseUrl()}${url}`;
  };

  // Extract filename from content-disposition header
  const extractFilename = (contentDisposition) => {
    if (!contentDisposition) return null;
    
    // Try filename*= (RFC 5987) first - handles UTF-8 encoded names
    const filenameStarMatch = contentDisposition.match(/filename\*\s*=\s*(?:utf-8''|UTF-8'')([^;\s]+)/i);
    if (filenameStarMatch && filenameStarMatch[1]) {
      try {
        return decodeURIComponent(filenameStarMatch[1]);
      } catch (e) { /* ignore */ }
    }
    
    // Try filename= with quotes
    const quotedMatch = contentDisposition.match(/filename\s*=\s*"([^"]+)"/i);
    if (quotedMatch && quotedMatch[1]) {
      try {
        return decodeURIComponent(quotedMatch[1]);
      } catch (e) {
        return quotedMatch[1];
      }
    }
    
    // Try filename= without quotes
    const unquotedMatch = contentDisposition.match(/filename\s*=\s*([^;\s]+)/i);
    if (unquotedMatch && unquotedMatch[1]) {
      try {
        return decodeURIComponent(unquotedMatch[1]);
      } catch (e) {
        return unquotedMatch[1];
      }
    }
    
    return null;
  };

  // Handle download with error checking
  const handleDownload = async (url, fallbackFilename = null) => {
    if (!url) return;
    const fullUrl = buildDownloadUrl(url);
    try {
      const response = await fetch(fullUrl, { 
        method: 'GET',
        credentials: 'include'
      });
      
      if (response.ok) {
        // File exists, download it
        const blob = await response.blob();
        const contentDisposition = response.headers.get('content-disposition');
        
        // Try to get filename from various sources
        let filename = extractFilename(contentDisposition);
        
        // Fallback to provided filename
        if (!filename && fallbackFilename) {
          filename = fallbackFilename;
        }
        
        // Final fallback
        if (!filename) {
          filename = `orders_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
        }
        
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      } else {
        // Parse error response
        let errorText = '下载失败，请重试';
        try {
          const errorData = await response.json();
          errorText = errorData.detail || errorText;
        } catch (e) { /* ignore */ }
        
        if (response.status === 404) {
          errorText = '导出文件已过期或不存在，请重新导出';
        } else if (response.status === 410) {
          errorText = '导出链接已过期，请重新导出';
        }
        
        if (showToast) {
          showToast(errorText);
        } else {
          alert(errorText);
        }
      }
    } catch (e) {
      if (showToast) {
        showToast('下载失败，请检查网络连接');
      } else {
        alert('下载失败，请检查网络连接');
      }
    }
  };

  const modalContent = (
    <AnimatePresence>
      {open && (
        <div 
          className="fixed inset-0 z-[999] flex items-center justify-center p-4"
          onWheel={handleOverlayWheel}
          onTouchMove={handleOverlayTouchMove}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            layout
            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl z-10"
          >
            {/* Header */}
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">导出报表</h3>
                <p className="text-sm text-gray-500 mt-1">选择时间范围生成订单数据报表</p>
              </div>
              <div className="flex items-center gap-2 relative">
                {step !== 'exporting' && (
                  <div className="relative">
                    <button
                      ref={historyButtonRef}
                      onClick={() => {
                        if (!showHistory && onLoadHistory) void onLoadHistory();
                        setShowHistory(prev => !prev);
                      }}
                      className={`h-10 w-10 rounded-2xl border flex items-center justify-center transition-all duration-200 ${
                        showHistory ? 'bg-gray-900 text-white border-gray-800 shadow-lg shadow-gray-200/40' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                      }`}
                      title="查看历史导出记录"
                    >
                      <i className="fas fa-clock-rotate-left"></i>
                    </button>
                    
                    {/* History Dropdown Panel */}
                    <AnimatePresence>
                      {showHistory && (
                        <motion.div
                          ref={historyPanelRef}
                          initial={{ opacity: 0, scale: 0.9, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -10 }}
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50"
                          style={{ transformOrigin: 'top right' }}
                        >
                          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <h4 className="text-sm font-bold text-gray-900">导出历史</h4>
                            <button 
                              onClick={() => setShowHistory(false)}
                              className="w-6 h-6 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <i className="fas fa-times text-xs"></i>
                            </button>
                          </div>
                          <div className="max-h-64 overflow-y-auto custom-scrollbar">
                            {exportHistory.length === 0 ? (
                              <div className="py-8 text-center text-gray-400 text-sm">
                                <i className="fas fa-inbox text-2xl mb-2 opacity-50"></i>
                                <p>暂无导出记录</p>
                              </div>
                            ) : (
                              <div className="divide-y divide-gray-50">
                                {exportHistory.map((item) => {
                                  const statusText = statusLabelMap[item.status] || '进行中';
                                  const tagColor = item.status === 'completed'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : item.status === 'failed'
                                      ? 'bg-red-50 text-red-600'
                                      : item.status === 'expired'
                                        ? 'bg-gray-100 text-gray-500'
                                        : 'bg-blue-50 text-blue-700';
                                  return (
                                    <div key={item.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                                      <div className="flex items-center justify-between gap-2 mb-1">
                                        <div className="text-sm font-medium text-gray-900 truncate">{item.range_label || item.rangeLabel || '全部时间'}</div>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${tagColor}`}>{statusText}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs text-gray-400">
                                        <span>{formatHistoryTime(item.created_at)}</span>
                                        {item.download_url && (
                                          <button
                                            onClick={() => handleDownload(item.download_url, item.filename)}
                                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-500 font-medium"
                                          >
                                            <i className="fas fa-download text-[10px]"></i> 下载
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                <button 
                  onClick={onClose}
                  className="w-10 h-10 rounded-2xl border border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>

            {/* Content Area */}
            <motion.div 
              layout
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="px-8 pb-8 flex flex-col justify-center"
            >
              <AnimatePresence mode="wait">
                {step === 'config' && (
                  <motion.div
                    key="config"
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-8"
                  >
                    {/* Time Slider Section */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-end px-1">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">时间范围</span>
                        <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                          {(rangeMode === 'all' && isFullRange) ? '全部时间' : 
                           `${startTime?.toLocaleDateString() || sliderMinDate.toLocaleDateString()} - ${isEndTimeToday ? '至今' : endTime?.toLocaleDateString()}`}
                        </span>
                      </div>
                      <DualTimeSlider 
                        startTime={startTime} 
                        endTime={endTime} 
                        onChange={handleSliderChange}
                        minDate={sliderMinDate}
                        maxDate={sliderMaxDate}
                      />
                    </div>

                    {/* Shortcuts */}
                    <div className="grid grid-cols-5 gap-2">
                      {shortcuts.map(s => (
                        <button
                          key={s.id}
                          onClick={() => handleShortcut(s.id)}
                          className={`
                            py-2 rounded-xl text-xs font-medium transition-all duration-200
                            ${!isManuallyAdjusted && rangeMode === s.id 
                              ? 'bg-gray-900 text-white shadow-lg shadow-gray-200 scale-105' 
                              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}
                          `}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={handleStartExport}
                      className="w-full py-3.5 rounded-2xl bg-gray-900 text-white font-semibold text-sm shadow-xl shadow-gray-200 hover:bg-black hover:scale-[1.02] active:scale-95 transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-cloud-arrow-down"></i>
                      开始导出
                    </button>
                  </motion.div>
                )}

                {step === 'exporting' && (
                  <motion.div
                    key="progress"
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 200, damping: 25 }}
                    className="flex flex-col items-center justify-center space-y-6 py-8"
                  >
                    <div className="relative w-24 h-24 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <path
                          className="text-gray-100"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                        />
                        <path
                          className="text-blue-500 transition-all duration-500 ease-out"
                          strokeDasharray={`${progressValue}, 100`}
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center flex-col">
                        <span className="text-2xl font-bold text-gray-900">{progressValue}%</span>
                      </div>
                    </div>
                    
                    <div className="text-center space-y-1">
                      <h4 className="text-lg font-semibold text-gray-900">
                        {exportState?.status === 'completed' ? '导出完成' : '正在导出...'}
                      </h4>
                      <p className="text-sm text-gray-500 max-w-[200px] mx-auto">
                        {exportState?.message || '正在处理数据，请稍候'}
                      </p>
                    </div>

                    {exportState?.downloadUrl && (
                      <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => handleDownload(exportState.downloadUrl, exportState.filename)}
                        className="px-6 py-2.5 rounded-xl bg-blue-500 text-white font-semibold text-sm shadow-lg shadow-blue-200 hover:bg-blue-600 transition-all flex items-center gap-2"
                      >
                        <i className="fas fa-download"></i>
                        下载文件
                      </motion.button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // Use portal to render modal at document.body level
  if (typeof window === 'undefined') return null;
  return createPortal(modalContent, document.body);
};

export const UNIFIED_STATUS_ORDER = ['未付款', '待确认', '待配送', '配送中', '已完成'];

// 将后端的 status/payment_status 映射为统一状态
export const getUnifiedStatus = (order) => {
  const ps = order?.payment_status;
  const st = order?.status;
  if (!ps && !st) return '未付款';
  if (ps === 'processing') return '待确认';
  if (ps !== 'succeeded') return '未付款';
  if (st === 'shipped') return '配送中';
  if (st === 'delivered') return '已完成';
  return '待配送';
};

export const collapseAutoGiftItemsForDisplay = (items = []) => {
  if (!Array.isArray(items)) return [];
  const grouped = [];
  const indexLookup = new Map();

  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const baseQuantity = Number.parseInt(item.quantity, 10);
    const quantity = Number.isFinite(baseQuantity) && baseQuantity > 0 ? baseQuantity : 1;
    if (item.is_auto_gift && item.product_id) {
      const variantKey = item.variant_id || 'base';
      const groupKey = `${item.product_id}__${variantKey}`;
      if (indexLookup.has(groupKey)) {
        const idx = indexLookup.get(groupKey);
        const existing = grouped[idx];
        const existingQty = Number(existing.quantity) || 0;
        const existingSubtotal = Number(existing.subtotal) || 0;
        grouped[idx] = {
          ...existing,
          quantity: existingQty + quantity,
          subtotal: existingSubtotal + (Number(item.subtotal) || 0)
        };
      } else {
        const clone = { ...item };
        clone.quantity = quantity;
        clone.subtotal = Number(item.subtotal) || 0;
        grouped.push(clone);
        indexLookup.set(groupKey, grouped.length - 1);
      }
      return;
    }

    const clone = { ...item };
    clone.quantity = quantity;
    clone.subtotal = Number(item.subtotal) || 0;
    grouped.push(clone);
  });

  return grouped;
};

// 状态选择气泡组件
const StatusSelectPopover = ({ currentStatus, onSelect, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({});
  const [animateState, setAnimateState] = useState('closed'); // closed, opening, open
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    
    const handleScroll = () => {
      if (isOpen) setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const handleToggle = (e) => {
    if (disabled) return;
    e.stopPropagation();
    
    if (!isOpen) {
      const rect = buttonRef.current.getBoundingClientRect();
      const popoverHeight = 180; // Estimated height
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      let top, left = rect.left;
      let transformOrigin = 'top left';
      
      // Auto placement
      if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
        // Place above
        top = rect.top - 8;
        transformOrigin = 'bottom left';
        setPopoverStyle({
          position: 'fixed',
          top: 'auto',
          bottom: `${window.innerHeight - rect.top + 8}px`,
          left: `${left}px`,
          transformOrigin
        });
      } else {
        // Place below
        top = rect.bottom + 8;
        setPopoverStyle({
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          transformOrigin
        });
      }
      setAnimateState('opening');
      setIsOpen(true);
      // Small delay to trigger animation class
      setTimeout(() => setAnimateState('open'), 10);
    } else {
      setIsOpen(false);
      setAnimateState('closed');
    }
  };

  const currentStatusInfo = UNIFIED_STATUS_MAP[currentStatus] || UNIFIED_STATUS_MAP['未付款'];

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        disabled={disabled}
        className={`px-3 py-1 inline-flex items-center gap-1.5 text-xs font-semibold rounded-full transition-all duration-200 ${currentStatusInfo.bg} ${currentStatusInfo.textCol} hover:opacity-80 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className={`w-1.5 h-1.5 rounded-full bg-current opacity-60`}></span>
        {currentStatusInfo.text}
        <i className={`fas fa-chevron-down text-[10px] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${disabled ? 'opacity-30' : 'opacity-50'}`}></i>
      </button>

      {isOpen && createPortal(
        <div 
          ref={popoverRef}
          style={{ ...popoverStyle, zIndex: 9999 }}
          className={`w-48 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 transition-all duration-300 cubic-bezier(0.34, 1.56, 0.64, 1) ${
            animateState === 'open' ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 translate-y-2'
          }`}
        >
          <div className="grid grid-cols-2 gap-2">
            {UNIFIED_STATUS_ORDER.map((status) => {
              const info = UNIFIED_STATUS_MAP[status];
              const isSelected = currentStatus === status;
              return (
                <button
                  key={status}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(status);
                    setIsOpen(false);
                  }}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl text-xs transition-all duration-200 border ${
                    isSelected 
                      ? `${info.bg} ${info.textCol} ring-2 ring-inset ${info.ring} border-transparent font-bold shadow-sm` 
                      : `${info.bg} ${info.textCol} border-transparent opacity-70 hover:opacity-100 hover:scale-105`
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full mb-1 bg-current opacity-60`}></span>
                  {status}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export const OrderDetailsModal = ({ open, onClose, order, renderStatusBadge, formatDate, getUnifiedStatusFn, agentLabel }) => {
  const items = collapseAutoGiftItemsForDisplay(order?.items || []);
  const status = order && typeof getUnifiedStatusFn === 'function' ? getUnifiedStatusFn(order) : '';
  const statusBadge = status && typeof renderStatusBadge === 'function' ? renderStatusBadge(status) : null;
  const createdAtDisplay = order && typeof formatDate === 'function'
    ? formatDate(order.created_at_timestamp ?? order.created_at)
    : '';
  const paymentMethod = order?.payment_method === 'wechat'
    ? '微信支付'
    : (order?.payment_method || '未知');
  const discountAmount = Number(order?.discount_amount ?? 0);
  const totalAmount = Number(order?.total_amount ?? 0);
  const couponAmount = Number(order?.coupon_amount ?? 0);
  const resolvedAgentLabel = agentLabel || order?.agent_id || '未分配';

  const reservationFlag = order?.shipping_info?.reservation;
  const reservationReasons = Array.isArray(order?.shipping_info?.reservation_reasons)
    ? order.shipping_info.reservation_reasons.filter(Boolean)
    : [];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ 
              type: "spring",
              stiffness: 350,
              damping: 25,
              mass: 0.8
            }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col overflow-hidden z-10"
          >
            
            {/* Header */}
            <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-start bg-white z-10">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  订单详情
                  <span className="text-sm font-normal text-gray-400 font-mono bg-gray-50 px-2 py-1 rounded-md border border-gray-100">#{order?.id || '-'}</span>
                </h3>
                <div className="flex items-center gap-4 mt-2">
                  {statusBadge}
                  {createdAtDisplay && (
                    <span className="text-sm text-gray-500 flex items-center gap-1.5">
                      <i className="far fa-clock text-gray-400"></i>
                      {createdAtDisplay}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors active:scale-95"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gray-50/50 custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left Column: Products */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center bg-white">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                        <i className="fas fa-box-open text-blue-500"></i>
                        商品清单
                      </h4>
                      <span className="text-xs font-medium bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">
                        共 {items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0)} 件
                      </span>
                    </div>
                    
                    {items.length === 0 ? (
                      <div className="p-8 text-center text-gray-400 text-sm">暂无商品记录</div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {items
                          .sort((a, b) => {
                            const aIsNonSellable = Boolean(a.is_not_for_sale);
                            const bIsNonSellable = Boolean(b.is_not_for_sale);
                            if (aIsNonSellable && !bIsNonSellable) return 1;
                            if (!aIsNonSellable && bIsNonSellable) return -1;
                            return 0;
                          })
                          .map((it, idx) => (
                          <div key={`${it.product_id || 'item'}_${idx}`} className="px-6 py-4 hover:bg-gray-50/50 transition-colors group">
                            <div className="flex justify-between items-start gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="text-gray-900 font-medium text-base mb-1.5 flex flex-wrap items-center gap-2">
                                  {it.name}
                                  {it.variant_name && (
                                    <span className="px-2 py-0.5 text-xs rounded-md bg-gray-100 text-gray-600 border border-gray-200 font-normal">
                                      {it.variant_name}
                                    </span>
                                  )}
                                  {it.is_lottery && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-pink-50 text-pink-600 border border-pink-100 font-normal">
                                      <i className="fas fa-trophy text-[10px]"></i> 抽奖
                                    </span>
                                  )}
                                  {it.is_auto_gift && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 font-normal">
                                      <i className="fas fa-gift text-[10px]"></i> 赠品
                                    </span>
                                  )}
                                  {it.is_reservation && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-normal">
                                      <i className="fas fa-calendar-check text-[10px]"></i> 预约
                                    </span>
                                  )}
                                  {it.is_not_for_sale && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-purple-50 text-purple-600 border border-purple-100 font-normal">
                                      <i className="fas fa-ban text-[10px]"></i> 非卖
                                    </span>
                                  )}
                                </div>

                                <div className="text-sm text-gray-500 flex items-center gap-3">
                                  <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 text-xs">x{Number(it.quantity) || 0}</span>
                                  <span>单价 ¥{Number(it.unit_price || 0).toFixed(2)}</span>
                                </div>

                                {it.is_reservation && (
                                  <div className="mt-2 text-xs text-blue-600 bg-blue-50/50 p-2 rounded-lg border border-blue-100/50">
                                    <i className="fas fa-info-circle mr-1.5"></i>
                                    {formatReservationCutoff(it.reservation_cutoff)}
                                    {it.reservation_note ? ` · ${it.reservation_note}` : ''}
                                  </div>
                                )}

                                {(it.is_lottery || it.is_auto_gift) && (
                                  <div className="mt-1.5 text-xs text-gray-500">
                                    <span className="text-pink-500 mr-1">
                                      {it.is_lottery ? '抽奖赠' : '满额赠'}:
                                    </span>
                                    {(it.is_lottery ? (it.lottery_product_name || it.name) : (it.auto_gift_product_name || it.name)) || '-'}
                                    {(it.is_lottery ? it.lottery_variant_name : it.auto_gift_variant_name) ? `（${it.is_lottery ? it.lottery_variant_name : it.auto_gift_variant_name}）` : ''}
                                  </div>
                                )}
                              </div>
                              
                              <div className="text-right">
                                <div className="text-gray-900 font-semibold text-base">¥{Number(it.subtotal || 0).toFixed(2)}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Info */}
                <div className="flex flex-col gap-6">
                  
                  {/* Shipping Info */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-50 bg-white">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                        <i className="fas fa-map-marker-alt text-red-500"></i>
                        收货信息
                      </h4>
                    </div>
                    <div className="p-5">
                      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-4 text-sm">
                        <span className="text-gray-400 text-xs self-center">联系人</span>
                        <div className="font-medium text-gray-900 truncate max-w-[200px]" title={order?.shipping_info?.name}>
                          {(order?.shipping_info?.name || '—').length > 8 
                            ? (order.shipping_info.name.slice(0, 8) + '...') 
                            : (order?.shipping_info?.name || '—')}
                        </div>

                        <span className="text-gray-400 text-xs self-center">电话</span>
                        <div className="font-medium text-gray-900">
                          {order?.shipping_info?.phone || '—'}
                        </div>

                        <span className="text-gray-400 text-xs mt-0.5">地址</span>
                        <div className="text-gray-700 leading-relaxed">
                          {order?.shipping_info?.dormitory && order?.shipping_info?.building && order?.shipping_info?.room
                            ? `${order.shipping_info.dormitory} · ${order.shipping_info.building} · ${order.shipping_info.room}`
                            : (order?.shipping_info?.full_address || '—')}
                        </div>

                        <span className="text-gray-400 text-xs self-center">用户ID</span>
                        <div className="font-mono text-gray-500">{order?.student_id || '—'}</div>
                      </div>

                      {order?.note && (
                        <div className="mt-4 bg-amber-50 p-3 rounded-lg border border-amber-100 text-amber-800 text-xs leading-relaxed">
                          <span className="font-bold block mb-1">备注:</span>
                          {order.note}
                        </div>
                      )}
                      {reservationFlag && (
                        <div className="mt-3 bg-blue-50 p-3 rounded-lg border border-blue-100 text-blue-800 text-xs leading-relaxed">
                          <div className="flex items-center gap-1.5 font-bold mb-1">
                            <i className="fas fa-calendar-day"></i>
                            预约信息
                          </div>
                          {reservationReasons.length > 0 ? reservationReasons.join('，') : '预约订单'}
                          {order?.shipping_info?.reservation_closure_note ? ` · ${order.shipping_info.reservation_closure_note}` : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Order Summary */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-50 bg-white">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                        <i className="fas fa-file-invoice-dollar text-emerald-500"></i>
                        订单概览
                      </h4>
                    </div>
                    <div className="p-5 space-y-3 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">所属代理</span>
                        <span className="font-medium text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-xs">{resolvedAgentLabel}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">支付方式</span>
                        <span className="font-medium text-gray-900">{paymentMethod}</span>
                      </div>
                      <div className="h-px bg-gray-100 my-2"></div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between items-center text-pink-600">
                          <span>优惠抵扣</span>
                          <span>-¥{discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      {couponAmount > 0 && (
                        <div className="flex justify-between items-center text-indigo-600">
                          <span>赠送优惠券</span>
                          <span>{couponAmount.toFixed(2)} 元</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-gray-900 font-medium">实付金额</span>
                        <span className="text-xl font-bold text-gray-900">¥{totalAmount.toFixed(2)}</span>
                      </div>
                      {order?.gift_threshold_amount && (
                        <div className="mt-2 text-xs text-center text-gray-400 bg-gray-50 py-1.5 rounded">
                          已触发满 ¥{Number(order.gift_threshold_amount).toFixed(0)} 赠品门槛
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// 订单表格组件
export const OrderTable = ({
  orders,
  onUpdateUnifiedStatus,
  isLoading,
  selectedOrders = [],
  onSelectOrder,
  onSelectAllOrders,
  onBatchDeleteOrders,
  onRefresh,
  searchValue,
  onSearchChange,
  page = 0,
  hasMore = false,
  onPrevPage,
  onNextPage,
  agentNameMap = {},
  showAgentInfo = false
}) => {
  const [viewingOrder, setViewingOrder] = React.useState(null);
  
  const getStatusBadge = (status) => {
    const statusInfo = UNIFIED_STATUS_MAP[status] || { text: status, color: 'gray' };
    const colorClasses = {
      amber: 'bg-amber-50 text-amber-700 border-amber-200',
      blue: 'bg-blue-50 text-blue-700 border-blue-200',
      indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      purple: 'bg-purple-50 text-purple-700 border-purple-200',
      emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      red: 'bg-red-50 text-red-700 border-red-200',
      gray: 'bg-gray-50 text-gray-700 border-gray-200',
      slate: 'bg-slate-50 text-slate-700 border-slate-200'
    };
    
    return (
      <span className={`px-2.5 py-0.5 inline-flex text-xs font-medium rounded-full border ${colorClasses[statusInfo.color] || colorClasses.gray}`}>
        {statusInfo.text}
      </span>
    );
  };

  const formatDate = (val) => {
    if (typeof val === 'number' && isFinite(val)) {
      return new Date(val * 1000).toLocaleString('zh-CN', { hour12: false });
    }
    const t = Date.parse(val);
    return isNaN(t) ? '' : new Date(t).toLocaleString('zh-CN', { hour12: false });
  };

  const allIds = orders.map(o => o.id);
  const isAllSelected = allIds.length > 0 && allIds.every(id => selectedOrders.includes(id));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-4 bg-white">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-bold text-gray-900">订单列表</h3>
          {selectedOrders.length > 0 && (
            <div className="flex items-center gap-3 bg-red-50 px-3 py-1 rounded-lg border border-red-100 animate-fadeIn">
              <span className="text-xs font-medium text-red-600">已选 {selectedOrders.length} 项</span>
              <button
                onClick={() => onBatchDeleteOrders(selectedOrders)}
                className="text-xs bg-white text-red-600 px-2 py-0.5 rounded border border-red-200 hover:bg-red-50 transition-colors font-medium"
              >
                删除
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs group-focus-within:text-blue-500 transition-colors"></i>
            <input
              type="text"
              placeholder="搜索订单号、姓名、手机..."
              value={searchValue}
              onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white"
            />
          </div>
          <button 
            onClick={onRefresh} 
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200 transition-all active:scale-95"
            title="刷新列表"
          >
            <i className="fas fa-sync-alt text-sm"></i>
          </button>
        </div>
      </div>
      
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="px-6 py-4 text-left w-12">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  checked={isAllSelected}
                  onChange={(e) => onSelectAllOrders(e.target.checked, allIds)}
                />
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">订单信息</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">客户</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">商品</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">金额</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">时间</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                      <i className="fas fa-inbox text-2xl text-gray-300"></i>
                    </div>
                    <p className="text-sm">暂无订单数据</p>
                  </div>
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50/80 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      checked={selectedOrders.includes(order.id)}
                      onChange={(e) => onSelectOrder(order.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-900 font-mono">{order.id}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          {order.payment_method === 'wechat' ? '微信' : order.payment_method}
                        </span>
                        {showAgentInfo && (
                          <span className="text-xs text-gray-400" title="代理">
                            <i className="fas fa-user-tie mr-1"></i>
                            {agentNameMap?.[order.agent_id] || (order.agent_id ? order.agent_id : '未分配')}
                          </span>
                        )}
                      </div>
                      {Boolean(order.is_reservation) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 bg-blue-50 rounded border border-blue-100 w-fit mt-1">
                          <i className="fas fa-calendar-check"></i> 预约
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-900 font-medium">{order.shipping_info?.name || order.customer_name || '未知'}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{order.student_id || '—'}</span>
                      <span className="text-xs text-gray-400 mt-0.5 truncate max-w-[150px]" title={order.shipping_info?.full_address}>
                        {order.shipping_info?.full_address}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                      {(order.items || []).reduce((sum, it) => sum + (parseInt(it.quantity) || 0), 0)} 件
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-900">¥{Number(order.total_amount).toFixed(2)}</span>
                      {order.discount_amount > 0 && (
                        <span className="text-xs text-pink-500">-¥{Number(order.discount_amount).toFixed(2)}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusSelectPopover 
                      currentStatus={getUnifiedStatus(order)}
                      onSelect={(newStatus) => onUpdateUnifiedStatus(order, newStatus)}
                      disabled={isLoading}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col text-xs text-gray-500">
                      <span>{formatDate(order.created_at_timestamp ?? order.created_at).split(' ')[0]}</span>
                      <span className="text-gray-400">{formatDate(order.created_at_timestamp ?? order.created_at).split(' ')[1]}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => setViewingOrder(order)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-all shadow-sm active:scale-95"
                    >
                      <i className="fas fa-eye text-gray-400"></i>
                      查看
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/30">
        <span className="text-xs text-gray-500">
          第 <span className="font-medium text-gray-900">{Math.floor((page || 0) + 1)}</span> 页
        </span>
        <div className="flex items-center gap-2">
          <button 
            onClick={onPrevPage} 
            disabled={!(page > 0)} 
            className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            上一页
          </button>
          <button 
            onClick={onNextPage} 
            disabled={!hasMore} 
            className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            下一页
          </button>
        </div>
      </div>

      <OrderDetailsModal
        open={!!viewingOrder}
        onClose={() => setViewingOrder(null)}
        order={viewingOrder}
        renderStatusBadge={getStatusBadge}
        formatDate={formatDate}
        getUnifiedStatusFn={getUnifiedStatus}
        agentLabel={viewingOrder ? (agentNameMap?.[viewingOrder.agent_id] || viewingOrder.agent_id || '未分配') : '未分配'}
      />
    </div>
  );
};

// 范围选择气泡组件
const ScopeSelectPopover = ({ 
  value, 
  onChange, 
  options, 
  currentUserLabel, 
  disabled 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({});
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    
    const handleScroll = (event) => {
      // 如果滚动发生在弹窗内部，不关闭
      if (popoverRef.current && popoverRef.current.contains(event.target)) {
        return;
      }
      if (isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const handleToggle = (e) => {
    if (disabled) return;
    e.stopPropagation();
    
    if (!isOpen) {
      const rect = buttonRef.current.getBoundingClientRect();
      const popoverHeight = 300; // Estimated max height
      const spaceBelow = window.innerHeight - rect.bottom;
      
      let top, left = rect.left;
      let transformOrigin = 'top left';
      
      // Align right edge if it overflows right
      if (left + rect.width > window.innerWidth) {
          left = rect.right - rect.width;
          transformOrigin = 'top right';
      }

      if (spaceBelow < popoverHeight) {
        // Place above
        top = rect.top - 8;
        transformOrigin = transformOrigin.replace('top', 'bottom');
        setPopoverStyle({
          position: 'fixed',
          top: 'auto',
          bottom: `${window.innerHeight - rect.top + 8}px`,
          left: `${left}px`,
          width: `${rect.width}px`,
          transformOrigin
        });
      } else {
        // Place below
        top = rect.bottom + 8;
        setPopoverStyle({
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          width: `${rect.width}px`,
          transformOrigin
        });
      }
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
  };

  const getDisplayText = () => {
    if (value === 'self') return `我的订单（${currentUserLabel || '当前账号'}）`;
    if (value === 'all') return '全部订单';
    const agent = options.find(a => a.id === value);
    return agent ? agent.name : '选择范围';
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        disabled={disabled}
        className={`
          group relative flex items-center justify-between gap-3 px-4 py-2 
          bg-gray-50 hover:bg-gray-100 active:bg-gray-200 
          border border-gray-200 rounded-xl transition-all duration-200 
          text-sm text-gray-700 font-medium min-w-[160px]
          ${isOpen ? 'ring-2 ring-blue-500/20 border-blue-500' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <span className="truncate max-w-[140px]">{getDisplayText()}</span>
        <i className={`fas fa-chevron-down text-xs text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-blue-500' : ''}`}></i>
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div 
              ref={popoverRef}
              style={{ ...popoverStyle, zIndex: 9999 }}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ 
                type: "spring",
                stiffness: 400,
                damping: 25,
                mass: 0.8
              }}
              className="flex flex-col bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
            >
              <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar">
                <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">基础选项</div>
                <button
                  onClick={() => handleSelect('self')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-200 flex items-center justify-between group ${value === 'self' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <span>我的订单 <span className="text-xs opacity-60 ml-1">({currentUserLabel || '当前账号'})</span></span>
                  {value === 'self' && <i className="fas fa-check text-blue-500"></i>}
                </button>
                <button
                  onClick={() => handleSelect('all')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-200 flex items-center justify-between group ${value === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <span>全部订单</span>
                  {value === 'all' && <i className="fas fa-check text-blue-500"></i>}
                </button>
                
                {options.length > 0 && (
                  <>
                    <div className="my-1 border-t border-gray-100"></div>
                    <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">代理筛选</div>
                    {options.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => handleSelect(agent.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-200 flex items-center justify-between group ${value === agent.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                      >
                        <span className="truncate">
                          {agent.name}
                          {(!agent.isActive && !agent.isDeleted) && <span className="text-xs text-red-400 ml-1">(停用)</span>}
                        </span>
                        {value === agent.id && <i className="fas fa-check text-blue-500"></i>}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

// 订单管理面板
export const OrdersPanel = ({
  isAdmin,
  orderAgentFilter,
  orderAgentOptions,
  orderAgentFilterLabel,
  orderLoading,
  orders,
  orderStatusFilter,
  onOrderStatusFilterChange,
  orderExporting,
  exportHistory = [],
  exportState = {},
  onExportOrders,
  onLoadExportHistory,
  onResetExportState,
  orderStats,
  onOrderAgentFilterChange,
  selectedOrders,
  onSelectOrder,
  onSelectAllOrders,
  onBatchDeleteOrders,
  onRefreshOrders,
  orderSearch,
  onOrderSearchChange,
  orderPage,
  orderHasMore,
  onPrevPage,
  onNextPage,
  agentNameMap,
  isSubmitting,
  currentUserLabel,
  onUpdateUnifiedStatus,
  showToast
}) => {
  const [exportModalOpen, setExportModalOpen] = useState(false);
  
  const openExportModal = () => {
    if (onResetExportState) onResetExportState();
    setExportModalOpen(true);
  };

  // Calculate earliest order date for export range from backend stats
  const minOrderDate = useMemo(() => {
    // Use earliest_order_time from backend stats (covers all orders, not just current page)
    const earliestTime = orderStats?.earliest_order_time;
    if (earliestTime) {
      // Parse SQLite timestamp string (UTC format: "YYYY-MM-DD HH:MM:SS")
      const parsed = new Date(earliestTime.replace(' ', 'T') + 'Z');
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    
    // Fallback: use current page orders if stats not available
    if (orders && orders.length > 0) {
      const timestamps = orders.map(o => o.created_at_timestamp ? o.created_at_timestamp * 1000 : new Date(o.created_at.replace(' ', 'T') + 'Z').getTime());
      const minTs = Math.min(...timestamps);
      if (minTs && !isNaN(minTs)) {
        return new Date(minTs);
      }
    }
    
    // Final fallback: Jan 1st of current year
    return new Date(new Date().getFullYear(), 0, 1);
  }, [orderStats?.earliest_order_time, orders]);

  const closeExportModal = () => {
    setExportModalOpen(false);
    if (onResetExportState) onResetExportState();
  };

  return (
    <div className="space-y-6">
    <ExportModal 
      open={exportModalOpen}
      onClose={closeExportModal}
      onExport={async (range) => {
        await onExportOrders?.({
          startTimeMs: range.startTimeMs,
          endTimeMs: range.endTimeMs,
          statusFilter: orderStatusFilter,
          keyword: orderSearch
        });
      }}
      isExporting={orderExporting}
      exportState={exportState}
      exportHistory={exportHistory}
      onLoadHistory={onLoadExportHistory}
      minDate={minOrderDate}
      showToast={showToast}
    />

    {/* Header Section */}
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">订单管理</h2>
        <p className="text-sm text-gray-500 mt-1">查看和管理所有用户订单，处理发货与售后</p>
      </div>
      
      {isAdmin && (
        <div className="flex items-center gap-3 bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-gray-500 pl-3">查看范围</span>
          <ScopeSelectPopover
            value={orderAgentFilter}
            onChange={onOrderAgentFilterChange}
            options={orderAgentOptions}
            currentUserLabel={currentUserLabel}
            disabled={orderLoading}
          />
        </div>
      )}
    </div>

    {/* Stats Cards */}
    {(() => {
      const counts = orders.reduce((acc, o) => {
        const k = getUnifiedStatus(o);
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
      const hasAny = Object.keys(counts).length > 0;
      return hasAny ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {UNIFIED_STATUS_ORDER.map((status) => {
             const count = counts[status] || 0;
             const colorMap = {
               '未付款': 'text-slate-600 bg-slate-50 border-slate-100',
               '待确认': 'text-amber-600 bg-amber-50 border-amber-100',
               '待配送': 'text-blue-600 bg-blue-50 border-blue-100',
               '配送中': 'text-purple-600 bg-purple-50 border-purple-100',
               '已完成': 'text-emerald-600 bg-emerald-50 border-emerald-100',
             };
             const styleClass = colorMap[status] || 'text-gray-600 bg-gray-50 border-gray-100';
             
             return (
              <div key={status} className={`rounded-2xl p-4 border ${styleClass.split(' ')[0] === 'text-slate-600' ? 'bg-slate-50 border-slate-100' : styleClass.split(' ')[1] + ' ' + styleClass.split(' ')[2]} flex flex-col items-center justify-center transition-transform hover:scale-[1.02] cursor-default`}>
                <div className={`text-2xl font-bold ${styleClass.split(' ')[0]}`}>{count}</div>
                <div className="text-xs font-medium text-gray-500 mt-1">{status}</div>
              </div>
            );
          })}
        </div>
      ) : null;
    })()}

    {isSubmitting ? (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="animate-pulse space-y-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-10 w-10 bg-gray-100 rounded-full"></div>
              <div className="flex-1 space-y-3 py-1">
                <div className="h-4 bg-gray-100 rounded w-1/4"></div>
                <div className="h-3 bg-gray-100 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex bg-gray-100/80 p-1 rounded-xl">
            {['全部', ...UNIFIED_STATUS_ORDER].map((label) => (
              <button
                key={label}
                onClick={() => onOrderStatusFilterChange(label)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  orderStatusFilter === label 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={openExportModal}
            disabled={orderExporting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium shadow-sm shadow-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {orderExporting ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-file-export"></i>}
            {orderExporting ? '导出进行中' : '导出报表'}
          </button>
        </div>

        <OrderTable 
          orders={(orderStatusFilter === '全部' ? orders : orders.filter(o => getUnifiedStatus(o) === orderStatusFilter))}
          onUpdateUnifiedStatus={onUpdateUnifiedStatus}
          isLoading={isSubmitting || orderLoading}
          selectedOrders={selectedOrders}
          onSelectOrder={onSelectOrder}
          onSelectAllOrders={onSelectAllOrders}
          onBatchDeleteOrders={onBatchDeleteOrders}
          onRefresh={onRefreshOrders}
          searchValue={orderSearch}
          onSearchChange={onOrderSearchChange}
          page={orderPage}
          hasMore={orderHasMore}
          onPrevPage={onPrevPage}
          onNextPage={onNextPage}
          agentNameMap={agentNameMap}
          showAgentInfo={isAdmin}
        />
      </>
    )}
  </div>
  );
};

export default OrdersPanel;
