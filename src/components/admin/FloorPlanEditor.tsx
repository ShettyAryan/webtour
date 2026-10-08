"use client";

import { useRef, useState, type PointerEvent } from "react";
import { wrapDeg } from "@/lib/geometry";
import { mediaUrl } from "@/lib/pano";
import type { Room, TourConfig } from "@/lib/types";
import FloorPlanSvg from "../FloorPlanSvg";
import UploadField from "./UploadField";

type Props = {
  config: TourConfig;
  setConfig: (update: (c: TourConfig) => TourConfig) => void;
  onEditRoom: (id: string) => void;
};

type Rect = { x: number; y: number; w: number; h: number };

export default function FloorPlanEditor({ config, setConfig, onEditRoom }: Props) {
  const { floorPlan, rooms } = config;
  const [selectedId, setSelectedId] = useState<string | null>(rooms.find((r) => !r.plan)?.id ?? null);
  const [cropping, setCropping] = useState(false);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = rooms.find((r) => r.id === selectedId) ?? null;

  const setRoomPlan = (id: string, plan: Room["plan"]) =>
    setConfig((c) => ({ ...c, rooms: c.rooms.map((r) => (r.id === id ? { ...r, plan } : r)) }));

  /** Server-side edit → new image; then remap every access point so it stays on the same spot. */
  const edit = async (
    payload: Record<string, unknown>,
    remap: (r: Room) => Room,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/floorplan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: floorPlan.file, ...payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Edit failed");
      setConfig((c) => ({
        ...c,
        floorPlan: { file: body.file, width: body.width, height: body.height },
        rooms: c.rooms.map(remap),
      }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rotate = (angle: 90 | -90) =>
    edit({ op: "rotate", angle }, (r) => ({
      ...r,
      plan: r.plan && (angle === 90 ? { x: 1 - r.plan.y, y: r.plan.x } : { x: r.plan.y, y: 1 - r.plan.x }),
      // The plan turned, so every room's "plan-up" direction turns with it.
      headingOffset: wrapDeg(r.headingOffset + angle),
    }));

  const applyCrop = () => {
    if (!crop || crop.w < 0.05 || crop.h < 0.05) return setError("Drag a larger crop area first.");
    const outside = rooms.filter(
      (r) => r.plan && (r.plan.x < crop.x || r.plan.x > crop.x + crop.w || r.plan.y < crop.y || r.plan.y > crop.y + crop.h),
    );
    if (
      outside.length &&
      !confirm(`${outside.map((r) => r.name).join(", ")} ${outside.length > 1 ? "are" : "is"} outside the crop and will lose ${outside.length > 1 ? "their" : "its"} access point. Continue?`)
    ) {
      return;
    }
    const round = (n: number) => +n.toFixed(4);
    edit({ op: "crop", crop }, (r) => {
      if (!r.plan) return r;
      const x = (r.plan.x - crop.x) / crop.w;
      const y = (r.plan.y - crop.y) / crop.h;
      return { ...r, plan: x < 0 || x > 1 || y < 0 || y > 1 ? null : { x: round(x), y: round(y) } };
    }).then(() => {
      setCropping(false);
      setCrop(null);
    });
  };

  const removePlan = () => {
    if (!confirm("Remove the floor plan? Access points are kept and reappear if you upload a plan again.")) return;
    setConfig((c) => ({ ...c, floorPlan: { ...c.floorPlan, file: "" } }));
  };

  return (
    <div className="admin-page wide">
      <section className="card">
        <header className="card-head">
          <h3>Floor plan image</h3>
          <p>
            Upload or replace the plan (SVG, PNG, JPG, WebP). Access points are stored relative to the plan – after
            replacing it with a different layout or framing, drag the points to their new spots.
          </p>
        </header>

        <UploadField
          kind="floorplan"
          accept=".svg,.png,.jpg,.jpeg,.webp"
          label="Floor plan"
          current={floorPlan.file}
          onUploaded={(r) =>
            setConfig((c) => ({ ...c, floorPlan: { file: r.file, width: r.width ?? 1000, height: r.height ?? 700 } }))
          }
          onRemove={removePlan}
        />

        {floorPlan.file && (
          <div className="toolbar">
            <button type="button" className="ghost-btn" disabled={busy || cropping} onClick={() => rotate(-90)}>
              ⟲ Rotate left
            </button>
            <button type="button" className="ghost-btn" disabled={busy || cropping} onClick={() => rotate(90)}>
              ⟳ Rotate right
            </button>
            {cropping ? (
              <>
                <button type="button" className="primary-btn" disabled={busy || !crop} onClick={applyCrop}>
                  Apply crop
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={busy}
                  onClick={() => {
                    setCropping(false);
                    setCrop(null);
                  }}
                >
                  Cancel
                </button>
                <span className="muted small">Drag on the plan to select the area to keep.</span>
              </>
            ) : (
              <button type="button" className="ghost-btn" disabled={busy} onClick={() => setCropping(true)}>
                ✂ Crop
              </button>
            )}
            {busy && <span className="muted small">Working…</span>}
          </div>
        )}
        {error && <p className="notice error">{error}</p>}
      </section>

      {floorPlan.file && (
        <div className="plan-editor">
          <section className="card plan-editor-canvas">
            <header className="card-head">
              <h3>Access points</h3>
              <p>
                Drag a point to move it. To place a room that isn’t on the plan yet, select it on the right and click the
                plan. The cone shows which way the centre of that room’s photo faces.
              </p>
            </header>
            <div className="plan-box">
              <FloorPlanSvg
                src={mediaUrl(floorPlan.file)}
                width={floorPlan.width}
                height={floorPlan.height}
                rooms={rooms}
                currentId={selectedId}
                showLabels
                onSelectRoom={cropping ? undefined : setSelectedId}
                onMoveRoom={cropping ? undefined : (id, x, y) => setRoomPlan(id, { x, y })}
                onPlanClick={
                  !cropping && selected && !selected.plan
                    ? (x, y) => setRoomPlan(selected.id, { x: +x.toFixed(4), y: +y.toFixed(4) })
                    : undefined
                }
              />
              {cropping && <CropOverlay rect={crop} onChange={setCrop} />}
              {!cropping && selected && !selected.plan && (
                <div className="plan-hint">Click to place “{selected.name}”</div>
              )}
            </div>
          </section>

          <aside className="card plan-editor-list">
            <header className="card-head">
              <h3>Rooms</h3>
            </header>
            <ul>
              {rooms.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`plan-room${r.id === selectedId ? " is-active" : ""}`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <span>{r.name}</span>
                    {r.plan ? <em className="badge ok">Placed</em> : <em className="badge warn">Not placed</em>}
                  </button>
                </li>
              ))}
            </ul>
            {selected && (
              <div className="plan-room-actions">
                <button type="button" className="ghost-btn small" onClick={() => onEditRoom(selected.id)}>
                  Edit “{selected.name}” →
                </button>
                {selected.plan && (
                  <button type="button" className="link-btn danger" onClick={() => setRoomPlan(selected.id, null)}>
                    Remove point
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/** Rubber-band rectangle drawn over the plan; reports fractions 0–1. */
function CropOverlay({ rect, onChange }: { rect: Rect | null; onChange: (r: Rect) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const frac = (e: PointerEvent) => {
    const b = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)),
      y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)),
    };
  };

  return (
    <div
      ref={boxRef}
      className="crop-overlay"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = frac(e);
        onChange({ ...start.current, w: 0, h: 0 });
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const p = frac(e);
        const s = start.current;
        onChange({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
      }}
      onPointerUp={() => (start.current = null)}
    >
      {rect && rect.w > 0 && (
        <div
          className="crop-rect"
          style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
        />
      )}
    </div>
  );
}
