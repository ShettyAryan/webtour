"use client";

import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type PointerEvent,
} from "react";
import type { Room } from "@/lib/types";

export type FloorPlanHandle = {
  /** Called every frame the view changes – redraws the vision cone without re-rendering React. */
  update: (yaw: number, hfov: number) => void;
};

type Props = {
  src: string;
  width: number;
  height: number;
  rooms: Room[];
  currentId: string | null;
  onSelectRoom?: (id: string) => void;
  /** When set, clicking empty plan space reports the point as 0–1 fractions. */
  onPlanClick?: (x: number, y: number) => void;
  /** When set, access points can be dragged; reports the new position as 0–1 fractions. */
  onMoveRoom?: (id: string, x: number, y: number) => void;
  showLabels?: boolean;
  /** Draw the vision cone for the current room (default true) */
  showCone?: boolean;
  className?: string;
};

const FloorPlanSvg = forwardRef<FloorPlanHandle, Props>(function FloorPlanSvg(
  { src, width, height, rooms, currentId, onSelectRoom, onPlanClick, onMoveRoom, showLabels, showCone = true, className },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const coneRef = useRef<SVGPathElement>(null);
  const lastView = useRef({ yaw: 0, hfov: 90 });
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const current = rooms.find((r) => r.id === currentId) ?? null;
  const currentRef = useRef(current);

  const size = Math.min(width, height);
  const radius = size * 0.16;
  const dot = size * 0.016;

  const drawCone = () => {
    const path = coneRef.current;
    const room = currentRef.current;
    if (!path) return;
    if (!room?.plan || !showCone) return path.setAttribute("d", "");
    const { yaw, hfov } = lastView.current;
    const x = room.plan.x * width;
    const y = room.plan.y * height;
    const heading = yaw + room.headingOffset;
    const half = Math.min(hfov, 170) / 2;
    const point = (deg: number) => {
      const a = (deg * Math.PI) / 180;
      return `${x + radius * Math.sin(a)} ${y - radius * Math.cos(a)}`;
    };
    path.setAttribute("d", `M ${x} ${y} L ${point(heading - half)} A ${radius} ${radius} 0 0 1 ${point(heading + half)} Z`);
  };

  useImperativeHandle(ref, () => ({
    update(yaw, hfov) {
      lastView.current = { yaw, hfov };
      drawCone();
    },
  }));

  useLayoutEffect(() => {
    currentRef.current = current;
    drawCone();
  });

  const toPlan = (clientX: number, clientY: number) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: Math.min(1, Math.max(0, pt.x / width)), y: Math.min(1, Math.max(0, pt.y / height)) };
  };

  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onPlanClick) return;
    const p = toPlan(e.clientX, e.clientY);
    if (p) onPlanClick(p.x, p.y);
  };

  // ── Dragging access points ──
  const spotPointerDown = (id: string) => (e: PointerEvent<SVGGElement>) => {
    if (!onMoveRoom) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { id, x: e.clientX, y: e.clientY, moved: false };
  };
  const spotPointerMove = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d || !onMoveRoom) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    d.moved = true;
    const p = toPlan(e.clientX, e.clientY);
    if (p) onMoveRoom(d.id, +p.x.toFixed(4), +p.y.toFixed(4));
  };
  const spotPointerUp = () => {
    justDragged.current = !!drag.current?.moved;
    drag.current = null;
  };
  const spotClick = (id: string) => (e: MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    onSelectRoom?.(id);
  };

  const cx = current?.plan ? current.plan.x * width : 0;
  const cy = current?.plan ? current.plan.y * height : 0;
  const gradientId = `cone-${currentId ?? "none"}`;
  const interactive = !!(onSelectRoom || onMoveRoom);

  const spotHandlers = (id: string) => ({
    onPointerDown: spotPointerDown(id),
    onPointerMove: spotPointerMove,
    onPointerUp: spotPointerUp,
    onPointerCancel: spotPointerUp,
    onClick: spotClick(id),
  });

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className={`floorplan-svg${onPlanClick ? " is-pickable" : ""}${className ? ` ${className}` : ""}`}
      role="img"
      onClick={handleClick}
    >
      <defs>
        <radialGradient id={gradientId} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={radius}>
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.75" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.05" />
        </radialGradient>
      </defs>

      {src && <image href={src} width={width} height={height} preserveAspectRatio="xMidYMid meet" />}

      {rooms
        .filter((r) => r.plan && r.id !== currentId)
        .map((r) => (
          <g
            key={r.id}
            className={`floorplan-spot${interactive ? "" : " is-static"}${onMoveRoom ? " is-draggable" : ""}`}
            {...spotHandlers(r.id)}
          >
            <title>{r.name}</title>
            <circle cx={r.plan!.x * width} cy={r.plan!.y * height} r={dot * 2.6} fill="transparent" />
            <circle cx={r.plan!.x * width} cy={r.plan!.y * height} r={dot} className="floorplan-spot-dot" />
            {showLabels && (
              <text x={r.plan!.x * width} y={r.plan!.y * height - dot * 2} className="floorplan-label" fontSize={dot * 2}>
                {r.name}
              </text>
            )}
          </g>
        ))}

      <path ref={coneRef} fill={`url(#${gradientId})`} pointerEvents="none" />
      {current?.plan && (
        <g
          className={onMoveRoom ? "floorplan-spot is-draggable" : undefined}
          pointerEvents={onMoveRoom ? undefined : "none"}
          {...(onMoveRoom ? spotHandlers(current.id) : {})}
        >
          <circle cx={cx} cy={cy} r={dot * 2.6} fill="transparent" />
          <circle cx={cx} cy={cy} r={dot * 2.2} className="floorplan-pulse" />
          <circle cx={cx} cy={cy} r={dot * 1.2} className="floorplan-you" />
          {showLabels && (
            <text x={cx} y={cy - dot * 2.6} className="floorplan-label is-current" fontSize={dot * 2.2}>
              {current.name}
            </text>
          )}
        </g>
      )}
    </svg>
  );
});

export default FloorPlanSvg;
