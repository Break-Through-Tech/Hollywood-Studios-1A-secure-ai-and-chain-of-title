import { useMemo } from 'react';

function seededRandom(seed: number) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

interface Props {
  color?: string;
  dotColor?: string;
  count?: number;
}

export function ConstellationBg({ color = 'rgba(0,0,0,0.04)', dotColor = 'rgba(0,0,0,0.06)', count = 40 }: Props) {
  const data = useMemo(() => {
    const pts = Array.from({ length: count }, (_, i) => ({
      x: seededRandom(i * 2) * 100,
      y: seededRandom(i * 2 + 1) * 100,
    }));
    const lns: { a: typeof pts[0]; b: typeof pts[0]; o: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 18) lns.push({ a: pts[i], b: pts[j], o: (1 - d / 18) * 0.6 });
      }
    }
    return { pts, lns };
  }, [count]);

  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {data.lns.map((l, i) => (
        <line key={`l${i}`} x1={`${l.a.x}%`} y1={`${l.a.y}%`} x2={`${l.b.x}%`} y2={`${l.b.y}%`}
          stroke={color} opacity={l.o} strokeWidth="0.8" />
      ))}
      {data.pts.map((p, i) => (
        <circle key={`p${i}`} cx={`${p.x}%`} cy={`${p.y}%`} r="1.2" fill={dotColor} />
      ))}
    </svg>
  );
}
