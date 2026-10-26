import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../lib/app-context.tsx";

const WORD = "GROWTH",
  symbols = "●ϟ☂☁↟·+✦",
  scramble = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.:/-";
function smooth(value: number) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}
function spherePoints(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const y = 1 - (2 * index) / (count - 1),
      ring = Math.sqrt(1 - y * y),
      angle = index * Math.PI * (3 - Math.sqrt(5));
    return {
      x: Math.cos(angle) * ring,
      y,
      z: Math.sin(angle) * ring,
      letter: WORD[index % WORD.length].toLowerCase(),
      index,
    };
  });
}

export function LetterGlobe() {
  const { paused, theme } = useApp(),
    canvas = useRef<HTMLCanvasElement>(null),
    field = useRef<HTMLCanvasElement>(null);
  const [intro, setIntro] = useState(() => {
    try {
      return (
        !sessionStorage.getItem("trove-intro") &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch {
      return false;
    }
  });
  const finish = useRef<() => void>(() => {});
  useEffect(() => {
    const el = canvas.current,
      ctx = el?.getContext("2d"),
      overlay = field.current,
      screen = overlay?.getContext("2d");
    if (!el || !ctx) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)"),
      small = innerWidth <= 600,
      points = spherePoints(small ? 720 : 1050);
    let frame = 0,
      width = 0,
      height = 0,
      dpr = 1,
      elapsed = 0,
      previous = 0,
      visible = true,
      disposed = false,
      introDone = !intro,
      introStart = performance.now(),
      fontReady = false;
    let ink = "",
      accent = "",
      alpha = 0,
      pointerX = 0,
      pointerY = 0,
      targetX = 0,
      targetY = 0,
      rotationX = 0,
      rotationY = 0,
      active = false;
    const atlas = document.createElement("canvas"),
      atlasCtx = atlas.getContext("2d")!,
      all = [...new Set(symbols + scramble + WORD.toLowerCase())];
    atlas.width = all.length * 30 * 2;
    atlas.height = 60;
    function colors() {
      const css = getComputedStyle(document.documentElement);
      ink = css.getPropertyValue("--foreground").trim();
      accent = css.getPropertyValue("--spot").trim();
      atlasCtx.clearRect(0, 0, atlas.width, atlas.height);
      atlasCtx.font = '500 35px "IBM Plex Mono"';
      atlasCtx.textAlign = "center";
      atlasCtx.textBaseline = "middle";
      atlasCtx.fillStyle = ink;
      all.forEach((letter, i) => atlasCtx.fillText(letter, i * 60 + 30, 30));
    }
    function resize() {
      const box = el!.getBoundingClientRect();
      width = box.width;
      height = box.height;
      dpr = Math.min(devicePixelRatio || 1, small ? 1.5 : 2);
      el!.width = Math.round(width * dpr);
      el!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (overlay) {
        overlay.width = Math.round(innerWidth * dpr);
        overlay.height = Math.round(innerHeight * dpr);
        screen?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
    function closeIntro() {
      if (introDone) return;
      introDone = true;
      try {
        sessionStorage.setItem("trove-intro", "1");
      } catch {
        /* optional */
      }
      document.documentElement.style.overflow = originalOverflow;
      if (root) root.inert = originalInert;
      el!.style.opacity = "1";
      setIntro(false);
    }
    finish.current = closeIntro;
    const originalOverflow = document.documentElement.style.overflow;
    const root = document.getElementById("root"),
      originalInert = root?.inert ?? false;
    if (intro) {
      document.documentElement.style.overflow = "hidden";
      if (root) root.inert = true;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeIntro();
    }
    function project(time: number) {
      const radius = Math.min((width - 45) * 0.3, height * 0.31),
        cy = height * 0.44,
        yaw = time * 0.14 + rotationX * 0.45,
        pitch = 0.18 + rotationY * 0.3;
      return points.map((point) => {
        const x = point.x * Math.cos(yaw) + point.z * Math.sin(yaw),
          z = point.z * Math.cos(yaw) - point.x * Math.sin(yaw),
          y = point.y * Math.cos(pitch) - z * Math.sin(pitch),
          depth = point.y * Math.sin(pitch) + z * Math.cos(pitch),
          perspective = 2.9 / (2.9 - depth * 0.4);
        return {
          ...point,
          x: width / 2 + x * radius * perspective,
          y: cy + y * radius * perspective,
          depth,
        };
      });
    }
    function glyph(
      context: CanvasRenderingContext2D,
      letter: string,
      x: number,
      y: number,
      size: number,
      opacity: number,
    ) {
      const at = all.indexOf(letter);
      if (at < 0 || opacity < 0.005) return;
      context.globalAlpha = opacity;
      context.drawImage(
        atlas,
        at * 60,
        0,
        60,
        60,
        x - size / 2,
        y - size / 2,
        size,
        size,
      );
    }
    function draw(time: number, now: number) {
      ctx!.clearRect(0, 0, width, height);
      const projected = project(time),
        sorted = [...projected].sort((a, b) => a.depth - b.depth);
      const cycle = time % 11.5,
        current = Math.min(WORD.length - 1, Math.floor(cycle / 1.15)),
        phase = (cycle % 1.15) / 1.15,
        complete = cycle >= WORD.length * 1.15;
      for (const point of sorted) {
        const glow =
          active && point.depth > 0
            ? Math.max(
                0,
                1 - Math.hypot(point.x - pointerX, point.y - pointerY) / 65,
              )
            : 0;
        glyph(
          ctx!,
          point.letter,
          point.x,
          point.y,
          17 + point.depth * 2,
          0.08 + (point.depth + 1) * 0.25 + glow * 0.35,
        );
      }
      const selected = projected
        .filter(
          (p) => p.letter === WORD[current].toLowerCase() && p.depth > 0.1,
        )
        .sort(
          (a, b) =>
            Math.abs(a.index - points.length / 2 - 40) -
            Math.abs(b.index - points.length / 2 - 40),
        )[0];
      ctx!.globalAlpha = 1;
      ctx!.strokeStyle = ink;
      ctx!.lineWidth = 0.8;
      if (!complete && selected) {
        for (const [point, corner] of [
          [selected, 38],
          [projected[(selected.index + 360) % points.length], width - 38],
        ] as const) {
          ctx!.globalAlpha = corner === 38 ? 0.45 : 0.22;
          ctx!.beginPath();
          ctx!.moveTo(corner, 38);
          ctx!.lineTo(point.x, point.y - 5);
          ctx!.stroke();
        }
        ctx!.globalAlpha = 1;
        ctx!.font = '500 13px "IBM Plex Mono"';
        ctx!.textAlign = "center";
        ctx!.fillStyle = ink;
        ctx!.fillText(selected.letter, selected.x, selected.y);
      }
      const spacing = small ? 27 : 32,
        left = width / 2 - ((WORD.length - 1) * spacing) / 2,
        baseline = height - 52;
      ctx!.font = '500 23px "IBM Plex Mono"';
      ctx!.textAlign = "center";
      for (let index = 0; index < WORD.length; index++) {
        const captured =
          complete || index < current || (index === current && phase > 0.83);
        ctx!.globalAlpha = captured ? 1 : 0.2;
        ctx!.fillStyle = captured ? accent : ink;
        ctx!.fillText(
          captured ? WORD[index] : "·",
          left + index * spacing,
          baseline,
        );
      }
      if (!complete && selected && phase > 0.44 && phase < 0.84) {
        const progress = smooth((phase - 0.44) / 0.4);
        ctx!.globalAlpha = 1;
        ctx!.fillStyle = accent;
        ctx!.fillText(
          WORD[current],
          selected.x + (left + current * spacing - selected.x) * progress,
          selected.y + (baseline - selected.y) * progress,
        );
      }
      ctx!.globalAlpha = 0.5;
      ctx!.strokeStyle = ink;
      ctx!.lineWidth = 1;
      for (const [x, y, sx, sy] of [
        [25, 20, 1, 1],
        [width - 25, 20, -1, 1],
        [25, height - 16, 1, -1],
        [width - 25, height - 16, -1, -1],
      ]) {
        ctx!.beginPath();
        ctx!.moveTo(x + 21 * sx, y);
        ctx!.lineTo(x + 5 * sx, y);
        ctx!.quadraticCurveTo(x, y, x, y + 5 * sy);
        ctx!.lineTo(x, y + 21 * sy);
        ctx!.stroke();
      }
      ctx!.globalAlpha = 0.65;
      ctx!.font = '10px "IBM Plex Mono"';
      ctx!.fillStyle = ink;
      ctx!.textAlign = "left";
      ctx!.fillText("MOVE / TOUCH TO EXPLORE", 39, height - 29);
      ctx!.textAlign = "right";
      ctx!.fillText(
        `${String(complete ? WORD.length : current).padStart(2, "0")} / 0${WORD.length}`,
        width - 39,
        height - 29,
      );
      ctx!.globalAlpha = 1;
      if (!introDone && screen && overlay) {
        const age = (now - introStart) / 1000,
          morph = fontReady ? smooth((age - 1.4) / 1.25) : 0,
          cover = 1 - smooth((morph - 0.12) / 0.72);
        overlay.parentElement!.style.setProperty(
          "--intro-cover",
          String(cover),
        );
        el!.style.opacity = String(smooth((morph - 0.83) / 0.17));
        screen.clearRect(0, 0, innerWidth, innerHeight);
        const scale = Math.max(
            1,
            Math.sqrt((innerWidth * innerHeight) / 1_100_000),
          ),
          dx = 16 * scale,
          dy = 21 * scale,
          columns = Math.ceil(innerWidth / dx),
          rows = Math.ceil(innerHeight / dy),
          total = columns * rows,
          rect = el!.getBoundingClientRect();
        const destination = project(0);
        for (let index = 0; index < total; index++) {
          const x = ((index % columns) + 0.5) * dx,
            y = (Math.floor(index / columns) + 0.5) * dy,
            radial = Math.hypot(
              (x - innerWidth / 2) / (innerWidth / 2),
              (y - innerHeight / 2) / (innerHeight * 0.55),
            ),
            seed = ((index * 7919) % 1000) / 1000;
          if (radial > 0.18 + 1.6 * Math.min(age / 0.58, 1) - seed * 0.15)
            continue;
          const slot = Math.floor((index * points.length) / total),
            chosen = Math.floor(((index + 1) * points.length) / total) > slot,
            target = destination[slot];
          const scrambled = age > 0.78 + Math.abs(x / innerWidth - 0.5) * 0.4,
            set = scrambled ? scramble : symbols,
            letter =
              set[
                (index * 7 + Math.floor(age * 13) * ((index % 3) + 1)) %
                  set.length
              ];
          const progress = smooth((morph - seed * 0.1) / 0.9),
            opacity = chosen
              ? 0.86 + (0.08 + (target.depth + 1) * 0.25 - 0.86) * progress
              : 0.86 * (1 - smooth(morph / (0.25 + 0.4 * seed)));
          glyph(
            screen,
            chosen && morph > 0.15 ? target.letter : letter,
            chosen ? x + (target.x + rect.left - x) * progress : x,
            chosen ? y + (target.y + rect.top - y) * progress : y,
            chosen ? 23 * scale + (17 - 23 * scale) * progress : 23 * scale,
            opacity,
          );
        }
        screen.globalAlpha = 1;
        if (age >= 2.65 && morph >= 0.999) closeIntro();
      }
    }
    function loop(now: number) {
      if (disposed) return;
      const delta = Math.min((now - (previous || now)) / 1000, 0.05);
      previous = now;
      if (!document.hidden && (visible || !introDone)) {
        const playing = !paused && !media.matches && introDone;
        if (playing) elapsed += delta * 1.25;
        const response = 1 - Math.exp(-5 * delta);
        rotationX += (targetX - rotationX) * response;
        rotationY += (targetY - rotationY) * response;
        alpha += delta;
        if (alpha > (small ? 1 / 30 : 1 / 60) - 0.001) {
          draw(media.matches ? 6 : elapsed, now);
          alpha = 0;
        }
      }
      frame = requestAnimationFrame(loop);
    }
    function move(event: PointerEvent) {
      const rect = el!.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
      targetX = (pointerX / width - 0.5) * 2;
      targetY = (pointerY / height - 0.44) * 2;
      active = true;
    }
    function leave() {
      targetX = targetY = 0;
      active = false;
    }
    colors();
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(el);
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    visibility.observe(el);
    document.fonts
      .load('500 16px "IBM Plex Mono"')
      .catch(() => [])
      .then(() => {
        if (!disposed) {
          colors();
          fontReady = true;
        }
      });
    const timeout = setTimeout(closeIntro, 4500);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    document.addEventListener("keydown", onKey);
    frame = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      resizeObserver.disconnect();
      visibility.disconnect();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = originalOverflow;
      if (root) root.inert = originalInert;
      el!.style.opacity = "1";
    };
    // Intro state deliberately does not recreate the engine during the handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, theme]);
  return (
    <>
      <div className="letter-field">
        <canvas
          ref={canvas}
          aria-label="An interactive sphere of letters that assembles the word growth."
          role="img"
        />
      </div>
      {intro &&
        createPortal(
          <div
            className="character-intro"
            role="dialog"
            aria-label="Trove introduction"
            aria-modal="true"
          >
            <div className="intro-curtain" />
            <canvas ref={field} aria-hidden="true" />
            <button
              className="skip-intro"
              autoFocus
              onClick={() => finish.current()}
            >
              Skip intro <span>↗</span>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
