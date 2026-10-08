"use client";

import { useCallback, useRef, useState } from "react";
import { arrivalYaw } from "@/lib/geometry";
import { mediaUrl } from "@/lib/pano";
import type { TourConfig } from "@/lib/types";
import FloorPlanMap, { type FloorPlanHandle } from "./FloorPlanMap";
import Modal, { useAssetExists } from "./Modal";
import PanoViewer from "./PanoViewer";
import RoomMenu from "./RoomMenu";

type ModalKind = "video" | "brochure" | null;

export default function Tour({ config: tour }: { config: TourConfig }) {
  // Only rooms with a photo are part of the public tour.
  const rooms = tour.rooms.filter((r) => r.pano);
  const [roomId, setRoomId] = useState(tour.startRoom);
  /** Set when arriving through a hotspot, so the visitor keeps facing the way they walked. */
  const [arriveYaw, setArriveYaw] = useState<number | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const mapRef = useRef<FloorPlanHandle>(null);
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];

  const handleView = useCallback((yaw: number, hfov: number) => mapRef.current?.update(yaw, hfov), []);
  const stopAutoRotate = useCallback(() => setAutoRotate(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeModal = useCallback(() => setModal(null), []);

  const selectRoom = useCallback((id: string) => {
    setRoomId(id);
    setArriveYaw(null);
    setMenuOpen(false);
  }, []);

  const roomIds = new Set(rooms.map((r) => r.id));
  const hotspots = (room?.hotspots ?? [])
    .filter((h) => roomIds.has(h.target))
    .map((h) => ({ id: h.id, yaw: h.yaw, pitch: h.pitch, label: rooms.find((r) => r.id === h.target)!.name }));

  const followHotspot = (id: string) => {
    const h = room?.hotspots.find((x) => x.id === id);
    const target = h && rooms.find((r) => r.id === h.target);
    if (!room || !target) return;
    setArriveYaw(arrivalYaw(room, target, tour.floorPlan) ?? target.initialYaw);
    setRoomId(target.id);
  };

  if (!room) {
    return (
      <main className="tour tour-empty">
        <p className="tour-eyebrow">{tour.projectName}</p>
        <h1>The virtual tour is coming soon.</h1>
      </main>
    );
  }

  return (
    <main className="tour">
      <PanoViewer
        pano={room.pano}
        initialYaw={arriveYaw ?? room.initialYaw}
        autoRotate={autoRotate}
        autoRotateSpeed={tour.autoRotateSpeed}
        onInteract={stopAutoRotate}
        onViewChange={handleView}
        hotspots={hotspots}
        onHotspotClick={followHotspot}
      />

      <header className="tour-header">
        <p className="tour-eyebrow">{tour.projectName}</p>
        <h1>
          {tour.unitName} <span>· {room.name}</span>
        </h1>
      </header>

      {tour.floorPlan.file && (
        <FloorPlanMap
          ref={mapRef}
          src={mediaUrl(tour.floorPlan.file)}
          width={tour.floorPlan.width}
          height={tour.floorPlan.height}
          rooms={rooms}
          currentRoom={room}
          onSelectRoom={selectRoom}
        />
      )}

      <div className={`drag-hint${autoRotate ? " is-visible" : ""}`} aria-hidden>
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path
            d="M8 13V5.5a1.5 1.5 0 013 0V12m0-1.5v-2a1.5 1.5 0 013 0V12m0-1a1.5 1.5 0 013 0v1m0 0a1.5 1.5 0 013 0V16a6 6 0 01-6 6h-2a6 6 0 01-4.6-2.2L4.6 16.6a1.5 1.5 0 012.3-1.9L8 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Click and drag to look around
      </div>

      <nav className="action-bar" aria-label="Tour actions">
        <button type="button" className="action-btn is-primary" onClick={() => setMenuOpen(true)}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path
              d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          Explore Rooms
        </button>
        <button type="button" className="action-btn" onClick={() => setModal("video")}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M10 8.5l5.5 3.5-5.5 3.5z" fill="currentColor" />
          </svg>
          Video Walkthrough
        </button>
        <button type="button" className="action-btn" onClick={() => setModal("brochure")}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path
              d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8zM14 3v5h5M8.5 13h7M8.5 17h7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          Brochure
        </button>
      </nav>

      <RoomMenu
        open={menuOpen}
        rooms={rooms}
        currentId={room.id}
        onSelect={selectRoom}
        onClose={closeMenu}
      />

      <Modal open={modal === "video"} title="Video Walkthrough" onClose={closeModal}>
        <VideoContent video={tour.video} />
      </Modal>

      <Modal
        open={modal === "brochure"}
        title="Brochure"
        onClose={closeModal}
        actions={
          tour.brochure.file && (
            <a className="pill-btn" href={mediaUrl(tour.brochure.file)} download={tour.brochure.downloadName}>
              Download
            </a>
          )
        }
      >
        <BrochureContent file={tour.brochure.file} />
      </Modal>
    </main>
  );
}

function VideoContent({ video }: { video: TourConfig["video"] }) {
  const { youtubeId } = video;
  const src = mediaUrl(video.file);
  const status = useAssetExists(src, !youtubeId && !!src);

  if (youtubeId) {
    return (
      <div className="media-frame">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
          title="Video walkthrough"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }
  if (!src || status === "missing") return <Missing what="walkthrough video" />;
  return (
    <div className="media-frame">
      {status === "ok" && <video src={src} controls autoPlay playsInline />}
    </div>
  );
}

function BrochureContent({ file }: { file: string }) {
  const src = mediaUrl(file);
  const status = useAssetExists(src, !!src);

  if (!src || status === "missing") return <Missing what="brochure" />;
  return (
    <div className="media-frame is-document">
      {status === "ok" && <iframe src={`${src}#view=FitH`} title="Brochure" />}
      <a className="pill-btn brochure-mobile-open" href={src} target="_blank" rel="noreferrer">
        Open brochure
      </a>
    </div>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <div className="missing">
      <p>The {what} will be available soon.</p>
    </div>
  );
}
