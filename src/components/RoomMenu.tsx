"use client";

import { useEffect, useState } from "react";
import type { Room } from "@/lib/types";
import { panoUrl } from "@/lib/pano";

type Props = {
  open: boolean;
  rooms: Room[];
  currentId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
};

export default function RoomMenu({ open, rooms, currentId, onSelect, onClose }: Props) {
  // Only fetch thumbnails once the menu has been opened, then keep them.
  const [wasOpened, setWasOpened] = useState(false);
  if (open && !wasOpened) setWasOpened(true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div className={`scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden />
      <section className={`room-menu${open ? " is-open" : ""}`} aria-label="Rooms" aria-hidden={!open}>
        <header className="room-menu-header">
          <h2>Explore Rooms</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" tabIndex={open ? 0 : -1}>
            <CloseIcon />
          </button>
        </header>
        <ul className="room-grid">
          {rooms.map((room) => (
            <li key={room.id}>
              <button
                type="button"
                className={`room-card${room.id === currentId ? " is-active" : ""}`}
                onClick={() => onSelect(room.id)}
                tabIndex={open ? 0 : -1}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={wasOpened ? panoUrl(room.pano, 640) : undefined} alt="" loading="lazy" />
                <span>{room.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
