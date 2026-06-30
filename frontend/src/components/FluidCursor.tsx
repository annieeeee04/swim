import { useEffect, useRef } from "react";
import "./FluidCursor.css";

interface Droplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  hue: string;
}

// Mirrors --fluid-pink/--fluid-purple/--fluid-blue/--fluid-gold in index.css.
const HUES = ["236, 72, 153", "168, 85, 247", "77, 171, 247", "255, 214, 102"];

/**
 * A page-wide, pointer-reactive "liquid light" trail — inspired by the fluid
 * simulation in https://github.com/chiuhans111/fluidglass, simplified to a
 * lightweight 2D-canvas advection trail (rather than a full WebGL
 * Navier-Stokes + reaction-diffusion sim) so it stays cheap enough to run
 * behind every page. Mounted once at the app root; renders above all
 * content with `mix-blend-mode: soft-light`, so it reads as moving light
 * refracting through the glass surfaces beneath it, following the cursor
 * (or finger) anywhere in the app.
 */
export default function FluidCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let droplets: Droplet[] = [];
    let last: { x: number; y: number } | null = null;
    let hueIndex = 0;
    let raf = 0;
    let width = 0;
    let height = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function handlePointerMove(e: PointerEvent) {
      const point = { x: e.clientX, y: e.clientY };
      const prev = last;
      last = point;
      if (!prev) return;

      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      const speed = Math.hypot(dx, dy);
      if (speed < 1) return;

      hueIndex = (hueIndex + (speed > 14 ? 1 : 0)) % HUES.length;

      droplets.push({
        x: point.x,
        y: point.y,
        vx: dx * 0.22,
        vy: dy * 0.22,
        life: 1,
        hue: HUES[hueIndex],
      });
      if (droplets.length > 60) droplets.splice(0, droplets.length - 60);
    }
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    function tick() {
      ctx!.clearRect(0, 0, width, height);
      ctx!.globalCompositeOperation = "lighter";

      for (const d of droplets) {
        d.x += d.vx;
        d.y += d.vy;
        d.vx *= 0.92;
        d.vy *= 0.92;
        d.life *= 0.93;

        const radius = 14 + 46 * d.life;
        const gradient = ctx!.createRadialGradient(d.x, d.y, 0, d.x, d.y, radius);
        gradient.addColorStop(0, `rgba(${d.hue}, ${0.4 * d.life})`);
        gradient.addColorStop(1, `rgba(${d.hue}, 0)`);
        ctx!.fillStyle = gradient;
        ctx!.beginPath();
        ctx!.arc(d.x, d.y, radius, 0, Math.PI * 2);
        ctx!.fill();
      }

      droplets = droplets.filter((d) => d.life > 0.025);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="fluid-cursor-canvas" aria-hidden="true" />;
}
