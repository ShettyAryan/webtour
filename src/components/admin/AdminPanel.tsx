"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { panoUrl, parseYoutubeId } from "@/lib/pano";
import type { Room, TourConfig } from "@/lib/types";
import FloorPlanEditor from "./FloorPlanEditor";
import RoomEditor from "./RoomEditor";
import UploadField from "./UploadField";

type Tab = "rooms" | "plan" | "settings";

export default function AdminPanel({ initial }: { initial: TourConfig }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [tab, setTab] = useState<Tab>("rooms");
  const [selectedId, setSelectedId] = useState(initial.rooms[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty = useMemo(() => JSON.stringify(draft) !== saved, [draft, saved]);
  const selectedIndex = draft.rooms.findIndex((r) => r.id === selectedId);
  const selected = draft.rooms[selectedIndex] ?? null;

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const patch = (p: Partial<TourConfig>) => setDraft((d) => ({ ...d, ...p }));

  const patchRoom = (id: string, p: Partial<Room>) =>
    setDraft((d) => ({ ...d, rooms: d.rooms.map((r) => (r.id === id ? { ...r, ...p } : r)) }));

  const addRoom = () => {
    const room: Room = {
      id: `room-${Date.now().toString(36)}`,
      name: `Room ${draft.rooms.length + 1}`,
      pano: "",
      plan: null,
      headingOffset: 0,
      initialYaw: 0,
      hotspots: [],
    };
    setDraft((d) => ({ ...d, rooms: [...d.rooms, room], startRoom: d.startRoom || room.id }));
    setSelectedId(room.id);
    setTab("rooms");
  };

  const deleteRoom = (id: string) => {
    const room = draft.rooms.find((r) => r.id === id);
    if (!room || !confirm(`Delete “${room.name}”? Its photo is removed when you save.`)) return;
    // Also drop hotspots in other rooms that led to the deleted one.
    const rooms = draft.rooms
      .filter((r) => r.id !== id)
      .map((r) => ({ ...r, hotspots: r.hotspots.filter((h) => h.target !== id) }));
    setDraft((d) => ({ ...d, rooms, startRoom: d.startRoom === id ? (rooms[0]?.id ?? "") : d.startRoom }));
    setSelectedId(rooms[Math.max(0, selectedIndex - 1)]?.id ?? null);
  };

  const moveRoom = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const i = d.rooms.findIndex((r) => r.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.rooms.length) return d;
      const rooms = [...d.rooms];
      [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
      return { ...d, rooms };
    });

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tour", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (res.status === 401) {
        router.refresh();
        throw new Error("Your session expired – sign in again.");
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
      const next = (await res.json()) as TourConfig;
      setDraft(next);
      setSaved(JSON.stringify(next));
      setToast({ kind: "ok", text: "Saved – changes are live on the tour." });
    } catch (err) {
      setToast({ kind: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!confirm("Discard all unsaved changes?")) return;
    const restored = JSON.parse(saved) as TourConfig;
    setDraft(restored);
    if (!restored.rooms.some((r) => r.id === selectedId)) setSelectedId(restored.rooms[0]?.id ?? null);
  };

  const logout = async () => {
    if (dirty && !confirm("You have unsaved changes. Sign out anyway?")) return;
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  };

  const problems = draft.rooms.filter((r) => !r.pano || !r.plan).length;

  return (
    <div className="admin">
      <header className="admin-bar">
        <div className="admin-title">
          <strong>Tour Admin</strong>
          <span>{draft.projectName}</span>
        </div>
        <nav className="admin-tabs">
          {(
            [
              ["rooms", `Rooms (${draft.rooms.length})`],
              ["plan", "Floor plan"],
              ["settings", "Video, brochure & settings"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-bar-actions">
          <a className="ghost-btn" href="/" target="_blank" rel="noreferrer">
            View tour ↗
          </a>
          {dirty && (
            <button type="button" className="ghost-btn" onClick={discard} disabled={saving}>
              Discard
            </button>
          )}
          <button type="button" className="primary-btn" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
          <button type="button" className="link-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {tab === "rooms" && (
        <div className="admin-rooms">
          <aside className="room-list">
            <button type="button" className="primary-btn wide" onClick={addRoom}>
              + Add room
            </button>
            {problems > 0 && (
              <p className="notice warn small">
                {problems} room{problems > 1 ? "s" : ""} need{problems > 1 ? "" : "s"} a photo or access point.
              </p>
            )}
            <ul>
              {draft.rooms.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`room-list-item${r.id === selectedId ? " is-active" : ""}`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <span className="thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {r.pano ? <img src={panoUrl(r.pano, 320)} alt="" loading="lazy" /> : <span>No photo</span>}
                    </span>
                    <span className="room-list-text">
                      <strong>
                        {draft.startRoom === r.id && <span title="Opening room">★ </span>}
                        {r.name}
                      </strong>
                      <span className="badges">
                        {!r.pano && <em className="badge warn">No photo</em>}
                        {!r.plan && <em className="badge warn">Not on plan</em>}
                        {r.pano && r.plan && <em className="badge ok">Ready</em>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <main className="room-main">
            {selected ? (
              <RoomEditor
                key={selected.id}
                room={selected}
                index={selectedIndex}
                config={draft}
                onChange={(p) => patchRoom(selected.id, p)}
                onPatchRoom={patchRoom}
                onDelete={() => deleteRoom(selected.id)}
                onMove={(dir) => moveRoom(selected.id, dir)}
                onMakeStart={() => patch({ startRoom: selected.id })}
              />
            ) : (
              <div className="empty-state">
                <h2>No rooms yet</h2>
                <p>Add a room, upload its 360° photo and place it on the floor plan.</p>
                <button type="button" className="primary-btn" onClick={addRoom}>
                  + Add room
                </button>
              </div>
            )}
          </main>
        </div>
      )}

      {tab === "plan" && (
        <FloorPlanEditor
          config={draft}
          setConfig={setDraft}
          onEditRoom={(id) => {
            setSelectedId(id);
            setTab("rooms");
          }}
        />
      )}

      {tab === "settings" && (
        <SettingsTab draft={draft} patch={patch} />
      )}

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}

function SettingsTab({ draft, patch }: { draft: TourConfig; patch: (p: Partial<TourConfig>) => void }) {
  const [youtubeInput, setYoutubeInput] = useState(draft.video.youtubeId);
  const ytValid = !youtubeInput || !!parseYoutubeId(youtubeInput);

  return (
    <div className="admin-page">
      <section className="card">
        <header className="card-head">
          <h3>Project</h3>
        </header>
        <div className="form-grid">
          <label className="field">
            <span>Project name</span>
            <input value={draft.projectName} maxLength={120} onChange={(e) => patch({ projectName: e.target.value })} />
          </label>
          <label className="field">
            <span>Unit name</span>
            <input value={draft.unitName} maxLength={120} onChange={(e) => patch({ unitName: e.target.value })} />
          </label>
          <label className="field">
            <span>Opening room</span>
            <select value={draft.startRoom} onChange={(e) => patch({ startRoom: e.target.value })}>
              {draft.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Auto-rotate speed · {draft.autoRotateSpeed}°/s</span>
            <input
              type="range"
              min={0}
              max={15}
              step={0.5}
              value={draft.autoRotateSpeed}
              onChange={(e) => patch({ autoRotateSpeed: Number(e.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <header className="card-head">
          <h3>Video walkthrough</h3>
          <p>Upload an MP4/WebM, or paste a YouTube link (YouTube is used when both are set).</p>
        </header>
        <UploadField
          kind="video"
          accept=".mp4,.webm,.mov"
          label="Video"
          current={draft.video.file}
          onUploaded={(r) => patch({ video: { ...draft.video, file: r.file } })}
          onRemove={() => patch({ video: { ...draft.video, file: "" } })}
        />
        <label className="field">
          <span>YouTube link or ID</span>
          <input
            value={youtubeInput}
            placeholder="https://youtu.be/…"
            onChange={(e) => {
              setYoutubeInput(e.target.value);
              patch({ video: { ...draft.video, youtubeId: parseYoutubeId(e.target.value) } });
            }}
          />
        </label>
        {!ytValid && <p className="notice error small">That doesn’t look like a YouTube link.</p>}
      </section>

      <section className="card">
        <header className="card-head">
          <h3>Brochure</h3>
          <p>PDF shown in the Brochure window, with a download button.</p>
        </header>
        <UploadField
          kind="brochure"
          accept=".pdf"
          label="Brochure"
          current={draft.brochure.file}
          onUploaded={(r) => patch({ brochure: { ...draft.brochure, file: r.file } })}
          onRemove={() => patch({ brochure: { ...draft.brochure, file: "" } })}
        />
        <label className="field">
          <span>Download file name</span>
          <input
            value={draft.brochure.downloadName}
            maxLength={120}
            onChange={(e) => patch({ brochure: { ...draft.brochure, downloadName: e.target.value } })}
          />
        </label>
      </section>
    </div>
  );
}
