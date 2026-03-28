import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Toast from '../Toast';

/**
 * 计算每个奖项的平均成本（基于其可用商品的 retail_price）
 */
function computeAvgCost(prize) {
  const items = (prize.items || []).filter(it => it.available);
  if (items.length === 0) return 0;
  const total = items.reduce((sum, it) => {
    const p = Number(it.retail_price);
    return sum + (Number.isFinite(p) ? p : 0);
  }, 0);
  return total / items.length;
}

/**
 * 判断一个奖项是否有库存（有可用商品）
 */
function hasStock(prize) {
  const items = prize.items || [];
  if (items.length === 0) return false;
  return items.some(it => it.available);
}

/**
 * 最优概率分配算法 v2
 * 使用 inverseCost^β 主策略 + log-rescue 混合，兼顾成本最小化与权重均衡
 *
 * - BETA=0.85：对高成本奖项施加更强惩罚（比 sqrt 更激进）
 * - ALPHA=0.02：2% 权重给 log(1+c/ε) rescue 项，防止高成本奖项概率趋零
 *
 * @param {Array} enabledPrizes - 参与计算的奖项列表（需包含 items）
 * @param {number} targetRate - 目标总中奖率（百分比，如 100 = 100%）
 * @param {Object} lockedMap - 已锁定的奖项 { prizeId: lockedPercent }
 * @returns {Object} { [prizeId]: recommendedPercent }
 */
function computeOptimalDistribution(enabledPrizes, targetRate, lockedMap = {}) {
  if (enabledPrizes.length === 0) return {};

  const BETA = 0.85;
  const ALPHA = 0.02;

  let lockedTotal = 0;
  const unlockedPrizes = [];

  for (const p of enabledPrizes) {
    if (lockedMap[p.id] !== undefined) {
      lockedTotal += lockedMap[p.id];
    } else {
      unlockedPrizes.push(p);
    }
  }

  const remainingRate = Math.max(0, targetRate - lockedTotal);

  if (unlockedPrizes.length === 0) {
    const result = {};
    for (const p of enabledPrizes) {
      result[p.id] = lockedMap[p.id] !== undefined ? lockedMap[p.id] : 0;
    }
    return result;
  }

  const costs = unlockedPrizes.map(p => ({
    id: p.id,
    cost: computeAvgCost(p)
  }));

  const maxCost = Math.max(...costs.map(c => c.cost), 0.01);
  const EPSILON = maxCost * 0.05;

  const mainRaw = {};
  const rescueRaw = {};
  let mainSum = 0;
  let rescueSum = 0;

  for (const { id, cost } of costs) {
    const main = 1 / Math.pow(cost + EPSILON, BETA);
    const rescue = Math.log(1 + cost / EPSILON);

    mainRaw[id] = main;
    rescueRaw[id] = rescue;
    mainSum += main;
    rescueSum += rescue;
  }

  const rawAllocation = {};
  for (const { id } of costs) {
    const share =
      (1 - ALPHA) * (mainRaw[id] / mainSum) +
      ALPHA * (rescueRaw[id] / rescueSum);

    rawAllocation[id] = share * remainingRate;
  }

  const result = {};
  for (const p of enabledPrizes) {
    if (lockedMap[p.id] !== undefined) {
      result[p.id] = lockedMap[p.id];
    } else {
      result[p.id] = Math.round(rawAllocation[p.id] * 10) / 10;
    }
  }

  // 修正舍入误差
  const unlockedSum = unlockedPrizes.reduce((s, p) => s + result[p.id], 0);
  const roundingError = Math.round((remainingRate - unlockedSum) * 10) / 10;

  if (Math.abs(roundingError) >= 0.05 && unlockedPrizes.length > 0) {
    let maxId = unlockedPrizes[0].id;
    for (const p of unlockedPrizes) {
      if (result[p.id] > result[maxId]) maxId = p.id;
    }
    result[maxId] = Math.round((result[maxId] + roundingError) * 10) / 10;
  }

  return result;
}

/**
 * 核心：根据当前 rows 状态和 targetRate 重新分配未锁定奖项的概率，
 * 同时计算推荐值（完全不锁定时的最优分布）。
 * 返回 { updatedRows, recommendedMap }
 */
