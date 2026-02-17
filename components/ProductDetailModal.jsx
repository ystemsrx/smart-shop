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
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [isSwipeTransitioning, setIsSwipeTransitioning] = useState(false);
  const [isGestureClosing, setIsGestureClosing] = useState(false);
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
      const syncViewport = () => {
        setWidth(window.innerWidth);
        setHeight(window.innerHeight);
      };
      syncViewport();
      const handleResize = () => syncViewport();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setIsGestureClosing(false);
    if (containerRef.current) {
      containerRef.current.style.pointerEvents = 'auto';
      if (containerRef.current.parentElement) {
        containerRef.current.parentElement.style.pointerEvents = 'auto';
      }
    }
    x.stop();
    y.stop();
    x.set(0);
    y.set(0);
  }, [isOpen, x, y]);

  const triggerGestureClose = () => {
    if (containerRef.current) {
      containerRef.current.style.pointerEvents = 'none';
      if (containerRef.current.parentElement) {
        containerRef.current.parentElement.style.pointerEvents = 'none';
      }
    }
    setIsGestureClosing(true);
    onClose && onClose();
  };

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
    if (!isOpen || !product?.id) return;
    if (product.id !== prevProductId.current) {
      prevProductId.current = product?.id;
      // Instant reset logic: since prop changed, the 'Center' slide is now the new product.
      // We must render at 0.
      x.stop();
      y.stop(); // Stop any ongoing animation
      // Important: Use jump(0) or set(0) immediately.
      x.set(0);
      y.set(0); 
    }
  }, [isOpen, product?.id, x, y]);

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
    const viewportWidth = width || (typeof window !== 'undefined' ? window.innerWidth : 0);
    const viewportHeight = height || (typeof window !== 'undefined' ? window.innerHeight : 0);
    if (isSwipeTransitioning || !viewportHeight || !viewportWidth) return;

    const absOffsetX = Math.abs(offset.x);
    const absOffsetY = Math.abs(offset.y);
    const isHorizontalSwipe = absOffsetX > 12 && absOffsetX > absOffsetY * 1.1;

    if (isHorizontalSwipe) {
      const closeThreshold = Math.min(Math.max(viewportWidth * 0.24, 80), 220);
      const closeVelocityThreshold = 320;

      if (offset.x > closeThreshold || velocity.x > closeVelocityThreshold) {
        triggerGestureClose();
      } else {
        animate(x, 0, { duration: 0.18, ease: [0.22, 1, 0.36, 1] });
        animate(y, 0, { duration: 0.18, ease: [0.22, 1, 0.36, 1] });
      }
      return;
    }

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
        x.stop();
        y.stop();
        x.set(0);
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
        x.stop();
        y.stop();
        x.set(0);
        y.set(0);
        if (isMountedRef.current) setIsSwipeTransitioning(false);
      }
    }
    // Revert
    else {
      animate(x, 0, { duration: 0.16, ease: [0.22, 1, 0.36, 1] });
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

  const dragDistanceLimitY = height || (typeof window !== 'undefined' ? window.innerHeight : 0);
  const dragDistanceLimitX = width || (typeof window !== 'undefined' ? window.innerWidth : 0);

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
            className={`fixed inset-0 z-50 bg-transparent ${isGestureClosing ? 'pointer-events-none' : 'pointer-events-auto'}`}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%', pointerEvents: 'none' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Draggable Container */}
            <motion.div
              ref={containerRef}
              className={`absolute inset-0 w-full h-full ${isGestureClosing ? 'pointer-events-none' : 'pointer-events-auto'}`}
              style={{ x, y, touchAction: 'none' }}
              drag={isSwipeTransitioning || isGestureClosing ? false : true}
              dragConstraints={{
                left: 0,
                right: dragDistanceLimitX,
                top: nextProduct ? -dragDistanceLimitY : 0,
                bottom: prevProduct ? dragDistanceLimitY : 0
              }}
              dragDirectionLock
              dragElastic={{ left: 0, right: 0.18, top: 0.1, bottom: 0.1 }}
              dragMomentum={false}
              onDragStart={() => {
                x.stop();
                y.stop();
              }}
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
