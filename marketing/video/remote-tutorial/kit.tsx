import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';

export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);
export const C = {
  deep: '#06241b',
  dark: '#0b3a2c',
  green: '#12805f',
  mint: '#2fd19b',
  gold: '#f3c04a',
  paper: '#fbf7ee',
  ink: '#102a22',
  red: '#ff5a4d',
};
export const font = `Cairo, CairoL, sans-serif`;

export const Fonts = () => (
  <style>{`
    @font-face{font-family:Cairo;font-weight:400;src:url(${staticFile('cairo-arabic-400-normal-DN15VWMM.woff2')}) format('woff2');unicode-range:U+0600-06FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE80-FEFC;}
    @font-face{font-family:Cairo;font-weight:700;src:url(${staticFile('cairo-arabic-700-normal-D3nDedWX.woff2')}) format('woff2');unicode-range:U+0600-06FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE80-FEFC;}
    @font-face{font-family:CairoL;font-weight:400;src:url(${staticFile('cairo-latin-400-normal-Dh7otpdh.woff2')}) format('woff2');}
    @font-face{font-family:CairoL;font-weight:700;src:url(${staticFile('cairo-latin-700-normal-C3GYtKbV.woff2')}) format('woff2');}
    *{box-sizing:border-box}
  `}</style>
);

/** ظهور ناعم: spring من frame محلي */
export const useSpring = (delay = 0, damping = 14, stiffness = 120) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping, stiffness, mass: 0.8 } });
};

export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const lerp = (f: number, a: number, b: number, from: number, to: number, e = ease) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: e });

