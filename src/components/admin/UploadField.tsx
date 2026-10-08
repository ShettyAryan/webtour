"use client";

import { useRef, useState, type ReactNode } from "react";

export type UploadKind = "pano" | "floorplan" | "video" | "brochure";
export type UploadResult = { file: string; width?: number; height?: number; warning?: string };

/** Streams a file to /api/admin/upload with progress (fetch can't report upload progress). */
export function uploadFile(kind: UploadKind, file: File, onProgress?: (p: number) => void) {
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/upload?kind=${kind}&name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body: any = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error – check your connection and try again."));
    xhr.send(file);
  });
}

type Props = {
  kind: UploadKind;
  accept: string;
  label: string;
  hint?: string;
  /** Current file name, if any */
  current?: string;
  onUploaded: (result: UploadResult) => void;
  onRemove?: () => void;
  children?: ReactNode;
};

/** Drag-and-drop / click-to-browse upload box. */
export default function UploadField({ kind, accept, label, hint, current, onUploaded, onRemove, children }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const start = async (file: File | undefined) => {
    if (!file || progress !== null) return;
    setError(null);
    setWarning(null);
    setProgress(0);
    try {
      const result = await uploadFile(kind, file, setProgress);
      setWarning(result.warning ?? null);
      onUploaded(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="upload-field">
      <div
        className={`dropzone${over ? " is-over" : ""}${progress !== null ? " is-busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          start(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      >
        {children}
        <div className="dropzone-text">
          {progress !== null ? (
            <>
              <strong>Uploading… {Math.round(progress * 100)}%</strong>
              <span className="progress">
                <span style={{ width: `${progress * 100}%` }} />
              </span>
            </>
          ) : (
            <>
              <strong>{current ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}</strong>
              <span>Drop a file here or click to browse{hint ? ` · ${hint}` : ""}</span>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          hidden
          onChange={(e) => start(e.target.files?.[0])}
        />
      </div>

      {current && (
        <div className="upload-current">
          <span title={current}>{current}</span>
          {onRemove && (
            <button type="button" className="link-btn danger" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      )}
      {warning && <p className="notice warn">{warning}</p>}
      {error && <p className="notice error">{error}</p>}
    </div>
  );
}
