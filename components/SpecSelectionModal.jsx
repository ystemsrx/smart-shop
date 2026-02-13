import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getProductImage } from '../utils/urls';
import { getLogo } from '../utils/runtimeConfig';
import { formatPriceDisplay, getPricingMeta, formatReservationCutoff } from '../utils/formatters';

const SpecSelectionModal = ({
  product,
  onClose,
  onAddToCart,
  onUpdateQuantity,
  cartItemsMap = {},
  onStartFly,
  user
}) => {
  const [selectedVariant, setSelectedVariant] = useState(null);

  if (!product) return null;

  const isModalNonSellable = Boolean(product.is_not_for_sale);
  const { discountZhe: mDiscZ, hasDiscount: mHasDis, finalPrice: mFinalPrice } = getPricingMeta(product);
  
  const modalRequiresReservation = Boolean(product.reservation_required);
  const modalReservationCutoff = product.reservation_cutoff;
  const modalReservationNote = (product.reservation_note || '').trim();

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // Drag handler for mobile pull-to-dismiss
  const handleDragEnd = (event, info) => {
    // If dragged down more than 100px, close
    if (info.offset.y > 100) {
      onClose();
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Backdrop */}
      <motion.div 
        className="absolute inset-0 bg-black/30 md:bg-gray-900/30 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Modal Card */}
      <motion.div
        className="relative bg-white w-full max-w-lg rounded-t-3xl md:rounded-[2rem] shadow-2xl md:ring-1 md:ring-black/5 md:border md:border-gray-100 z-10"
        initial={typeof window !== 'undefined' && window.innerWidth >= 768 
          ? { opacity: 0, scale: 0.92, y: 10 } 
          : { y: "100%" }}
        animate={typeof window !== 'undefined' && window.innerWidth >= 768 
          ? { opacity: 1, scale: 1, y: 0 } 
          : { y: 0 }}
        exit={typeof window !== 'undefined' && window.innerWidth >= 768 
          ? { opacity: 0, scale: 0.95, y: 10 } 
          : { y: "100%" }}
        transition={typeof window !== 'undefined' && window.innerWidth >= 768 
          ? { duration: 0.25, ease: [0.16, 1, 0.3, 1] } 
          : { type: "spring", damping: 30, stiffness: 300 }}
        drag={typeof window !== 'undefined' && window.innerWidth < 768 ? "y" : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.05, bottom: 0.5 }}
        onDragEnd={handleDragEnd}
      >
        {/* Mobile Drag Handle */}
        <div className="flex justify-center pt-3 pb-2 md:hidden cursor-grab active:cursor-grabbing text-gray-300">
          <div className="w-10 h-1 rounded-full bg-current"></div>
        </div>
        
        {/* Extended background for bounce-up effect - ensures no gap when dragging up */}
        <div className="absolute top-[calc(100%-1px)] left-0 right-0 h-[200vh] bg-white md:hidden" />

        {/* Header */}
        <div className="px-6 pb-4 md:p-6 md:pb-2">
          {/* Prevent drag propagation from content */}
          <div onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="font-serif text-2xl font-bold text-gray-900 tracking-tight">{product.name}</h2>
                {product.description && (
                  <p className="text-sm text-gray-500 mt-1">{product.description}</p>
                )}
              </div>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors flex-shrink-0 ml-4"
                onClick={onClose}
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>
            
            <div className="flex items-baseline gap-2">
              <span className="text-primary font-bold text-xl font-display">¥{formatPriceDisplay(mFinalPrice)}</span>
              {mHasDis && (
                <span className="text-xs text-gray-400 line-through">¥{product.price}</span>
              )}
            </div>

            {modalRequiresReservation && (
              <div className="mt-1.5 text-xs text-blue-500 flex items-center gap-1">
                <i className="fas fa-clock text-xs"></i>
                <span>{formatReservationCutoff(modalReservationCutoff)}</span>
              </div>
            )}
            {modalRequiresReservation && modalReservationNote && (
              <div className="text-[11px] text-blue-500 mt-0.5 leading-snug break-words">{modalReservationNote}</div>
            )}
          </div>
        </div>

        {/* Scrollable Content Area - Stop Propagation to enable scroll instead of drag */}
        <div 
          className="px-6 py-4 md:px-6 md:pt-4 md:pb-6 space-y-6"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">选择规格</h3>
            <div className="flex flex-wrap gap-3 max-h-52 overflow-y-auto no-scrollbar">
              {(product.variants || [])
                .sort((a, b) => (b.stock || 0) - (a.stock || 0))
                .map((variant) => {
                  const isVariantOutOfStock = isModalNonSellable ? false : (variant.stock === 0);
                  const isSelected = selectedVariant === variant.id;
                  return (
                    <button
                      key={variant.id}
                      onClick={() => !isVariantOutOfStock && setSelectedVariant(variant.id)}
                      disabled={isVariantOutOfStock}
                      className={`px-5 py-2.5 rounded-xl text-sm font-display font-medium transition-all duration-200 border ${
                        isVariantOutOfStock
                          ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed line-through'
                          : isSelected
                            ? modalRequiresReservation
                              ? 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/25 ring-1 ring-blue-500 hover:translate-y-[-1px]'
                              : 'bg-primary text-white border-primary shadow-lg shadow-primary/25 ring-1 ring-primary hover:translate-y-[-1px]'
                            : modalRequiresReservation
                              ? 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-500/30 hover:bg-white hover:text-blue-500'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-primary/30 hover:bg-white hover:text-primary'
                      }`}
                    >
                      {variant.name}
                      {!isModalNonSellable && (
                        <span className={`ml-1.5 text-[10px] ${
                          isVariantOutOfStock ? 'text-gray-400' : isSelected ? 'text-white/80' : 'text-gray-400'
                        }`}>
                          {isVariantOutOfStock ? '售罄' : `库存${variant.stock}`}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Action Area */}
          <div className="pt-4 min-h-14">
            {selectedVariant ? (
              (() => {
                const qty = cartItemsMap[`${product.id}@@${selectedVariant}`] || 0;
                const stock = (product.variants || []).find(v => v.id === selectedVariant)?.stock ?? 0;
                const hasStock = isModalNonSellable || stock > 0;
                
                if (qty > 0) {
                  return (
                    <div className="flex items-center gap-4">
                      <div className="flex items-center bg-gray-50 rounded-2xl p-1 border border-gray-200 h-14">
                        <button
                          onClick={() => onUpdateQuantity(product.id, qty - 1, selectedVariant)}
                          className="w-12 h-full flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 hover:bg-white transition-colors"
                        >
                          <i className="fas fa-minus text-sm"></i>
                        </button>
                        <span className="w-8 text-center font-bold text-lg text-gray-900">{qty}</span>
                        <button
                          onClick={(e) => { onStartFly && onStartFly(e.currentTarget); onUpdateQuantity(product.id, qty + 1, selectedVariant); }}
                          disabled={!isModalNonSellable && qty >= stock}
                          className="w-12 h-full flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 hover:bg-white transition-colors disabled:opacity-50"
                        >
                          <i className="fas fa-plus text-sm"></i>
                        </button>
                      </div>
                      <button
                        onClick={(e) => { onStartFly && onStartFly(e.currentTarget); onAddToCart(product.id, selectedVariant); }}
                        className={`flex-1 h-14 ${modalRequiresReservation ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/25' : 'bg-primary hover:bg-primary/90 shadow-primary/25'} text-white font-bold rounded-2xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-3`}
                      >
                        <i className="fas fa-shopping-cart"></i>
                        <span>已选 {qty} 件 · ¥{formatPriceDisplay(mFinalPrice * qty)}</span>
                      </button>
                    </div>
                  );
                }
                return (
                  <button
                    onClick={(e) => { onStartFly && onStartFly(e.currentTarget); onAddToCart(product.id, selectedVariant); }}
                    disabled={!hasStock}
                    className={`w-full h-14 rounded-2xl text-base font-display font-bold transition-all duration-200 flex items-center justify-center gap-3 ${
                      !hasStock
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : modalRequiresReservation
                          ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]'
                          : 'bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25 active:scale-[0.98]'
                    }`}
                  >
                    <i className={`fas fa-shopping-cart ${!hasStock ? '' : 'group-hover:animate-bounce'}`}></i>
                    <span>{!hasStock ? '暂时缺货' : `加入购物车 · ¥${formatPriceDisplay(mFinalPrice)}`}</span>
                  </button>
                );
              })()
            ) : (
              <div className="h-14 flex items-center justify-center text-center text-gray-400 font-display text-sm">
                <i className="fas fa-hand-pointer text-sm align-middle mr-1"></i>
                请选择规格
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SpecSelectionModal;
