import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface DeckViewerPageProps {
  src: string;
  title: string;
}

// Unlisted deck: reachable by URL only. Keep it out of search indexes and set the tab title.
function useUnlistedHead(title: string) {
  useEffect(() => {
    const prevTitle = document.title;
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow, noarchive';
    document.head.appendChild(robots);
    document.title = title;
    return () => {
      document.title = prevTitle;
      robots.remove();
    };
  }, [title]);
}

function slideFromHash(count: number): number {
  const n = parseInt(window.location.hash.slice(1), 10);
  return Number.isFinite(n) && n >= 1 && n <= count ? n - 1 : 0;
}

function SlideCanvas({ doc, index, maxWidth, maxHeight, className }: {
  doc: PDFDocumentProxy;
  index: number;
  maxWidth: number;
  maxHeight: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (maxWidth <= 0 || maxHeight <= 0) return;
    let task: RenderTask | null = null;
    let cancelled = false;

    doc.getPage(index + 1).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const base = page.getViewport({ scale: 1 });
      const fit = Math.min(maxWidth / base.width, maxHeight / base.height);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: fit * dpr });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      task = page.render({ canvas, viewport });
      task.promise.catch(() => { /* cancelled by a newer render */ });
    });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, index, maxWidth, maxHeight]);

  return <canvas ref={canvasRef} className={className} aria-label={`Slide ${index + 1}`} />;
}

export function DeckViewerPage({ src, title }: DeckViewerPageProps) {
  useUnlistedHead(title);

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(0);
  const [showThumbs, setShowThumbs] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const count = doc?.numPages ?? 0;

  useEffect(() => {
    let cancelled = false;
    const loading = pdfjs.getDocument(src);
    loading.promise.then(
      (d) => {
        if (cancelled) return;
        setDoc(d);
        setCurrent(slideFromHash(d.numPages));
      },
      () => { if (!cancelled) setError(true); },
    );
    return () => {
      cancelled = true;
      loading.destroy();
    };
  }, [src]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  const go = useCallback((i: number) => {
    if (!count) return;
    setCurrent(Math.max(0, Math.min(count - 1, i)));
  }, [count]);

  // Keep the slide number in the URL so a specific slide can be linked.
  useEffect(() => {
    if (!count) return;
    window.history.replaceState(null, '', `#${current + 1}`);
  }, [current, count]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ':
          e.preventDefault(); go(current + 1); break;
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
          e.preventDefault(); go(current - 1); break;
        case 'Home': go(0); break;
        case 'End': go(count - 1); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'g': case 'G': setShowThumbs((s) => !s); break;
        case 'Escape': setShowThumbs(false); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, count, go, toggleFullscreen]);

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 40) go(current + (dx < 0 ? 1 : -1));
  };

  // Click the right two-thirds of a slide to advance, the left third to go back.
  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    go(current + (e.clientX - rect.left < rect.width / 3 ? -1 : 1));
  };

  return (
    <div ref={rootRef} className={`deck${isFullscreen ? ' is-fullscreen' : ''}`}>
      <header className="deck-bar">
        <span className="deck-title">{title}</span>
        <div className="deck-actions">
          <button type="button" className="deck-btn" onClick={() => setShowThumbs((s) => !s)}
            aria-pressed={showThumbs} title="All slides (G)">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z" /></svg>
            <span>Slides</span>
          </button>
          <a className="deck-btn" href={src} download={`${title}.pdf`} title="Download PDF">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10m0 0-4-4m4 4 4-4M4 17h12" /></svg>
            <span>Download</span>
          </a>
          <button type="button" className="deck-btn" onClick={toggleFullscreen} title="Fullscreen (F)">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              {isFullscreen
                ? <path d="M8 3v5H3M12 3v5h5M8 17v-5H3M12 17v-5h5" />
                : <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" />}
            </svg>
            <span>{isFullscreen ? 'Exit' : 'Present'}</span>
          </button>
        </div>
      </header>

      <main className="deck-main">
        {error && <p className="deck-status">This deck couldn't be loaded.</p>}
        {!doc && !error && <p className="deck-status">Loading…</p>}
        {doc && (
          <>
            <button type="button" className="deck-nav deck-nav-prev" onClick={() => go(current - 1)}
              disabled={current === 0} aria-label="Previous slide">‹</button>
            <div ref={stageRef} className="deck-stage" onClick={onStageClick}
              onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              <SlideCanvas doc={doc} index={current} maxWidth={stage.w} maxHeight={stage.h} className="deck-slide" />
            </div>
            <button type="button" className="deck-nav deck-nav-next" onClick={() => go(current + 1)}
              disabled={current === count - 1} aria-label="Next slide">›</button>
          </>
        )}
      </main>

      {doc && (
        <footer className="deck-foot">
          <div className="deck-progress" aria-hidden="true">
            <div style={{ width: `${((current + 1) / count) * 100}%` }} />
          </div>
          <span className="deck-count">{current + 1} / {count}</span>
        </footer>
      )}

      {doc && showThumbs && (
        <div className="deck-grid" role="dialog" aria-label="All slides" onClick={() => setShowThumbs(false)}>
          <div className="deck-grid-inner" onClick={(e) => e.stopPropagation()}>
            {Array.from({ length: count }, (_, i) => (
              <button key={i} type="button" className={`deck-thumb${i === current ? ' is-current' : ''}`}
                onClick={() => { go(i); setShowThumbs(false); }}>
                <SlideCanvas doc={doc} index={i} maxWidth={240} maxHeight={160} />
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExecutiveSummaryPage() {
  return <DeckViewerPage src="/decks/executive-summary.pdf" title="Hollywood Studios Executive Summary" />;
}
