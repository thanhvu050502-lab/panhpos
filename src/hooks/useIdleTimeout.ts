import { useEffect, useRef } from 'react';

/**
 * Auto-logout after `minutes` of inactivity. Activity = mouse, keyboard,
 * touch, or the tab becoming visible again. Pauses the countdown when the
 * tab is hidden so a backgrounded tab doesn't trigger logout the moment
 * the user comes back.
 *
 * Pass `enabled = false` (e.g. when nobody is logged in) to disable.
 */
export function useIdleTimeout(enabled: boolean, minutes: number, onIdle: () => void) {
  const timerRef = useRef<number | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const ms = Math.max(1, minutes) * 60_000;

    const reset = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (document.visibilityState === 'hidden') return; // pause while hidden
      timerRef.current = window.setTimeout(() => onIdleRef.current(), ms);
    };

    const events: Array<keyof DocumentEventMap | keyof WindowEventMap> = [
      'mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll',
    ];
    events.forEach(e => window.addEventListener(e, reset, { passive: true } as AddEventListenerOptions));
    document.addEventListener('visibilitychange', reset);

    reset();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      events.forEach(e => window.removeEventListener(e, reset as EventListener));
      document.removeEventListener('visibilitychange', reset);
    };
  }, [enabled, minutes]);
}
