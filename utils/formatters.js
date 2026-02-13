export const formatPriceDisplay = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0';
  return Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
};

export const getPricingMeta = (product = {}) => {
  const basePrice = typeof product.price === 'number' ? product.price : parseFloat(product.price || '0');
  const rawDiscount = product.discount;
  const discountZhe =
    typeof rawDiscount === 'number'
      ? rawDiscount
      : rawDiscount
        ? parseFloat(rawDiscount)
        : 10;
  const hasDiscount = Boolean(discountZhe && discountZhe > 0 && discountZhe < 10);
  const finalPrice = hasDiscount ? Math.round(basePrice * (discountZhe / 10) * 100) / 100 : basePrice;
  return { discountZhe, hasDiscount, finalPrice };
};

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

export const normalizeDescription = (value, maxLength = 48) => {
  if (!value) return '';
  const plain = String(value).replace(/\s+/g, ' ').trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength)}…`;
};
