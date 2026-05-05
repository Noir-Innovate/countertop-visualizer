"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface V2DrawableCanvasHandle {
  undo: () => void;
  clear: () => void;
  hasStrokes: () => boolean;
  exportComposited: () => Promise<string>;
}

interface V2DrawableCanvasProps {
  imageSrc: string;
  brushSize: number;
  onStrokesChange?: (count: number) => void;
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  size: number;
}

const STROKE_COLOR = "#ff0033";

const V2DrawableCanvas = forwardRef<
  V2DrawableCanvasHandle,
  V2DrawableCanvasProps
>(function V2DrawableCanvas({ imageSrc, brushSize, onStrokesChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const notifyStrokes = useCallback(() => {
    onStrokesChange?.(strokesRef.current.length);
  }, [onStrokesChange]);

  const drawStrokeSegment = (
    ctx: CanvasRenderingContext2D,
    stroke: Stroke,
    fromIdx: number,
  ) => {
    if (stroke.points.length === 0) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = STROKE_COLOR;
    ctx.fillStyle = STROKE_COLOR;
    ctx.lineWidth = stroke.size;

    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.beginPath();
    const start = stroke.points[Math.max(0, fromIdx - 1)];
    ctx.moveTo(start.x, start.y);
    for (let i = Math.max(1, fromIdx); i < stroke.points.length; i++) {
      const p = stroke.points[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  };

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) {
      drawStrokeSegment(ctx, stroke, 0);
    }
  }, []);

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    setNaturalSize({
      width: img.naturalWidth,
      height: img.naturalHeight,
    });
  }, []);

  useEffect(() => {
    if (!naturalSize) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = naturalSize.width;
    canvas.height = naturalSize.height;
    redrawAll();
  }, [naturalSize, redrawAll]);

  const eventToImageCoords = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas || !naturalSize) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const scaleX = naturalSize.width / rect.width;
    const scaleY = naturalSize.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!naturalSize) return;
    const point = eventToImageCoords(e);
    if (!point) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const scale = naturalSize.width / e.currentTarget.getBoundingClientRect().width;
    const stroke: Stroke = {
      points: [point],
      size: brushSize * scale,
    };
    activeStrokeRef.current = stroke;
    strokesRef.current.push(stroke);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) drawStrokeSegment(ctx, stroke, 0);
    notifyStrokes();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    const point = eventToImageCoords(e);
    if (!point) return;
    const prevLen = stroke.points.length;
    stroke.points.push(point);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) drawStrokeSegment(ctx, stroke, prevLen);
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeStrokeRef.current) {
      activeStrokeRef.current = null;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      undo: () => {
        if (strokesRef.current.length === 0) return;
        strokesRef.current.pop();
        redrawAll();
        notifyStrokes();
      },
      clear: () => {
        if (strokesRef.current.length === 0) return;
        strokesRef.current = [];
        redrawAll();
        notifyStrokes();
      },
      hasStrokes: () => strokesRef.current.length > 0,
      exportComposited: async () => {
        const img = imgRef.current;
        if (!img || !naturalSize) {
          throw new Error("Image not loaded");
        }
        const off = document.createElement("canvas");
        off.width = naturalSize.width;
        off.height = naturalSize.height;
        const ctx = off.getContext("2d");
        if (!ctx) throw new Error("Canvas context unavailable");
        ctx.drawImage(img, 0, 0, naturalSize.width, naturalSize.height);
        for (const stroke of strokesRef.current) {
          drawStrokeSegment(ctx, stroke, 0);
        }
        return off.toDataURL("image/png");
      },
    }),
    [naturalSize, redrawAll, notifyStrokes],
  );

  return (
    <div className="relative w-full h-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageSrc}
        alt="Edit target"
        crossOrigin="anonymous"
        onLoad={handleImageLoad}
        className="w-full h-full object-cover select-none pointer-events-none"
        draggable={false}
      />
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onPointerLeave={(e) => {
          if (activeStrokeRef.current) finishStroke(e);
        }}
        className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
      />
    </div>
  );
});

export default V2DrawableCanvas;
