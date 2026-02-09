import { useEffect, useState, useCallback } from 'react';
import { normalizeBooleanFlag } from '../helpers';

export function useAdminWarnings({ user, expectedRole, staffPrefix, apiRequest }) {
  const [lotteryHasStockWarning, setLotteryHasStockWarning] = useState(false);
  const [giftThresholdHasStockWarning, setGiftThresholdHasStockWarning] = useState(false);

  const refreshLotteryWarning = useCallback(async () => {
    if (!user || user.type !== expectedRole) return;

    try {
      const response = await apiRequest(`${staffPrefix}/lottery-config`);
      const lotteryEnabled = normalizeBooleanFlag(response?.data?.is_enabled, true);
      if (!lotteryEnabled) {
        setLotteryHasStockWarning(false);
        return;
      }
      const list = response?.data?.prizes || [];
      const prizesData = list.map((p) => {
        const normalizedItems = (p.items || []).map((item) => ({
          ...item,
          available: normalizeBooleanFlag(item?.available, false),
          is_active: normalizeBooleanFlag(item?.is_active, true)
        }));
        return {
          ...p,
          weight: parseFloat(p.weight || 0),
          is_active: normalizeBooleanFlag(p.is_active, true),
          items: normalizedItems
        };
      });

      const hasWarning = prizesData.some(prize => {
        if (!prize.is_active) return false;
        const itemList = Array.isArray(prize.items) ? prize.items : [];
        if (itemList.length === 0) return false;
        const hasAvailable = itemList.some(item => item && item.available);
        if (hasAvailable) return false;
        return true;
      });

      setLotteryHasStockWarning(hasWarning);
    } catch (error) {
      console.error('Failed to refresh lottery warning check:', error);
    }
  }, [user, expectedRole, staffPrefix, apiRequest]);

  const refreshGiftThresholdWarning = useCallback(async () => {
    if (!user || user.type !== expectedRole) return;

    try {
      const response = await apiRequest(`${staffPrefix}/gift-thresholds?include_inactive=true`);
      const thresholdsData = response?.data?.thresholds || [];

      const hasWarning = thresholdsData.some(threshold => {
        if (!threshold.is_active) return false;
        if (!threshold.gift_products) return false;
        const itemList = Array.isArray(threshold.items) ? threshold.items : [];
        if (itemList.length === 0) return false;
        const hasAvailable = itemList.some(item => item && item.available);
        if (hasAvailable) return false;
        return true;
      });

      setGiftThresholdHasStockWarning(hasWarning);
    } catch (error) {
      console.error('Failed to refresh threshold warning check:', error);
    }
  }, [user, expectedRole, staffPrefix, apiRequest]);

  const refreshAllWarnings = useCallback(async () => {
    await Promise.all([
      refreshLotteryWarning(),
      refreshGiftThresholdWarning()
    ]);
  }, [refreshLotteryWarning, refreshGiftThresholdWarning]);

  useEffect(() => {
    if (user && user.type === expectedRole) {
      refreshLotteryWarning();
    }
  }, [user, expectedRole, refreshLotteryWarning]);

  useEffect(() => {
    if (user && user.type === expectedRole) {
      refreshGiftThresholdWarning();
    }
  }, [user, expectedRole, refreshGiftThresholdWarning]);

  return {
    lotteryHasStockWarning,
    giftThresholdHasStockWarning,
    setLotteryHasStockWarning,
    setGiftThresholdHasStockWarning,
    refreshLotteryWarning,
    refreshGiftThresholdWarning,
    refreshAllWarnings
  };
}
