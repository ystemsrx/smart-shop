import { useMemo } from 'react';

// 格式化预约截止时间显示
export const formatReservationCutoff = (cutoffTime) => {
  if (!cutoffTime) return '需提前预约';
  
  const now = new Date();
  const [hours, minutes] = cutoffTime.split(':').map(Number);
  const todayCutoff = new Date();
  todayCutoff.setHours(hours, minutes, 0, 0);
  
  if (now > todayCutoff) {
    return `明日 ${cutoffTime} 后配送`;
  }
  
  return `今日 ${cutoffTime} 后配送`;
};

// 通用布尔归一化
export const normalizeBooleanFlag = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'active'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off', 'inactive'].includes(normalized)) {
      return false;
    }
  }
  return defaultValue;
};

// 统计辅助：创建一个映射帮助组件消费，兼容未来扩展
export const useBooleanFlagMapper = () => {
  return useMemo(() => ({ normalizeBooleanFlag }), []);
};
