"use client";

import { useEffect, useRef, useState } from "react";

// Sign with a finger, pen or mouse. Calls onChange with a PNG data URL (or "" when cleared).
export function SignaturePad({ onChange, label = "Sign here" }: { onChange: (dataUrl: string) => void; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1d1d1d";
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div className="mb-4">
      <p className="block text-sm font-medium mb-1">{label}</p>
      <canvas
        ref={canvas}
        aria-label={label}
        role="img"
        className="h-40 w-full touch-none rounded-lg border border-line bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          canvas.current!.setPointerCapture(e.pointerId);
          const { x, y } = point(e);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 0.1, y + 0.1);
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const { x, y } = point(e);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.lineTo(x, y);
          ctx.stroke();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          setEmpty(false);
          onChange(canvas.current!.toDataURL("image/png"));
        }}
      />
      <div className="mt-1 flex items-center gap-3">
        <span className="text-xs text-muted">{empty ? "Not signed yet." : "Signed."}</span>
        <button
          type="button"
          className="text-sm underline"
          onClick={() => {
            const c = canvas.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setEmpty(true);
            onChange("");
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
