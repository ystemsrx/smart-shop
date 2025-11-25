import { useEffect, useState } from 'react';
import { normalizeBooleanFlag } from '../helpers';

export function useAdminWarnings({ user, expectedRole, staffPrefix, apiRequest }) {
  const [lotteryHasStockWarning, setLotteryHasStockWarning] = useState(false);
  const [giftThresholdHasStockWarning, setGiftThresholdHasStockWarning] = useState(false);

  useEffect(() => {
    const preloadLotteryWarning = async () => {
      if (!user || user.type !== expectedRole) return;

      try {
        const response = await apiRequest(`${staffPrefix}/lottery-config`);
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
        console.error('预加载抽奖警告检查失败:', error);
      }
    };

    if (user && user.type === expectedRole) {
      preloadLotteryWarning();
    }
  }, [user, expectedRole, staffPrefix, apiRequest]);

  useEffect(() => {
    const preloadGiftThresholdWarning = async () => {
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
        console.error('预加载满额门槛警告检查失败:', error);
      }
    };

    if (user && user.type === expectedRole) {
      preloadGiftThresholdWarning();
    }
  }, [user, expectedRole, staffPrefix, apiRequest]);

  return {
    lotteryHasStockWarning,
    giftThresholdHasStockWarning,
    setLotteryHasStockWarning,
    setGiftThresholdHasStockWarning
  };
}
