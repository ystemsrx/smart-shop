import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import ProductDetailSlide from './ProductDetailSlide';

const ProductDetailModal = ({
  product,
  products = [], // List of all products for swiping
  isOpen,
  onClose,
  onAddToCart,
  onUpdateQuantity,
  cartItemsMap = {},
  onStartFly,
  isLoading = false,
  user,
  onSwitchProduct, // function(direction: 'next'|'prev')
}) => {
  const y = useMotionValue(0);
  const containerRef = useRef(null);
  const [height, setHeight] = useState(0);
  const [isSwipeTransitioning, setIsSwipeTransitioning] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : false
  ));
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(min-width: 768px)');
    const syncMode = () => setIsDesktop(media.matches);
    syncMode();
    if (media.addEventListener) {
      media.addEventListener('change', syncMode);
      return () => media.removeEventListener('change', syncMode);
    }
    media.addListener(syncMode);
    return () => media.removeListener(syncMode);
  }, []);

  // Measure window height for snap calculations
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHeight(window.innerHeight);
      const handleResize = () => setHeight(window.innerHeight);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Prevent background scrolling
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Use useLayoutEffect to reset Y INSTANTLY when product changes.
  // This happens after React render but before browser paint, preventing the "flash" of the wrong product.
  // We need to check if product has actually changed ID.
  const prevProductId = useRef(product?.id);
  
  useLayoutEffect(() => {
    if (product?.id !== prevProductId.current) {
      prevProductId.current = product?.id;
      // Instant reset logic: since prop changed, the 'Center' slide is now the new product.
      // We must render at 0.
      y.stop(); // Stop any ongoing animation
      // Important: Use jump(0) or set(0) immediately.
      y.set(0); 
    }
  }, [product?.id, y]);

  // Determine Prev, Current, Next products
  // IMPORTANT: We need MEMOIZED references or stale logic here to prevent flickering during re-renders?
  // Actually, standard calculate is fine, but we must ensure we don't switch "Current" until parent updates "product"
  
  let prevProduct = null;
  let nextProduct = null;

  if (product && products.length > 0) {
    const currentIndex = products.findIndex(p => p.id === product.id);
    if (currentIndex !== -1) {
      const prevIndex = (currentIndex - 1 + products.length) % products.length;
      const nextIndex = (currentIndex + 1) % products.length;
      prevProduct = products[prevIndex];
      nextProduct = products[nextIndex];
      
      // Edge case: single product list
      if (products.length === 1) {
        prevProduct = null;
        nextProduct = null;
      }
    }
  }
  
  // Create stable keys for preventing remounts of SLIDES but ensure content updates
  // We use product ID as key to FORCE remount of internal slide content when it changes position
  // This might seem counter-intuitive to "prevent flicker", but for "ProductDetailSlide" internal "RetryImage", 
  // we WANT it to reset. 
  // However, the CONTAINER should not unmount.

  const handleDragEnd = async (e, { offset, velocity }) => {
    const viewportHeight = height || (typeof window !== 'undefined' ? window.innerHeight : 0);
    if (isSwipeTransitioning || !viewportHeight) return;

    const swipeThreshold = Math.min(Math.max(viewportHeight * 0.18, 72), 180); // More sensitive across devices
    const velocityThreshold = 240;
    
    // Snap Up (Next Product)
    // Moving finger UP means offset.y is NEGATIVE (content moves up)
    if (
      (offset.y < -swipeThreshold || velocity.y < -velocityThreshold) &&
      nextProduct
    ) {
      setIsSwipeTransitioning(true);
      try {
        await animate(y, -viewportHeight, { duration: 0.2, ease: [0.22, 1, 0.36, 1] });
        onSwitchProduct && onSwitchProduct('next');
      } finally {
        y.stop();
        y.set(0);
        if (isMountedRef.current) setIsSwipeTransitioning(false);
      }
    }
    // Snap Down (Prev Product)
    // Moving finger DOWN means offset.y is POSITIVE
    else if (
      (offset.y > swipeThreshold || velocity.y > velocityThreshold) &&
      prevProduct
    ) {
      setIsSwipeTransitioning(true);
      try {
        await animate(y, viewportHeight, { duration: 0.2, ease: [0.22, 1, 0.36, 1] });
        onSwitchProduct && onSwitchProduct('prev');
      } finally {
        y.stop();
        y.set(0);
        if (isMountedRef.current) setIsSwipeTransitioning(false);
      }
    }
    // Revert
    else {
      animate(y, 0, { duration: 0.16, ease: [0.22, 1, 0.36, 1] });
    }
  };

  // Prepare slides to render
  const visibleSlides = [];
  
  if (prevProduct) {
    visibleSlides.push({
      ...prevProduct,
      key: (products.length === 2 && prevProduct.id === nextProduct?.id) 
           ? `${prevProduct.id}_prev` 
           : prevProduct.id,
      position: '-100%'
    });
  }
  
  if (product) {
    visibleSlides.push({
      ...product,
      key: product.id,
      position: '0%'
    });
  }
  
  if (nextProduct) {
    visibleSlides.push({
      ...nextProduct,
      key: nextProduct.id,
      position: '100%'
    });
  }

  const dragDistanceLimit = height || (typeof window !== 'undefined' ? window.innerHeight : 0);

  return (
    <AnimatePresence>
      {isOpen && product && (
        isDesktop ? (
          <motion.div
            key="modal-container-desktop"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-3xl shadow-2xl overflow-hidden w-[min(92vw,860px)]"
            >
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-30 w-10 h-10 flex items-center justify-center bg-white/80 backdrop-blur rounded-full hover:bg-white text-[#1c1917] transition-colors shadow-sm shrink-0"
                aria-label="关闭"
              >
                <i className="fas fa-times text-lg"></i>
              </button>
              <ProductDetailSlide
                product={product}
                onClose={onClose}
                onAddToCart={onAddToCart}
                onUpdateQuantity={onUpdateQuantity}
                cartItemsMap={cartItemsMap}
                onStartFly={onStartFly}
                isLoading={isLoading}
                user={user}
                desktopMode
              />
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="modal-container-mobile"
            className="fixed inset-0 z-50 bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Draggable Container */}
            <motion.div
              ref={containerRef}
              className="absolute inset-0 w-full h-full"
              style={{ y, touchAction: "none" }}
              drag={isSwipeTransitioning ? false : "y"}
              dragConstraints={{ top: nextProduct ? -dragDistanceLimit : 0, bottom: prevProduct ? dragDistanceLimit : 0 }}
              dragElastic={0.1}
              dragMomentum={false}
              onDragStart={() => y.stop()}
              onDragEnd={handleDragEnd}
            >
              {visibleSlides.map((slide) => (
                <div
                  key={slide.key}
                  className="absolute left-0 w-full h-full"
                  style={{ top: slide.position }}
                >
                  <ProductDetailSlide
                    product={slide}
                    onClose={onClose}
                    onAddToCart={onAddToCart}
                    onUpdateQuantity={onUpdateQuantity}
                    cartItemsMap={cartItemsMap}
                    onStartFly={onStartFly}
                    isLoading={isLoading}
                    user={user}
                  />
                </div>
              ))}
            </motion.div>
          </motion.div>
        )
      )}
    </AnimatePresence>
  );
};

export default ProductDetailModal;
