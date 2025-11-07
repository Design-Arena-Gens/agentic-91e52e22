"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatMs(ms: number) {
  const s = (ms / 1000).toFixed(2);
  return `${s}s`;
}

type AnimationType = "fade" | "slide" | "zoom" | "typewriter";

type Settings = {
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  background: string;
  textColor: string;
  text: string;
  fontSize: number;
  animation: AnimationType;
};

const DEFAULTS: Settings = {
  width: 720,
  height: 1280,
  fps: 60,
  durationSeconds: 6,
  background: "#0c1326",
  textColor: "#e7ecff",
  text: "Hello, world!\nThis video was generated entirely in your browser.",
  fontSize: 48,
  animation: "fade",
};

export default function VideoGenerator() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [recording, setRecording] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMs, setProgressMs] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Ensure canvas size matches settings
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = settings.width;
    c.height = settings.height;
  }, [settings.width, settings.height]);

  function drawFrame(ctx: CanvasRenderingContext2D, tMs: number) {
    const { width, height, background, textColor, text, fontSize, animation } = settings;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, background);
    grad.addColorStop(1, shade(background, -12));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Animated decorative waves
    const waveCount = 3;
    for (let i = 0; i < waveCount; i++) {
      const phase = (tMs / 1000) * (0.2 + i * 0.05);
      const y = height * (0.2 + i * 0.2) + Math.sin(phase) * 10;
      const amplitude = 14 + i * 6;
      const step = 18;
      ctx.beginPath();
      for (let x = 0; x <= width; x += step) {
        const yy = y + Math.sin(phase + x * 0.01) * amplitude;
        if (x === 0) ctx.moveTo(0, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = withAlpha("#6ea8fe", 0.18 - i * 0.04);
      ctx.lineWidth = 2 + i;
      ctx.stroke();
    }

    // Text block
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;

    const lines = text.split(/\r?\n/);
    const totalLineHeight = fontSize * 1.3;
    const blockHeight = totalLineHeight * lines.length;

    let alpha = 1;
    let yOffset = 0;
    let scale = 1;

    const progress = clamp(tMs / (settings.durationSeconds * 1000), 0, 1);

    switch (settings.animation) {
      case "fade": {
        const inP = easeOutCubic(clamp(progress * 2, 0, 1));
        const outP = 1 - easeInCubic(clamp((progress - 0.5) * 2, 0, 1));
        alpha = inP * outP;
        break;
      }
      case "slide": {
        const direction = Math.sin(tMs * 0.002) > 0 ? 1 : -1;
        const p = easeInOutCubic(progress);
        yOffset = (1 - p) * direction * height * 0.25;
        alpha = 0.9;
        break;
      }
      case "zoom": {
        const p = easeOutBack(Math.min(progress * 1.2, 1));
        scale = 0.9 + p * 0.2;
        alpha = 0.95;
        break;
      }
      case "typewriter": {
        const totalChars = text.length;
        const charsToShow = Math.floor(progress * (totalChars + 6));
        const visible = text.slice(0, Math.max(0, charsToShow));
        const visibleLines = visible.split(/\r?\n/);
        drawLines(ctx, visibleLines, width / 2, height / 2 + yOffset, totalLineHeight, blockHeight, scale, alpha);
        return;
      }
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(width / 2, height / 2 + yOffset);
    ctx.scale(scale, scale);
    drawLines(ctx, lines, 0, 0, totalLineHeight, blockHeight, 1, 1);
    ctx.restore();

    // Progress bar
    const barMargin = 24;
    const barWidth = width - barMargin * 2;
    const barHeight = 6;
    const filled = Math.floor(barWidth * progress);
    ctx.fillStyle = withAlpha("#6ea8fe", 0.35);
    ctx.fillRect(barMargin, height - barMargin - barHeight, barWidth, barHeight);
    ctx.fillStyle = "#6ea8fe";
    ctx.fillRect(barMargin, height - barMargin - barHeight, filled, barHeight);
  }

  function startRecording() {
    setError(null);
    setBlobUrl(null);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const stream = canvas.captureStream(settings.fps);

    // Try preferred codecs
    const mimeCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=h264,aac' // often unsupported in browsers for MediaRecorder
    ];

    const mimeType = mimeCandidates.find(MediaRecorder.isTypeSupported) || '';

    try {
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      };

      const totalMs = settings.durationSeconds * 1000;
      startTimeRef.current = performance.now();
      setProgressMs(0);

      const tick = () => {
        const now = performance.now();
        const tMs = now - startTimeRef.current;
        setProgressMs(tMs);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        drawFrame(ctx, tMs);

        if (tMs < totalMs) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          stopRecording();
        }
      };

      setRecording(true);
      mr.start(100);
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      setError(e?.message || String(e));
      setRecording(false);
    }
  }

  function stopRecording() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    const mr = recorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.stop();
    }
    setRecording(false);
  }

  const estimatedSize = useMemo(() => {
    // Very rough estimate: ~120-300 KB/s depending on complexity
    const kbPerSecond = 220;
    return Math.round((settings.durationSeconds * kbPerSecond) / 1024 * 100) / 100;
  }, [settings.durationSeconds]);

  return (
    <div className="vstack" style={{ gap: 16 }}>
      <div className="hstack" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="vstack" style={{ minWidth: 280, flex: '1 1 320px' }}>
          <label>Text</label>
          <textarea
            rows={6}
            value={settings.text}
            onChange={(e) => setSettings(s => ({ ...s, text: e.target.value }))}
          />

          <div className="hstack" style={{ gap: 10 }}>
            <div className="vstack" style={{ flex: 1 }}>
              <label>Font size</label>
              <input
                type="number"
                min={12}
                max={120}
                value={settings.fontSize}
                onChange={(e) => setSettings(s => ({ ...s, fontSize: Number(e.target.value) }))}
              />
            </div>
            <div className="vstack" style={{ flex: 1 }}>
              <label>Animation</label>
              <select
                value={settings.animation}
                onChange={(e) => setSettings(s => ({ ...s, animation: e.target.value as AnimationType }))}
              >
                <option value="fade">Fade in/out</option>
                <option value="slide">Slide</option>
                <option value="zoom">Zoom</option>
                <option value="typewriter">Typewriter</option>
              </select>
            </div>
          </div>

          <div className="hstack" style={{ gap: 10 }}>
            <div className="vstack" style={{ flex: 1 }}>
              <label>Background</label>
              <input type="color" value={settings.background}
                onChange={(e) => setSettings(s => ({ ...s, background: e.target.value }))} />
            </div>
            <div className="vstack" style={{ flex: 1 }}>
              <label>Text color</label>
              <input type="color" value={settings.textColor}
                onChange={(e) => setSettings(s => ({ ...s, textColor: e.target.value }))} />
            </div>
          </div>

          <div className="hstack" style={{ gap: 10 }}>
            <div className="vstack" style={{ flex: 1 }}>
              <label>Width</label>
              <input type="number" min={256} max={1920} value={settings.width}
                onChange={(e) => setSettings(s => ({ ...s, width: Number(e.target.value) }))} />
            </div>
            <div className="vstack" style={{ flex: 1 }}>
              <label>Height</label>
              <input type="number" min={256} max={1920} value={settings.height}
                onChange={(e) => setSettings(s => ({ ...s, height: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="hstack" style={{ gap: 10 }}>
            <div className="vstack" style={{ flex: 1 }}>
              <label>Duration (seconds)</label>
              <input type="number" min={1} max={30} value={settings.durationSeconds}
                onChange={(e) => setSettings(s => ({ ...s, durationSeconds: Number(e.target.value) }))} />
            </div>
            <div className="vstack" style={{ flex: 1 }}>
              <label>FPS</label>
              <input type="number" min={15} max={60} value={settings.fps}
                onChange={(e) => setSettings(s => ({ ...s, fps: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="hstack" style={{ gap: 10, marginTop: 8 }}>
            {!recording && (
              <button onClick={startRecording}>Generate video</button>
            )}
            {recording && (
              <button className="secondary" onClick={stopRecording}>Stop</button>
            )}
            <span className="small">Approx size: ~{estimatedSize} MB</span>
          </div>

          {error && <div className="small" style={{ color: '#ffb4b4' }}>{error}</div>}
        </div>

        <div className="vstack" style={{ flex: '1 1 360px' }}>
          <label>Canvas (live preview)</label>
          <canvas ref={canvasRef} className="preview" style={{ aspectRatio: `${settings.width} / ${settings.height}` }} />

          <label>Result</label>
          <video ref={videoRef} className="preview" controls src={blobUrl ?? undefined} />

          <div className="hstack" style={{ justifyContent: 'space-between' }}>
            <span className="small">Progress: {formatMs(progressMs)} / {settings.durationSeconds}s</span>
            {blobUrl && (
              <a href={blobUrl} download="generated.webm">
                <button>Download</button>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  blockHeight: number,
  scale: number,
  alpha: number
) {
  ctx.save();
  ctx.translate(x, y - blockHeight / 2 + lineHeight / 2);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  for (let i = 0; i < lines.length; i++) {
    const yy = i * lineHeight;
    ctx.fillText(lines[i], 0, yy);
  }
  ctx.restore();
}

function withAlpha(hex: string, a: number) {
  // hex like #RRGGBB
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(a, 0, 1)})`;
}

function shade(hex: string, percent: number) {
  const { r, g, b } = hexToRgb(hex);
  const t = (100 + percent) / 100;
  const rr = clamp(Math.round(r * t), 0, 255);
  const gg = clamp(Math.round(g * t), 0, 255);
  const bb = clamp(Math.round(b * t), 0, 255);
  return rgbToHex(rr, gg, bb);
}

function hexToRgb(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(n: number) {
  return n.toString(16).padStart(2, '0');
}

// Easing utilities
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t: number) { return t * t * t; }
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
