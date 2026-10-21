import { useCallback, useEffect, useRef } from 'react';

interface TrackingOptions {
  enabled: boolean;
  slug?: string;
  viewerEmail?: string;
  viewerName?: string;
  /** session already created server-side (e.g. by tracking/unlock) — skips the start call */
  sessionKey?: string | null;
}

interface TrackingState {
  sessionKey: string | null;
  seconds: number;
  maxScrollPct: number;
  pagesSeen: Set<number>;
  totalPages: number;
  currentPage: number | null;
  pageTimes: Record<string, number>;
}

export function useViewTracking({ enabled, slug, viewerEmail, viewerName, sessionKey }: TrackingOptions) {
  const state = useRef<TrackingState>({
    sessionKey: null,
    seconds: 0,
    maxScrollPct: 0,
    pagesSeen: new Set(),
    totalPages: 0,
    currentPage: null,
    pageTimes: {},
  });

  const buildPayload = useCallback(() => {
    const s = state.current;
    return JSON.stringify({
      sessionKey: s.sessionKey,
      durationSeconds: s.seconds,
      maxScrollPct: s.maxScrollPct,
      pagesViewed: s.pagesSeen.size,
      totalPages: s.totalPages,
      pageTimes: s.pageTimes,
    });
  }, []);

  useEffect(() => {
    if (!enabled || (!slug && !sessionKey)) return;
    let cancelled = false;

    if (sessionKey) {
      state.current.sessionKey = sessionKey;
    } else {
      fetch('/api/vault/tracking/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, viewerEmail, viewerName }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (!cancelled && data?.sessionKey) state.current.sessionKey = data.sessionKey; })
        .catch(() => {});
    }

    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const s = state.current;
      s.seconds += 1;
      if (s.currentPage !== null) {
        const key = String(s.currentPage);
        s.pageTimes[key] = (s.pageTimes[key] || 0) + 1;
      }
    }, 1000);

    const sendBeat = () => {
      if (!state.current.sessionKey) return;
      fetch('/api/vault/tracking/beat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildPayload(),
      }).catch(() => {});
    };
    const beat = setInterval(sendBeat, 15_000);

    const flush = () => {
      if (!state.current.sessionKey) return;
      navigator.sendBeacon('/api/vault/tracking/beat', buildPayload());
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(tick);
      clearInterval(beat);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [enabled, slug, viewerEmail, viewerName, sessionKey, buildPayload]);

  const reportScroll = useCallback((pct: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    if (clamped > state.current.maxScrollPct) state.current.maxScrollPct = clamped;
  }, []);

  const reportPage = useCallback((pageIndex: number, totalPages: number) => {
    state.current.currentPage = pageIndex;
    state.current.totalPages = totalPages;
    state.current.pagesSeen.add(pageIndex);
  }, []);

  const getSessionKey = useCallback(() => state.current.sessionKey, []);

  return { reportScroll, reportPage, getSessionKey };
}
