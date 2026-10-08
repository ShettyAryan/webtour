"use client";

import { useCallback, useRef, useState } from "react";
import { newId, wrapDeg, yawToward } from "@/lib/geometry";
import { mediaUrl } from "@/lib/pano";
import { PANO_EXTENSIONS, type Hotspot, type Room, type TourConfig } from "@/lib/types";
import FloorPlanSvg, { type FloorPlanHandle } from "../FloorPlanSvg";
import PanoViewer, { type PanoViewerHandle } from "../PanoViewer";
import UploadField from "./UploadField";

type Props = {
  room: Room;
  index: number;
  config: TourConfig;
  onChange: (patch: Partial<Room>) => void;
  /** Patch any room (used to add the "way back" hotspot in the target room) */
  onPatchRoom: (id: string, patch: Partial<Room>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onMakeStart: () => void;
};

const wrap = (d: number) => Math.round(wrapDeg(d));
const DEFAULT_PITCH = -12;

export default function RoomEditor({ room, index, config, onChange, onPatchRoom, onDelete, onMove, onMakeStart }: Props) {
  const planRef = useRef<FloorPlanHandle>(null);
  const viewerRef = useRef<PanoViewerHandle>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const isStart = config.startRoom === room.id;
  const { floorPlan } = config;
  const others = config.rooms.filter((r) => r.id !== room.id);
  const roomName = (id: string) => config.rooms.find((r) => r.id === id)?.name ?? "Unknown room";

  const handleView = useCallback((yaw: number, hfov: number) => planRef.current?.update(yaw, hfov), []);

  // ── Hotspots ──
  const setHotspots = (hotspots: Hotspot[]) => onChange({ hotspots });
  const patchHotspot = (id: string, p: Partial<Hotspot>) =>
    setHotspots(room.hotspots.map((h) => (h.id === id ? { ...h, ...p } : h)));

  const suggest = (target: Room) => {
    const yaw = yawToward(room, target, floorPlan);
    return yaw === null ? null : { yaw, pitch: DEFAULT_PITCH };
  };

  const addHotspot = () => {
    const linked = new Set(room.hotspots.map((h) => h.target));
    const target = others.find((r) => !linked.has(r.id)) ?? others[0];
    if (!target) return;
    const pos = suggest(target);
    const view = viewerRef.current?.getView();
    const h: Hotspot = {
      id: newId("hs"),
      target: target.id,
      yaw: pos?.yaw ?? Math.round(view?.yaw ?? 0),
      pitch: pos?.pitch ?? Math.round(view?.pitch ?? DEFAULT_PITCH),
    };
    setHotspots([...room.hotspots, h]);
    setActiveHotspot(h.id);
    if (pos) viewerRef.current?.lookAt(pos.yaw, 0);
    else setPickingId(h.id); // no floor-plan hint – ask where to put it
  };

  const changeTarget = (h: Hotspot, targetId: string) => {
    const target = config.rooms.find((r) => r.id === targetId);
    const pos = target ? suggest(target) : null;
    patchHotspot(h.id, { target: targetId, ...(pos ?? {}) });
    if (pos) viewerRef.current?.lookAt(pos.yaw, 0);
  };

  const addWayBack = (h: Hotspot) => {
    const target = config.rooms.find((r) => r.id === h.target);
    if (!target) return;
    const yaw = yawToward(target, room, floorPlan);
    onPatchRoom(target.id, {
      hotspots: [...target.hotspots, { id: newId("hs"), target: room.id, yaw: yaw ?? 0, pitch: DEFAULT_PITCH }],
    });
  };

  const hasWayBack = (h: Hotspot) =>
    config.rooms.find((r) => r.id === h.target)?.hotspots.some((b) => b.target === room.id) ?? false;

  const picking = room.hotspots.find((h) => h.id === pickingId);

  return (
    <div className="room-editor">
      <div className="editor-head">
        <label className="field grow">
          <span>Room name</span>
          <input value={room.name} maxLength={80} onChange={(e) => onChange({ name: e.target.value })} />
        </label>
        <div className="editor-head-actions">
          <button type="button" className="ghost-btn" onClick={() => onMove(-1)} disabled={index === 0} title="Move up">
            ↑
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => onMove(1)}
            disabled={index === config.rooms.length - 1}
            title="Move down"
          >
            ↓
          </button>
          <button type="button" className={`ghost-btn${isStart ? " is-on" : ""}`} onClick={onMakeStart} disabled={isStart}>
            {isStart ? "★ Opening room" : "☆ Make opening room"}
          </button>
          <button type="button" className="ghost-btn danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="editor-grid">
        {/* ── 360 photo + hotspots ── */}
        <section className="card">
          <header className="card-head">
            <h3>1 · 360° photo</h3>
            <p>Equirectangular render, 2:1. JPG, PNG, WebP, AVIF or TIF/TIFF.</p>
          </header>
          <div className="viewer-box">
            <PanoViewer
              ref={viewerRef}
              pano={room.pano}
              initialYaw={room.initialYaw}
              autoRotate={false}
              onViewChange={handleView}
              hotspots={room.hotspots.map((h) => ({
                id: h.id,
                yaw: h.yaw,
                pitch: h.pitch,
                label: roomName(h.target),
                active: h.id === activeHotspot,
              }))}
              onHotspotClick={setActiveHotspot}
              pickMode={!!picking}
              onPick={(yaw, pitch) => {
                if (!pickingId) return;
                patchHotspot(pickingId, { yaw, pitch });
                setPickingId(null);
              }}
            />
            {picking && (
              <div className="pick-banner">
                Click in the photo where the “{roomName(picking.target)}” hotspot should go
                <button type="button" className="link-btn" onClick={() => setPickingId(null)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
          <div className="row">
            <button
              type="button"
              className="ghost-btn"
              disabled={!room.pano}
              onClick={() => onChange({ initialYaw: wrap(viewerRef.current?.getView().yaw ?? 0) })}
            >
              Use current view as starting view
            </button>
            <span className="muted">Starts at {room.initialYaw}°</span>
          </div>
          <UploadField
            kind="pano"
            accept={PANO_EXTENSIONS.join(",")}
            label="360 photo"
            hint="TIF supported"
            current={room.pano}
            onUploaded={(r) => onChange({ pano: r.file, initialYaw: 0 })}
          />

          {/* ── Navigation hotspots ── */}
          <h4 className="sub-head">Navigation hotspots</h4>
          <p className="muted small">
            Arrows inside the photo that take visitors to another room. When both rooms are on the floor plan, new
            hotspots are placed automatically in the right direction – use “Move” to fine-tune (e.g. onto a doorway).
          </p>
          <ul className="hotspot-list">
            {room.hotspots.map((h) => (
              <li key={h.id} className={h.id === activeHotspot ? "is-active" : ""}>
                <select value={h.target} onChange={(e) => changeTarget(h, e.target.value)} aria-label="Leads to">
                  {others.map((r) => (
                    <option key={r.id} value={r.id}>
                      → {r.name}
                    </option>
                  ))}
                </select>
                <div className="hotspot-actions">
                  <button
                    type="button"
                    className="ghost-btn small"
                    onClick={() => {
                      setActiveHotspot(h.id);
                      viewerRef.current?.lookAt(h.yaw, h.pitch);
                    }}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className={`ghost-btn small${pickingId === h.id ? " is-on" : ""}`}
                    disabled={!room.pano}
                    onClick={() => {
                      setActiveHotspot(h.id);
                      setPickingId(pickingId === h.id ? null : h.id);
                    }}
                  >
                    Move
                  </button>
                  {!hasWayBack(h) && (
                    <button type="button" className="ghost-btn small" onClick={() => addWayBack(h)} title="Add a hotspot in that room leading back here">
                      + Way back
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost-btn small danger"
                    aria-label="Delete hotspot"
                    onClick={() => {
                      setHotspots(room.hotspots.filter((x) => x.id !== h.id));
                      if (pickingId === h.id) setPickingId(null);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="ghost-btn" disabled={!others.length || !room.pano} onClick={addHotspot}>
            + Add hotspot
          </button>
        </section>

        {/* ── Access point ── */}
        <section className="card">
          <header className="card-head">
            <h3>2 · Access point on the floor plan</h3>
            <p>Click the plan where the camera stood for this photo, or drag the point to move it.</p>
          </header>

          {floorPlan.file ? (
            <div className="plan-box">
              <FloorPlanSvg
                ref={planRef}
                src={mediaUrl(floorPlan.file)}
                width={floorPlan.width}
                height={floorPlan.height}
                rooms={config.rooms}
                currentId={room.id}
                onPlanClick={(x, y) => onChange({ plan: { x: +x.toFixed(4), y: +y.toFixed(4) } })}
                onMoveRoom={(id, x, y) => id === room.id && onChange({ plan: { x, y } })}
                showLabels
              />
              {!room.plan && <div className="plan-hint">Click to place “{room.name}”</div>}
            </div>
          ) : (
            <p className="notice warn">Upload a floor plan in the “Floor plan” tab first.</p>
          )}

          <div className="row">
            {room.plan ? (
              <>
                <span className="muted">
                  Placed at {Math.round(room.plan.x * 100)}% × {Math.round(room.plan.y * 100)}%
                </span>
                <button type="button" className="link-btn danger" onClick={() => onChange({ plan: null })}>
                  Remove point
                </button>
              </>
            ) : (
              <span className="muted">Not placed yet – this room won’t show on the plan.</span>
            )}
          </div>

          <h4 className="sub-head">3 · Align viewing direction</h4>
          <p className="muted small">
            Look around in the photo on the left, then turn this dial until the highlighted cone on the plan points the
            same way you are looking.
          </p>
          <div className="heading-control">
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={room.headingOffset}
              disabled={!room.plan}
              onChange={(e) => onChange({ headingOffset: Number(e.target.value) })}
            />
            <input
              type="number"
              min={-180}
              max={180}
              value={room.headingOffset}
              disabled={!room.plan}
              onChange={(e) => onChange({ headingOffset: wrap(Number(e.target.value) || 0) })}
            />
            <span>°</span>
          </div>
          <div className="row">
            {[-90, -15, 15, 90].map((d) => (
              <button
                key={d}
                type="button"
                className="ghost-btn small"
                disabled={!room.plan}
                onClick={() => onChange({ headingOffset: wrap(room.headingOffset + d) })}
              >
                {d > 0 ? `+${d}` : d}°
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
