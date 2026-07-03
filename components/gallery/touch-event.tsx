'use client';

import { useEffect, useRef } from 'react';

export function useGalleryTouchEvents() {
  const containerRef = useRef<HTMLElement | null>(null);
  const activeCard = useRef<Element | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getCard = (target: EventTarget | null) => {
      const card =
        target instanceof HTMLElement ? target.closest('.gallery-card') : null;

      return card && container.contains(card) ? card : null;
    };

    const activateCard = (card: Element | null) => {
      if (!card || card === activeCard.current) return;

      activeCard.current?.classList.remove('touch-active');
      card.classList.add('touch-active');
      activeCard.current = card;
    };

    const deactivateCard = () => {
      if (activeCard.current) {
        activeCard.current.classList.remove('touch-active');
        activeCard.current = null;
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      const card = getCard(event.target);
      if (card) {
        activateCard(card);
      }
    };

    const handleTouchEnd = () => {
      deactivateCard();
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) {
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const card = getCard(element);

        if (!card) {
          deactivateCard();
          return;
        }

        if (card !== activeCard.current) {
          activateCard(card);
        }
      }
    };

    container.addEventListener('touchstart', handleTouchStart, {
      passive: true,
    });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, {
      passive: true,
    });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  return containerRef;
}