/** عنوان كلمة كلمة بحركة دخول */
export const Words: React.FC<{ text: string; size?: number; delay?: number; color?: string; weight?: number; gap?: number; stagger?: number; style?: React.CSSProperties; hl?: Record<string, string> }> = ({ text, size = 120, delay = 0, color = '#fff', weight = 700, gap = 0.28, stagger = 4, style, hl = {} }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ direction: 'rtl', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: size * gap, rowGap: size * 0.05, fontFamily: font, fontWeight: weight, fontSize: size, lineHeight: 1.25, color, ...style }}>
      {text.split(' ').map((w, i) => {
        const p = spring({ frame: f - delay - i * stagger, fps, config: { damping: 13, stiffness: 130, mass: 0.7 } });
        return (
          <span key={i} style={{ display: 'inline-block', color: hl[w] ?? color, opacity: p, transform: `translateY(${(1 - p) * size * 0.5}px) scale(${0.7 + p * 0.3}) rotate(${(1 - p) * (i % 2 ? 4 : -4)}deg)`, filter: `blur(${(1 - p) * 10}px)` }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** خلفية متحركة: تدرّج أخضر + دوائر ضوء + نقاط عائمة */
export const Bg: React.FC<{ hue?: 'dark' | 'light'; speed?: number; glow?: string }> = ({ hue = 'dark', speed = 1, glow = C.mint }) => {
  const f = useCurrentFrame() * speed;
  const dots = Array.from({ length: 26 }, (_, i) => {
    const sx = (i * 137.5) % 1080;
    const sy = (i * 263.7) % 1920;
    const r = 4 + (i % 5) * 3;
    return { x: sx + Math.sin(f / 40 + i) * 30, y: (sy - f * (0.4 + (i % 4) * 0.25) + 1920 * 3) % 1920, r, o: 0.1 + (i % 4) * 0.06 };
  });
  return (
    <AbsoluteFill style={{ background: hue === 'dark' ? `radial-gradient(1200px 1200px at ${50 + Math.sin(f / 90) * 18}% ${30 + Math.cos(f / 110) * 10}%, ${C.dark}, ${C.deep} 70%)` : `linear-gradient(160deg, ${C.paper}, #e8f3ec)` }}>
      <div style={{ position: 'absolute', left: -200 + Math.sin(f / 70) * 80, top: 1000 + Math.cos(f / 60) * 60, width: 900, height: 900, borderRadius: '50%', background: `radial-gradient(circle, ${glow}33, transparent 65%)` }} />
      <div style={{ position: 'absolute', right: -260, top: -120 + Math.sin(f / 80) * 60, width: 800, height: 800, borderRadius: '50%', background: `radial-gradient(circle, ${C.gold}22, transparent 65%)` }} />
      {dots.map((d, i) => (
        <div key={i} style={{ position: 'absolute', left: d.x, top: d.y, width: d.r, height: d.r, borderRadius: '50%', background: hue === 'dark' ? '#fff' : C.green, opacity: d.o }} />
      ))}
    </AbsoluteFill>
  );
};

/** إطار جوال بلقطة شاشة، والتمرير بـ scroll (بكسل من لقطة 780×1688) */
export const Phone: React.FC<{ src: string; scroll?: number; width?: number; style?: React.CSSProperties; children?: React.ReactNode }> = ({ src, scroll = 0, width = 520, style, children }) => {
  const sc = width / 780;
  const h = 1688 * sc;
  const bezel = 16 * (width / 520);
  return (
    <div style={{ position: 'relative', width: width + bezel * 2, height: h * 0.9 + bezel * 2, borderRadius: 74 * (width / 520), background: 'linear-gradient(145deg,#2b3a35,#0a0f0d)', padding: bezel, boxShadow: '0 60px 120px #000a, 0 0 0 2px #ffffff22 inset', ...style }}>
      <div style={{ position: 'relative', width, height: h * 0.9, borderRadius: 60 * (width / 520), overflow: 'hidden', background: '#fff' }}>
        <Img src={staticFile(src)} style={{ position: 'absolute', left: 0, top: -scroll * sc, width, height: h }} />
        {children}
      </div>
      <div style={{ position: 'absolute', top: bezel + 14, left: '50%', width: 120 * (width / 520), height: 30 * (width / 520), marginLeft: -60 * (width / 520), borderRadius: 30, background: '#05110d' }} />
    </div>
  );
};

/** إطار لابتوب بلقطة 1600×1000 */
export const Laptop: React.FC<{ src: string; width?: number; style?: React.CSSProperties; zoom?: number; ox?: number; oy?: number }> = ({ src, width = 860, style, zoom = 1, ox = 0, oy = 0 }) => {
  const h = (width * 1000) / 1600;
  return (
    <div style={{ width, ...style }}>
      <div style={{ borderRadius: 26, padding: 14, background: 'linear-gradient(145deg,#2b3a35,#0a0f0d)', boxShadow: '0 50px 100px #000a' }}>
        <div style={{ width: width - 28, height: h - 17, overflow: 'hidden', borderRadius: 12, position: 'relative', background: '#fff' }}>
          <Img src={staticFile(src)} style={{ position: 'absolute', width: (width - 28) * zoom, left: ox, top: oy }} />
        </div>
      </div>
      <div style={{ height: 22, margin: '0 -36px', borderRadius: '0 0 40px 40px', background: 'linear-gradient(#bfc9c4,#7b8883)' }} />
    </div>
  );
};

export const Logo: React.FC<{ size?: number; style?: React.CSSProperties }> = ({ size = 300, style }) => (
  <Img src={staticFile('logo.png')} style={{ width: size, height: size, borderRadius: size * 0.22, boxShadow: `0 30px 80px #000a, 0 0 ${size * 0.5}px ${C.mint}55`, ...style }} />
);

/** شريحة نص صغيرة */
export const Chip: React.FC<{ text: string; color?: string; size?: number; style?: React.CSSProperties }> = ({ text, color = C.mint, size = 46, style }) => (
  <div style={{ direction: 'rtl', fontFamily: font, fontWeight: 700, fontSize: size, color: '#fff', padding: `${size * 0.22}px ${size * 0.7}px`, borderRadius: 999, background: `${color}33`, border: `3px solid ${color}`, boxShadow: `0 10px 40px ${color}44`, whiteSpace: 'nowrap', ...style }}>
    {text}
  </div>
);