function recomputeRows(currentRows, targetRate, originalPrizes) {
  const enabled = currentRows.filter(r => r.enabled && r.hasStock);
  if (enabled.length === 0) {
    return { updatedRows: currentRows, recommendedMap: {} };
  }

  const toPrize = (r) => {
    const orig = (originalPrizes || []).find(p => p.id === r.id);
    return orig || { id: r.id, items: [] };
  };

  // 推荐值：完全无锁定
  const prizesForCalc = enabled.map(toPrize);
  const recommended = computeOptimalDistribution(prizesForCalc, targetRate, {});

  // 实际分配：考虑锁定
  const lockedMap = {};
  for (const r of enabled) {
    if (r.locked) lockedMap[r.id] = r.percent;
  }
  const actual = computeOptimalDistribution(prizesForCalc, targetRate, lockedMap);

  const updatedRows = currentRows.map(r => {
    if (!r.enabled || !r.hasStock) return { ...r, percent: 0 };
    if (r.locked) return r;
    return { ...r, percent: actual[r.id] !== undefined ? actual[r.id] : 0 };
  });

  return { updatedRows, recommendedMap: recommended };
}


const LotteryQuickAdjustModal = ({ open, onClose, prizes, onApply, apiRequest, apiPrefix }) => {
  const [rows, setRows] = useState([]);
  const [targetRate, setTargetRate] = useState(100);
  const [recommendedMap, setRecommendedMap] = useState({});
  const [userOverrideAll, setUserOverrideAll] = useState(false);
  const [errorToast, setErrorToast] = useState({ message: '', visible: false });
  const initRef = useRef(false);
  const errorToastTimerRef = useRef(null);

  const showErrorToast = useCallback((message) => {
    if (!message) return;
    if (errorToastTimerRef.current) {
      clearTimeout(errorToastTimerRef.current);
    }
    setErrorToast({ message, visible: true });
    errorToastTimerRef.current = setTimeout(() => {
      setErrorToast((prev) => ({ ...prev, visible: false }));
      errorToastTimerRef.current = null;
    }, 3000);
  }, []);

  const hideErrorToast = useCallback(() => {
    if (errorToastTimerRef.current) {
      clearTimeout(errorToastTimerRef.current);
      errorToastTimerRef.current = null;
    }
    setErrorToast((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => () => {
    if (errorToastTimerRef.current) {
      clearTimeout(errorToastTimerRef.current);
      errorToastTimerRef.current = null;
    }
  }, []);

  // 初始化
  useEffect(() => {
    if (!open) {
      initRef.current = false;
      return;
    }
    if (initRef.current) return;
    initRef.current = true;

    const initialRows = (prizes || []).map(p => {
      const stock = hasStock(p);
      return {
        id: p.id,
        displayName: p.display_name,
        hasStock: stock,
        enabled: stock && p.is_active,
        percent: 0,
        locked: false,
        avgCost: computeAvgCost(p),
        isActive: p.is_active,
        originalPercent: Number.isFinite(p.weight) ? (p.weight <= 1.000001 ? p.weight * 100 : p.weight) : 0
      };
    });

    // 排序：已启用有库存 → 已停用 → 无库存，同层按平均成本升序
    initialRows.sort((a, b) => {
      const tier = (r) => !r.hasStock ? 2 : (r.isActive ? 0 : 1);
      const ta = tier(a), tb = tier(b);
      if (ta !== tb) return ta - tb;
      return a.avgCost - b.avgCost;
    });

    const { updatedRows, recommendedMap: rec } = recomputeRows(initialRows, 100, prizes);
    setRows(updatedRows);
    setRecommendedMap(rec);
    setTargetRate(100);
    setUserOverrideAll(false);
  }, [open, prizes]);

  const enabledRows = useMemo(() => rows.filter(r => r.enabled && r.hasStock), [rows]);

  const totalPercent = useMemo(() => {
    return Math.round(enabledRows.reduce((sum, r) => sum + (r.percent || 0), 0) * 10) / 10;
  }, [enabledRows]);

  const isOverflow = totalPercent > 100.05;

  // 期望成本：每次抽奖平均花费 = Σ(概率/100 × 该奖项平均奖品价值)
  const expectedCost = useMemo(() => {
    return enabledRows.reduce((sum, r) => {
      return sum + (r.percent / 100) * r.avgCost;
    }, 0);
  }, [enabledRows]);

  // 用户修改某个奖项概率
  const handlePercentChange = useCallback((id, newPercent) => {
    setRows(prev => {
      const next = prev.map(r => {
        if (r.id !== id) return r;
        return { ...r, percent: newPercent, locked: true };
      });

      const enabled = next.filter(r => r.enabled && r.hasStock);
      const unlockedCount = enabled.filter(r => !r.locked).length;

      if (unlockedCount === 0) {
        setUserOverrideAll(true);
        return next; // 不重新分配
      }
      setUserOverrideAll(false);

      const { updatedRows, recommendedMap: rec } = recomputeRows(next, targetRate, prizes);
      setRecommendedMap(rec);
      return updatedRows;
    });
  }, [prizes, targetRate]);

  // 切换勾选
  const handleToggleEnabled = useCallback((id) => {
    setRows(prev => {
      const next = prev.map(r => {
        if (r.id !== id || !r.hasStock) return r;
        return { ...r, enabled: !r.enabled, locked: false, percent: 0 };
      });
      const { updatedRows, recommendedMap: rec } = recomputeRows(next, targetRate, prizes);
      setRecommendedMap(rec);
      setUserOverrideAll(false);
      return updatedRows;
    });
  }, [prizes, targetRate]);

  // 恢复推荐值
  const handleResetToRecommended = useCallback((id) => {
    setRows(prev => {
      const next = prev.map(r => {
        if (r.id !== id) return r;
        return { ...r, locked: false };
      });
      const { updatedRows, recommendedMap: rec } = recomputeRows(next, targetRate, prizes);
      setRecommendedMap(rec);

      const enabled = updatedRows.filter(r => r.enabled && r.hasStock);
      setUserOverrideAll(enabled.length > 0 && enabled.every(r => r.locked));

      return updatedRows;
    });
  }, [prizes, targetRate]);

  // 修改目标中奖率
  const handleTargetRateChange = useCallback((newRate) => {
    setTargetRate(newRate);
    setRows(prev => {
      const unlocked = prev.map(r => ({ ...r, locked: false }));
      const { updatedRows, recommendedMap: rec } = recomputeRows(unlocked, newRate, prizes);
      setRecommendedMap(rec);
      setUserOverrideAll(false);
      return updatedRows;
    });
  }, [prizes]);

  // 滑动条最大值
  const getSliderMax = useCallback((id) => {
    const otherEnabledCount = enabledRows.filter(r => r.id !== id).length;
    return Math.round(Math.max(0.1, targetRate - 0.1 * otherEnabledCount) * 10) / 10;
  }, [enabledRows, targetRate]);

  // 一键调整
  const handleApply = useCallback(async () => {
    if (isOverflow) return;

    const updates = rows.map(r => {
      const original = (prizes || []).find(p => p.id === r.id);
      if (!original) return null;
      const shouldBeActive = r.enabled && r.hasStock;
      return {
        id: original.id,
        display_name: original.display_name,
        weight: shouldBeActive ? r.percent : original.weight,
        is_active: shouldBeActive,
        items: (original.items || []).map(it => ({
          id: it.id,
          product_id: it.product_id,
          variant_id: it.variant_id
        }))
      };
    }).filter(Boolean);

    try {
      for (const update of updates) {
        const result = await apiRequest(`${apiPrefix}/lottery-prizes/${update.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update)
        });
        if (result && result.success === false) {
          throw new Error(result.message || `更新奖项「${update.display_name || update.id}」失败`);
        }
      }
      if (onApply) onApply();
      onClose();
    } catch (e) {
      const message = e?.message || '一键调整失败';
      showErrorToast(message);
    }
  }, [rows, prizes, isOverflow, apiRequest, apiPrefix, onApply, onClose, showErrorToast]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
          <Toast
            message={errorToast.message}
            show={errorToast.visible}
            onClose={hideErrorToast}
            position="top-right"
          />
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
            transition={{ type: "spring", stiffness: 350, damping: 25, mass: 0.8 }}
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden z-10"
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <i className="fas fa-magic text-indigo-500"></i>
                  一键调整概率
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  智能优化奖项概率分配，平衡成本与中奖率
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-all duration-200"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Target rate + stats */}
            <div className="px-8 py-4 bg-gray-50/50 border-b border-gray-100 space-y-3">
              {/* Row 1: target rate + override hint */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-600">目标中奖率</span>
                <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 px-2.5 py-1.5">
                  <input
                    type="number"
                    min="0.1"
                    max="100"
                    step="0.1"
                    value={targetRate}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (Number.isFinite(v) && v >= 0.1 && v <= 100) {
                        handleTargetRateChange(v);
                      }
                    }}
                    className="w-12 text-center font-bold text-gray-900 text-sm focus:outline-none bg-transparent"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
                <AnimatePresence mode="wait">
                  {isOverflow ? (
                    <motion.span
                      key="overflow"
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -5 }}
                      className="text-xs text-red-600 flex items-center gap-1"
                    >
                      <i className="fas fa-exclamation-triangle"></i>
                      总概率 {totalPercent.toFixed(1)}% 超过 100%
                    </motion.span>
                  ) : userOverrideAll ? (
                    <motion.span
                      key="override"
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -5 }}
                      className="text-xs text-amber-600 flex items-center gap-1"
                    >
                      <i className="fas fa-info-circle"></i>
                      已全部手动调整
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>
              {/* Row 2: stats */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">当前总概率</span>
                  <span className={`text-sm font-bold ${isOverflow ? 'text-red-500' : 'text-gray-900'}`}>
                    {totalPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-3.5 w-px bg-gray-300"></div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">谢谢参与</span>
                  <span className="text-sm font-bold text-gray-900">
                    {Math.max(0, 100 - totalPercent).toFixed(1)}%
                  </span>
                </div>
                <div className="h-3.5 w-px bg-gray-300"></div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">期望成本</span>
                  <span className="text-sm font-bold text-amber-600">
                    ¥{expectedCost.toFixed(2)}
                  </span>
                  <span className="text-xs text-gray-400">/次</span>
                </div>
              </div>
            </div>

            {/* Prize table */}
            <div className="flex-1 overflow-y-auto px-8 py-4 custom-scrollbar">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-3 text-left text-xs font-bold text-gray-500 uppercase w-10"></th>
                    <th className="pb-3 text-left text-xs font-bold text-gray-500 uppercase w-32">奖项名称</th>
                    <th className="pb-3 text-left text-xs font-bold text-gray-500 uppercase">概率调整</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const sliderMax = getSliderMax(row.id);
                    const recommended = recommendedMap[row.id];
                    const isDisabledRow = !row.hasStock;
                    const isUnchecked = !row.enabled;

                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-gray-50 transition-colors ${
                          isDisabledRow ? 'bg-red-50/50' : isUnchecked ? 'bg-gray-50/50 opacity-50' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-4 pr-2">
                          <label className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={row.enabled}
                              disabled={isDisabledRow}
                              onChange={() => handleToggleEnabled(row.id)}
                              className={`w-4 h-4 rounded border-gray-300 text-black focus:ring-black/20 transition-all ${
                                isDisabledRow ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                              }`}
                            />
                          </label>
                        </td>

                        {/* Name */}
                        <td className="py-4 pr-4 align-middle">
                          <div className="flex flex-col justify-center">
                            <span className={`font-bold text-sm leading-5 ${isDisabledRow ? 'text-red-600' : isUnchecked ? 'text-gray-400' : 'text-gray-900'}`}>
                              {row.displayName}
                            </span>
                            {isDisabledRow ? (
                              <span className="text-[10px] text-red-500 flex items-center gap-1 mt-0.5">
                                <i className="fas fa-exclamation-triangle"></i> 无库存
                              </span>
                            ) : !isUnchecked ? (
                              <span className={`text-[10px] flex items-center gap-1 mt-0.5 transition-opacity duration-150 ${
                                (() => {
                                  const diff = Math.round((row.percent - row.originalPercent) * 10) / 10;
                                  return row.locked ? 'text-indigo-500'
                                    : Math.abs(diff) >= 0.05
                                      ? (diff > 0 ? 'text-emerald-500' : 'text-red-500')
                                      : 'text-gray-400';
                                })()
                              }`}>
                                {(() => {
                                  if (row.locked) return <><i className="fas fa-lock"></i> 已锁定</>;
                                  const diff = Math.round((row.percent - row.originalPercent) * 10) / 10;
                                  if (Math.abs(diff) < 0.05) return <>0.0%</>;
                                  return <><i className={`fas fa-arrow-${diff > 0 ? 'up' : 'down'}`}></i> {diff > 0 ? '+' : ''}{diff.toFixed(1)}%</>;
                                })()}
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* Slider + Input + Reset */}
                        <td className="py-4">
                          {isDisabledRow || isUnchecked ? (
                            <div className="text-sm text-gray-400 italic">—</div>
                          ) : (
                            <div className="flex items-center gap-3">
                              {/* Slider with recommended marker — desktop only */}
                              <div className="flex-1 relative min-w-0 hidden md:block">
                                <input
                                  type="range"
                                  min={0.1}
                                  max={sliderMax}
                                  step={0.1}
                                  value={Math.min(row.percent, sliderMax)}
                                  onChange={(e) => handlePercentChange(row.id, parseFloat(e.target.value))}
                                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer
                                    [&::-webkit-slider-thumb]:appearance-none
                                    [&::-webkit-slider-thumb]:w-5
                                    [&::-webkit-slider-thumb]:h-5
                                    [&::-webkit-slider-thumb]:rounded-full
                                    [&::-webkit-slider-thumb]:bg-black
                                    [&::-webkit-slider-thumb]:shadow-md
                                    [&::-webkit-slider-thumb]:cursor-pointer
                                    [&::-webkit-slider-thumb]:transition-shadow
                                    [&::-webkit-slider-thumb]:hover:shadow-lg
                                    [&::-webkit-slider-thumb]:relative
                                    [&::-webkit-slider-thumb]:z-20
                                    [&::-moz-range-thumb]:w-5
                                    [&::-moz-range-thumb]:h-5
                                    [&::-moz-range-thumb]:rounded-full
                                    [&::-moz-range-thumb]:bg-black
                                    [&::-moz-range-thumb]:border-none
                                    [&::-moz-range-thumb]:shadow-md
                                    [&::-moz-range-thumb]:cursor-pointer
                                    [&::-moz-range-thumb]:relative
                                    [&::-moz-range-thumb]:z-20"
                                />
                              </div>

                              {/* Numeric input */}
                              <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 w-[82px] shrink-0">
                                <input
                                  type="number"
                                  min={0.1}
                                  max={sliderMax}
                                  step={0.1}
                                  value={row.percent}
                                  onChange={(e) => {
                                    let v = parseFloat(e.target.value);
                                    if (!Number.isFinite(v)) v = 0.1;
                                    v = Math.round(v * 10) / 10;
                                    v = Math.max(0.1, Math.min(v, sliderMax));
                                    handlePercentChange(row.id, v);
                                  }}
                                  className="w-full text-right text-sm font-mono font-bold text-gray-900 bg-transparent focus:outline-none"
                                />
                                <span className="text-xs text-gray-400 shrink-0">%</span>
                              </div>

                              {/* Reset button */}
                              <button
                                onClick={() => handleResetToRecommended(row.id)}
                                disabled={!row.locked}
                                className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-all ${
                                  row.locked
                                    ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 cursor-pointer'
                                    : 'text-gray-300 bg-gray-50 cursor-not-allowed'
                                }`}
                                title="恢复推荐值"
                              >
                                <i className="fas fa-redo-alt text-xs"></i>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 bg-white border-t border-gray-100 flex items-center justify-end">
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-all duration-200"
                >
                  取消
                </button>
                <button
                  onClick={handleApply}
                  disabled={isOverflow}
                  className={`px-8 py-2.5 text-sm font-medium rounded-full transition-all duration-200 shadow-lg hover:shadow-xl ${
                    isOverflow
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                      : 'bg-black text-white hover:bg-gray-800'
                  }`}
                >
                  <i className="fas fa-magic mr-2"></i>
                  一键调整
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default LotteryQuickAdjustModal;
