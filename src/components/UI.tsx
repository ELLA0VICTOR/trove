import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, X } from "lucide-react";

export function Button({
  children,
  to,
  onClick,
  secondary = false,
  disabled = false,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const classes = `button ${secondary ? "button-secondary" : ""} ${className}`;
  return to ? (
    <Link className={classes} to={to} onClick={onClick}>
      {children}
      <ArrowUpRight size={18} />
    </Link>
  ) : (
    <button
      className={classes}
      type={type}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`eyebrow ${className}`}>{children}</span>;
}
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      element.getBoundingClientRect().top < innerHeight
    )
      return;
    element.classList.add("will-reveal");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          element.classList.add("revealed");
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -30px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    callback = useRef(onClose);
  useEffect(() => {
    callback.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const el = dialog.current;
    const previousFocus = document.activeElement;
    el?.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      callback.current();
    };
    el?.addEventListener("cancel", cancel);
    return () => {
      el?.removeEventListener("cancel", cancel);
      el?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby="dialog-title"
      onClick={(event) => {
        if (event.target === dialog.current) {
          const rect = dialog.current.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-top">
        <span className="eyebrow" id="dialog-title">
          {title}
        </span>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
const digits: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "—": ["000", "000", "111", "000", "000"],
};
export function PixelReadout({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null),
    [display, setDisplay] = useState(value);
  useEffect(() => {
    const element = ref.current;
    if (!element || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const elapsed = now - start;
          setDisplay(
            [...value]
              .map((c, i) =>
                /\d/.test(c) && elapsed < 380 + i * 65
                  ? String((Number(c) + Math.floor(elapsed / 65)) % 10)
                  : c,
              )
              .join(""),
          );
          if (elapsed < 450 + value.length * 65)
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return (
    <svg
      ref={ref}
      className="pixel-readout"
      viewBox={`0 0 ${value.length * 24 - 4} 30`}
      role="img"
      aria-label={value}
    >
      {[...display].flatMap((digit, index) =>
        (digits[digit] ?? digits["—"]).flatMap((row, y) =>
          [...row].map((cell, x) => (
            <rect
              key={`${index}-${x}-${y}`}
              x={index * 24 + x * 6}
              y={y * 6}
              width="4.8"
              height="4.8"
              fill="currentColor"
              opacity={cell === "1" ? 1 : 0.12}
            />
          )),
        ),
      )}
    </svg>
  );
}
