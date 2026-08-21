import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const REORDER_DURATION_MS = 220;
const REORDER_EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const defaultGetId = (item) => item.id;

const restoreDraggedElement = (drag) => {
  if (!drag?.element) return;
  Object.entries(drag.originalInlineStyles).forEach(([property, value]) => {
    drag.element.style[property] = value;
  });
};

const rectSnapshot = (rect) => ({
  left: rect.left,
  top: rect.top,
  width: rect.width,
  height: rect.height,
  centerX: rect.left + rect.width / 2,
  centerY: rect.top + rect.height / 2,
});

const nearestItemId = (slotRects, centerX, centerY, axis) => {
  let nearestId = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  slotRects.forEach((rect, id) => {
    const xDistance = axis === 'y' ? 0 : centerX - rect.centerX;
    const yDistance = axis === 'x' ? 0 : centerY - rect.centerY;
    const distance = xDistance * xDistance + yDistance * yDistance;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = id;
    }
  });
  return nearestId;
};

export function useSmoothPointerReorder({
  items,
  setItems,
  getId = defaultGetId,
  axis = 'both',
  disabled = false,
  onCommit,
}) {
  const containerRef = useRef(null);
  const itemElementsRef = useRef(new Map());
  const itemsRef = useRef(items);
  const onCommitRef = useRef(onCommit);
  const dragRef = useRef(null);
  const pendingFlipRef = useRef(null);
  const animationsRef = useRef(new Set());
  const [draggingId, setDraggingId] = useState(null);

  itemsRef.current = items;
  onCommitRef.current = onCommit;

  const cancelItemAnimations = useCallback(() => {
    animationsRef.current.forEach((animation) => animation.cancel());
    animationsRef.current.clear();
  }, []);

  const measureSlots = useCallback(() => {
    const slots = new Map();
    itemElementsRef.current.forEach((element, id) => {
      const rect = element.getBoundingClientRect();
      const drag = dragRef.current;
      if (drag && id === drag.id) {
        slots.set(id, {
          ...rectSnapshot(rect),
          left: rect.left - drag.renderX,
          top: rect.top - drag.renderY,
          centerX: rect.left - drag.renderX + rect.width / 2,
          centerY: rect.top - drag.renderY + rect.height / 2,
        });
      } else {
        slots.set(id, rectSnapshot(rect));
      }
    });
    return slots;
  }, []);

  useLayoutEffect(() => {
    const pendingFlip = pendingFlipRef.current;
    if (!pendingFlip) return;
    pendingFlipRef.current = null;

    const drag = dragRef.current;
    const finalSlots = new Map();
    itemElementsRef.current.forEach((element, id) => {
      const rect = element.getBoundingClientRect();
      if (drag && id === drag.id) {
        finalSlots.set(id, {
          ...rectSnapshot(rect),
          left: rect.left - drag.renderX,
          top: rect.top - drag.renderY,
          centerX: rect.left - drag.renderX + rect.width / 2,
          centerY: rect.top - drag.renderY + rect.height / 2,
        });
        const xCorrection = pendingFlip.dragVisual.left - rect.left;
        const yCorrection = pendingFlip.dragVisual.top - rect.top;
        drag.correctionX += xCorrection;
        drag.correctionY += yCorrection;
        drag.renderX += xCorrection;
        drag.renderY += yCorrection;
        element.style.transform = `translate3d(${drag.renderX}px, ${drag.renderY}px, 0)`;
        return;
      }

      const finalRect = rectSnapshot(rect);
      finalSlots.set(id, finalRect);
      const previousRect = pendingFlip.previousRects.get(id);
      if (!previousRect) return;
      const deltaX = previousRect.left - finalRect.left;
      const deltaY = previousRect.top - finalRect.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;
      const animation = element.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: REORDER_DURATION_MS, easing: REORDER_EASING },
      );
      animationsRef.current.add(animation);
      animation.finished
        .catch(() => {})
        .finally(() => animationsRef.current.delete(animation));
    });
    if (drag) drag.slotRects = finalSlots;
  }, [items]);

  useEffect(() => () => {
    cancelItemAnimations();
    const drag = dragRef.current;
    restoreDraggedElement(drag);
  }, [cancelItemAnimations]);

  const registerItem = useCallback((id, element) => {
    if (element) itemElementsRef.current.set(id, element);
    else itemElementsRef.current.delete(id);
  }, []);

  const finishDrag = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const container = containerRef.current;
    dragRef.current = null;
    if (container?.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }

    setDraggingId(null);
    const element = drag.element;
    const currentTransform = `translate3d(${drag.renderX}px, ${drag.renderY}px, 0)`;
    element.style.transform = drag.originalInlineStyles.transform;
    const snapAnimation = element.animate(
      [{ transform: currentTransform }, { transform: 'translate3d(0, 0, 0)' }],
      { duration: REORDER_DURATION_MS, easing: REORDER_EASING },
    );
    animationsRef.current.add(snapAnimation);
    snapAnimation.finished
      .catch(() => {})
      .finally(() => {
        animationsRef.current.delete(snapAnimation);
        restoreDraggedElement(drag);
      });

    if (drag.changed) {
      Promise.resolve(onCommitRef.current?.(itemsRef.current)).catch(() => {});
    }
  }, []);

  const handlePointerDown = useCallback((event, id) => {
    if (disabled || dragRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const element = itemElementsRef.current.get(id);
    const container = containerRef.current;
    if (!element || !container) return;

    event.preventDefault();
    cancelItemAnimations();
    const itemRect = element.getBoundingClientRect();
    dragRef.current = {
      id,
      element,
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      offsetX: event.clientX - itemRect.left,
      offsetY: event.clientY - itemRect.top,
      width: itemRect.width,
      height: itemRect.height,
      correctionX: 0,
      correctionY: 0,
      renderX: 0,
      renderY: 0,
      changed: false,
      slotRects: measureSlots(),
      originalInlineStyles: {
        transform: element.style.transform,
        transition: element.style.transition,
        position: element.style.position,
        zIndex: element.style.zIndex,
        pointerEvents: element.style.pointerEvents,
        willChange: element.style.willChange,
      },
    };
    element.style.transition = 'none';
    element.style.position = 'relative';
    element.style.zIndex = '30';
    element.style.pointerEvents = 'none';
    element.style.willChange = 'transform';
    container.setPointerCapture(event.pointerId);
    setDraggingId(id);
  }, [cancelItemAnimations, disabled, measureSlots]);

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();

    const pointerDeltaX = axis === 'y' ? 0 : event.clientX - drag.startPointerX;
    const pointerDeltaY = axis === 'x' ? 0 : event.clientY - drag.startPointerY;
    drag.renderX = pointerDeltaX + drag.correctionX;
    drag.renderY = pointerDeltaY + drag.correctionY;
    drag.element.style.transform = `translate3d(${drag.renderX}px, ${drag.renderY}px, 0)`;

    const dragCenterX = event.clientX - drag.offsetX + drag.width / 2;
    const dragCenterY = event.clientY - drag.offsetY + drag.height / 2;
    const targetId = nearestItemId(drag.slotRects, dragCenterX, dragCenterY, axis);
    if (targetId == null || targetId === drag.id) return;

    const currentItems = itemsRef.current;
    const fromIndex = currentItems.findIndex((item) => getId(item) === drag.id);
    const toIndex = currentItems.findIndex((item) => getId(item) === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const previousRects = new Map();
    itemElementsRef.current.forEach((element, id) => {
      if (id !== drag.id) previousRects.set(id, rectSnapshot(element.getBoundingClientRect()));
    });
    const dragVisual = rectSnapshot(drag.element.getBoundingClientRect());
    cancelItemAnimations();

    const reordered = [...currentItems];
    [reordered[fromIndex], reordered[toIndex]] = [reordered[toIndex], reordered[fromIndex]];
    drag.changed = true;
    itemsRef.current = reordered;
    pendingFlipRef.current = { previousRects, dragVisual };
    setItems(reordered);
  }, [axis, cancelItemAnimations, getId, setItems]);

  const containerProps = {
    ref: containerRef,
    onPointerMove: handlePointerMove,
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
    onLostPointerCapture: finishDrag,
  };

  const getItemProps = useCallback((item) => {
    const id = getId(item);
    return {
      ref: (element) => registerItem(id, element),
      'data-reorder-id': id,
    };
  }, [getId, registerItem]);

  const getHandleProps = useCallback((item) => ({
    onPointerDown: (event) => handlePointerDown(event, getId(item)),
    'aria-grabbed': draggingId === getId(item),
  }), [draggingId, getId, handlePointerDown]);

  return { containerProps, getHandleProps, getItemProps, draggingId };
}

export default useSmoothPointerReorder;
