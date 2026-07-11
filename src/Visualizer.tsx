import { useEffect, useRef } from "react";

interface VisualizerProps {
  active: boolean;
  progress?: number;
  mode?: "bars" | "wave";
  compact?: boolean;
  className?: string;
  stabilityMode?: boolean;
}

function pseudoNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  const roundRect = context.roundRect as
    | ((x: number, y: number, w: number, h: number, radii?: number) => void)
    | undefined;

  if (typeof roundRect === "function") {
    roundRect.call(context, x, y, width, height, safeRadius);
    return;
  }

  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
}

export function Visualizer({
  active,
  progress = 0,
  mode = "bars",
  compact = false,
  className = "",
  stabilityMode = true,
}: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressRef = useRef(progress);
  const activeRef = useRef(active);

  progressRef.current = progress;
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    let frame = 0;
    let animationId = 0;
    let disposed = false;
    let lastPaint = 0;
    let visible = document.visibilityState !== "hidden";
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const targetFps = reduceMotion ? 8 : stabilityMode ? 24 : 45;
    const frameInterval = 1000 / targetFps;

    const resize = () => {
      if (disposed) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, stabilityMode ? 1.5 : 2);
      const nextWidth = Math.max(1, Math.floor(rect.width * ratio));
      const nextHeight = Math.max(1, Math.floor(rect.height * ratio));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
    };

    const draw = (now: number) => {
      if (disposed) return;
      animationId = window.requestAnimationFrame(draw);
      if (!visible || now - lastPaint < frameInterval) return;
      lastPaint = now;

      try {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width <= 1 || height <= 1) return;
        context.clearRect(0, 0, width, height);

        const styles = getComputedStyle(canvas);
        const primary = styles.getPropertyValue("--visualizer-primary").trim() || "#4aa3ff";
        const secondary = styles.getPropertyValue("--visualizer-secondary").trim() || "#7dd3fc";
        const isActive = activeRef.current;
        const alpha = isActive ? 0.9 : 0.25;
        const currentProgress = progressRef.current;
        const phase = reduceMotion ? currentProgress * 4 : frame * 0.055 + currentProgress * 2;

        if (mode === "wave") {
          const gradient = context.createLinearGradient(0, 0, width, 0);
          gradient.addColorStop(0, secondary);
          gradient.addColorStop(0.48, primary);
          gradient.addColorStop(1, secondary);
          context.strokeStyle = gradient;
          context.globalAlpha = alpha;
          context.lineWidth = compact ? 1.5 : 2.2;
          context.lineCap = "round";
          context.beginPath();
          const xStep = stabilityMode ? 5 : 3;
          for (let x = 0; x <= width; x += xStep) {
            const normalized = x / Math.max(width, 1);
            const envelope = Math.sin(Math.PI * normalized);
            const movement = isActive ? 1 : 0.22;
            const y =
              height / 2 +
              Math.sin(normalized * 18 + phase) * height * 0.18 * envelope * movement +
              Math.sin(normalized * 37 - phase * 1.3) * height * 0.07 * envelope * movement;
            if (x === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.stroke();
        } else {
          const barCount = compact ? (stabilityMode ? 20 : 28) : stabilityMode ? 36 : 52;
          const gap = compact ? 2 : 3;
          const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);
          const gradient = context.createLinearGradient(0, height, 0, 0);
          gradient.addColorStop(0, primary);
          gradient.addColorStop(1, secondary);
          context.fillStyle = gradient;
          context.globalAlpha = alpha;

          for (let index = 0; index < barCount; index += 1) {
            const position = index / Math.max(barCount - 1, 1);
            const envelope = 0.38 + Math.sin(Math.PI * position) * 0.62;
            const signal =
              0.42 +
              Math.sin(phase * 1.2 + index * 0.71) * 0.22 +
              Math.sin(phase * 0.62 - index * 0.29) * 0.16 +
              (pseudoNoise(index + Math.floor(phase * 3)) - 0.5) * 0.18;
            const activity = isActive ? 1 : 0.18;
            const barHeight = Math.max(2, height * Math.max(0.08, signal) * envelope * activity);
            const x = index * (barWidth + gap);
            context.beginPath();
            roundedRect(context, x, height - barHeight, barWidth, barHeight, Math.min(4, barWidth / 2));
            context.closePath();
            context.fill();
          }
        }

        context.globalAlpha = 1;
        frame += 1;
      } catch (error) {
        // 可视化属于装饰功能。任何 Canvas/WebView 兼容错误都不应拖垮整个播放器。
        console.warn("Visualizer drawing disabled for this frame", error);
      }
    };

    const handleVisibility = () => {
      visible = document.visibilityState !== "hidden";
      if (visible) resize();
    };

    resize();
    animationId = window.requestAnimationFrame(draw);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("resize", resize, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(resize);
      observer.observe(canvas);
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationId);
    };
  }, [compact, mode, stabilityMode]);

  return (
    <canvas
      ref={canvasRef}
      className={`audio-visualizer ${compact ? "compact" : ""} ${className}`.trim()}
      aria-label={active ? "动态音频可视化" : "静止音频可视化"}
    />
  );
}
