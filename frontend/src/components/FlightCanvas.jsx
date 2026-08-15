import { useEffect, useRef } from 'react';

const RED = '#E50539';
const RED_FILL = '#9B0A28';

/**
 * In-flight stage matched to the reference screenshot:
 * rotating sunburst from bottom-left, blue center glow,
 * solid red under-curve fill + thin red edge, SVG plane on the tip.
 */
export default function FlightCanvas({ multiplier, status, pointsRef, startedAtRef }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const planeImgRef = useRef(null);
  const flyAwayRef = useRef(null);
  const sunAngleRef = useRef(0);

  useEffect(() => {
    const img = new Image();
    img.src = '/plane.svg';
    img.onload = () => {
      planeImgRef.current = img;
    };
  }, []);

  useEffect(() => {
    if (status === 'CRASHED') {
      flyAwayRef.current = { t0: performance.now(), active: true };
    } else if (status === 'WAITING') {
      flyAwayRef.current = null;
    }
  }, [status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (now) => {
      const { width, height } = canvas.getBoundingClientRect();

      if (status === 'RUNNING') sunAngleRef.current += 0.0045;
      drawSunburstBackground(ctx, width, height, sunAngleRef.current, status);

      if (status === 'WAITING') {
        drawWaitingPlane(ctx, width, height, now);
      } else if (status === 'RUNNING' || status === 'CRASHED') {
        const elapsed = startedAtRef?.current
          ? Math.max(0.05, (Date.now() - startedAtRef.current) / 1000)
          : Math.max(0.05, (pointsRef.current.length || 1) * 0.1);

        const path = buildFlightPath(elapsed, multiplier, width, height);
        const crashed = status === 'CRASHED';

        if (!crashed) {
          drawRedMountain(ctx, path, height);
          drawCurveEdge(ctx, path);
        } else {
          drawCrashedTrail(ctx, path);
        }

        const tip = path[path.length - 1];
        if (tip) {
          const bob = crashed ? 0 : Math.sin(now / 85) * 1.4;
          let px = tip.x;
          let py = tip.y + bob;
          let angle = tip.angle;

          const fly = flyAwayRef.current;
          if (crashed && fly?.active) {
            const u = Math.min(1, (now - fly.t0) / 650);
            px += u * width * 0.55;
            py -= u * height * 0.75;
            angle -= u * 0.35;
            if (u >= 1) fly.active = false;
            if (u < 1) drawPlaneSprite(ctx, px, py, angle, planeImgRef.current);
          } else if (!crashed) {
            drawPlaneSprite(ctx, px, py, angle, planeImgRef.current);
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [multiplier, status, pointsRef, startedAtRef]);

  return <canvas ref={canvasRef} className="flight-canvas" />;
}

/** Dark sunburst rays from bottom-left + soft blue glow (as in the screenshot) */
function drawSunburstBackground(ctx, w, h, angle, status) {
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, w, h);

  const ox = w * 0.02;
  const oy = h * 0.98;
  const radius = Math.hypot(w, h) * 1.25;
  const rays = 36;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(angle);

  for (let i = 0; i < rays; i += 1) {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = ((i + 1) / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, a0, a1);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? '#121216' : '#0a0a0c';
    ctx.fill();
  }
  ctx.restore();

  // Soft blue spotlight behind the multiplier
  const glowX = w * 0.48;
  const glowY = h * 0.42;
  const glow = ctx.createRadialGradient(glowX, glowY, 10, glowX, glowY, Math.min(w, h) * 0.42);
  glow.addColorStop(0, 'rgba(70, 120, 200, 0.28)');
  glow.addColorStop(0.45, 'rgba(40, 80, 160, 0.12)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Slight vignette
  const vig = ctx.createRadialGradient(w * 0.5, h * 0.45, h * 0.2, w * 0.5, h * 0.5, h * 0.9);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  if (status === 'WAITING') {
    // Dim sunburst a bit while waiting
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * Exponential-feeling climb: starts bottom-left, plane leads into upper-right.
 */
function buildFlightPath(elapsed, multiplier, width, height) {
  const padL = 4;
  const padB = 4;
  const padT = height * 0.1;
  const padR = width * 0.1;

  // X advances quickly at first then slows — keeps plane visible like the reference
  const progress = 1 - Math.exp(-elapsed / 5.2);
  const endX = padL + progress * (width - padL - padR);

  // Y follows multiplier with fixed visual scale so early climb matches ~1.5x look
  const visualMax = Math.max(2.2, multiplier * 1.25);
  const endY =
    height - padB - ((multiplier - 1) / (visualMax - 1)) * (height - padB - padT);

  const n = Math.max(48, Math.floor(elapsed * 60));
  const points = [];

  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const x = padL + (endX - padL) * t;
    // Ease that starts flatter then steepens (screenshot curve shape)
    const ease = Math.pow(t, 1.55);
    const m = 1 + (multiplier - 1) * ease;
    const y =
      height - padB - ((m - 1) / (visualMax - 1 || 1)) * (height - padB - padT);
    points.push({ x, y, m });
  }

  points[points.length - 1].x = endX;
  points[points.length - 1].y = endY;
  points[points.length - 1].m = multiplier;

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    b.angle = Math.atan2(b.y - a.y, b.x - a.x);
  }
  points[0].angle = points[1]?.angle ?? -0.4;
  return points;
}

function drawRedMountain(ctx, path, height) {
  if (path.length < 2) return;
  const tip = path[path.length - 1];

  ctx.beginPath();
  ctx.moveTo(path[0].x, height);
  for (const p of path) ctx.lineTo(p.x, p.y);
  ctx.lineTo(tip.x, height);
  ctx.closePath();
  ctx.fillStyle = RED_FILL;
  ctx.globalAlpha = 0.92;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawCurveEdge(ctx, path) {
  if (path.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
  ctx.strokeStyle = RED;
  ctx.lineWidth = 2.25;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawCrashedTrail(ctx, path) {
  if (path.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
  ctx.strokeStyle = 'rgba(220, 220, 230, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawPlaneSprite(ctx, x, y, angle, img) {
  ctx.save();
  ctx.translate(x, y);
  // Local +x follows the curve tangent; SVG nose is on the right
  ctx.rotate(angle);

  if (img && img.complete && img.naturalWidth > 0) {
    const w = 118;
    const h = (img.naturalHeight / img.naturalWidth) * w;
    // Anchor at the TAIL (left of SVG). Path tip / red fill ends here;
    // the nose extends forward along +x ahead of the fill.
    const tailInset = w * 0.06;
    ctx.drawImage(img, -tailInset, -h * 0.55, w, h);
  } else {
    drawFallbackSidePlane(ctx);
  }
  ctx.restore();
}

function drawFallbackSidePlane(ctx) {
  // Tail at origin, nose along +x (same anchoring as the SVG)
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(52, 0);
  ctx.quadraticCurveTo(40, -8, 24, -7);
  ctx.lineTo(2, -4);
  ctx.quadraticCurveTo(-4, -2, -2, 2);
  ctx.lineTo(14, 7);
  ctx.quadraticCurveTo(36, 8, 52, 0);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(4, -2);
  ctx.lineTo(-6, -14);
  ctx.lineTo(8, -2);
  ctx.fill();
}

function drawWaitingPlane(ctx, width, height, now) {
  const cx = width / 2;
  const cy = height * 0.4;
  const spin = now / 80;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = RED;

  ctx.beginPath();
  ctx.moveTo(-78, -4);
  ctx.quadraticCurveTo(-40, -10, -18, -6);
  ctx.lineTo(-18, 6);
  ctx.quadraticCurveTo(-40, 10, -78, 4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(78, -4);
  ctx.quadraticCurveTo(40, -10, 18, -6);
  ctx.lineTo(18, 6);
  ctx.quadraticCurveTo(40, 10, 78, 4);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0a0c';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = RED;
  ctx.fill();

  ctx.rotate(spin);
  ctx.strokeStyle = RED;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i += 1) {
    const a0 = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(0, 0, 28 + (i % 2) * 6, a0, a0 + 0.55);
    ctx.stroke();
  }
  ctx.restore();
}
