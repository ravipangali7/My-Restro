import { useCallback, useEffect, useRef } from "react";

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function playAlarmPulse(ctx: AudioContext): void {
  const t0 = ctx.currentTime;
  const beep = (start: number, freq: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.15);
  };
  beep(t0, 880);
  beep(t0 + 0.18, 660);
}

/**
 * Repeating alarm when new **pending** orders appear while the kitchen portal is open.
 * Does not sound for orders that were already pending on first observed snapshot (avoids
 * blasting on page load). Stops as soon as every alarming order leaves `pending`
 * (accepted, rejected, etc.).
 */
export function useKitchenPendingOrderAlarm(
  orders: { id: number; status: string }[] | undefined,
  enabled: boolean,
  restaurantId: number | null,
): void {
  const primedRef = useRef(false);
  const lastPendingRef = useRef<Set<number>>(new Set());
  const alarmingIdsRef = useRef<Set<number>>(new Set());
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restaurantRef = useRef(restaurantId);

  const stopInterval = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const ensureCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    return ctxRef.current;
  }, []);

  const startOrContinueAlarm = useCallback(() => {
    if (intervalRef.current != null) return;
    const ctx = ensureCtx();
    if (!ctx) return;
    void ctx.resume().catch(() => {});
    intervalRef.current = setInterval(() => {
      if (alarmingIdsRef.current.size === 0) {
        stopInterval();
        return;
      }
      const c = ensureCtx();
      if (c) playAlarmPulse(c);
    }, 900);
  }, [ensureCtx, stopInterval]);

  useEffect(() => {
    if (!enabled) return;
    const onPointerDown = () => {
      void ensureCtx()?.resume();
    };
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [enabled, ensureCtx]);

  useEffect(() => {
    if (restaurantRef.current !== restaurantId) {
      restaurantRef.current = restaurantId;
      primedRef.current = false;
      lastPendingRef.current = new Set();
      alarmingIdsRef.current = new Set();
      stopInterval();
    }
  }, [restaurantId, stopInterval]);

  useEffect(() => {
    if (!enabled || restaurantId == null) {
      if (!enabled) alarmingIdsRef.current = new Set();
      stopInterval();
      return;
    }
    if (orders == null) return;

    const currPending = new Set(
      orders.filter((o) => o.status === "pending").map((o) => o.id),
    );

    if (!primedRef.current) {
      lastPendingRef.current = currPending;
      primedRef.current = true;
      return;
    }

    const prev = lastPendingRef.current;
    for (const id of currPending) {
      if (!prev.has(id)) alarmingIdsRef.current.add(id);
    }
    lastPendingRef.current = new Set(currPending);

    for (const id of [...alarmingIdsRef.current]) {
      if (!currPending.has(id)) alarmingIdsRef.current.delete(id);
    }

    if (alarmingIdsRef.current.size > 0) {
      const c = ensureCtx();
      if (c) {
        void c.resume().then(() => {
          playAlarmPulse(c);
        });
      }
      startOrContinueAlarm();
    } else {
      stopInterval();
    }
  }, [orders, enabled, restaurantId, ensureCtx, startOrContinueAlarm, stopInterval]);

  useEffect(() => {
    return () => {
      stopInterval();
      try {
        void ctxRef.current?.close();
      } catch {
        /* ignore */
      }
      ctxRef.current = null;
    };
  }, [stopInterval]);
}
