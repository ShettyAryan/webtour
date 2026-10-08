"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CloseIcon } from "./RoomMenu";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
};

export default function Modal({ open, title, onClose, children, actions }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <div className="modal-actions">
            {actions}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" autoFocus>
              <CloseIcon />
            </button>
          </div>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Checks a /public asset exists so we can show a friendly message instead of a broken embed. */
export function useAssetExists(src: string, enabled: boolean) {
  const [state, setState] = useState<"checking" | "ok" | "missing">("checking");
  useEffect(() => {
    if (!enabled) return;
    if (/^https?:\/\//.test(src)) return setState("ok");
    let alive = true;
    setState("checking");
    fetch(src, { method: "HEAD" })
      .then((r) => alive && setState(r.ok ? "ok" : "missing"))
      .catch(() => alive && setState("missing"));
    return () => {
      alive = false;
    };
  }, [src, enabled]);
  return state;
}
