"use client";

import { forwardRef, useState } from "react";
import type { Room } from "@/lib/types";
import FloorPlanSvg, { type FloorPlanHandle } from "./FloorPlanSvg";

export type { FloorPlanHandle };

type Props = {
  src: string;
  width: number;
  height: number;
  rooms: Room[];
  currentRoom: Room;
  onSelectRoom: (id: string) => void;
};

/** Floor plan picture-in-picture shown over the tour. */
const FloorPlanMap = forwardRef<FloorPlanHandle, Props>(function FloorPlanMap(
  { src, width, height, rooms, currentRoom, onSelectRoom },
  ref,
) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`floorplan${collapsed ? " is-collapsed" : ""}`} aria-label="Floor plan">
      <button
        type="button"
        className="floorplan-header"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span>Floor Plan · {currentRoom.name}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="floorplan-chevron">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <div className="floorplan-body">
        <FloorPlanSvg
          ref={ref}
          src={src}
          width={width}
          height={height}
          rooms={rooms}
          currentId={currentRoom.id}
          onSelectRoom={onSelectRoom}
        />
      </div>
    </aside>
  );
});

export default FloorPlanMap;
