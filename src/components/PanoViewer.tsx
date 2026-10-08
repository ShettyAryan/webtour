"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { panoUrl } from "@/lib/pano";

export type ViewerHotspot = {
  id: string;
  /** Degrees; 0 = centre of the panorama image, clockwise */
  yaw: number;
  /** Degrees above (+) / below (−) the horizon */
  pitch: number;
  label: string;
  active?: boolean;
};

export type PanoViewerHandle = {
  /** Smoothly turn the camera to face a direction. */
  lookAt: (yaw: number, pitch?: number) => void;
  getView: () => { yaw: number; pitch: number; hfov: number };
};

type Props = {
  /** File name inside data/panos, or a hosted image URL ("" = no photo yet) */
  pano: string;
  /** Degrees; 0 = centre of the panorama image */
  initialYaw?: number;
  autoRotate: boolean;
  /** Degrees per second */
  autoRotateSpeed?: number;
  /** Fired on the first click / touch / wheel / key anywhere on the page */
  onInteract?: () => void;
  /** Fired whenever the view changes. yaw in degrees (clockwise), hfov in degrees */
  onViewChange?: (yaw: number, hfov: number) => void;
  hotspots?: ViewerHotspot[];
  onHotspotClick?: (id: string) => void;
  /** When true, a click on the photo reports the clicked direction via onPick instead of doing nothing. */
  pickMode?: boolean;
  onPick?: (yaw: number, pitch: number) => void;
};

type Ctx = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  material: THREE.MeshBasicMaterial;
  textureWidth: number;
  view: { lon: number; lat: number; fov: number };
  anim: { fromLon: number; fromLat: number; toLon: number; toLat: number; start: number } | null;
};

const MIN_FOV = 30;
const MAX_FOV = 100;
const FADE_MS = 350;
const TURN_MS = 650;

const { degToRad, radToDeg, clamp } = THREE.MathUtils;

/** Unit vector for a viewing direction (lon/lat in degrees, three.js panorama convention). */
function direction(out: THREE.Vector3, lon: number, lat: number) {
  const phi = degToRad(90 - lat);
  const theta = degToRad(lon);
  return out.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
}

const PanoViewer = forwardRef<PanoViewerHandle, Props>(function PanoViewer(
  {
    pano,
    initialYaw = 0,
    autoRotate,
    autoRotateSpeed = 4,
    onInteract,
    onViewChange,
    hotspots = [],
    onHotspotClick,
    pickMode = false,
    onPick,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<Ctx | null>(null);
  const autoRotateRef = useRef(autoRotate);
  const speedRef = useRef(autoRotateSpeed);
  const onInteractRef = useRef(onInteract);
  const onViewChangeRef = useRef(onViewChange);
  const initialYawRef = useRef(initialYaw);
  const hotspotsRef = useRef(hotspots);
  const pickModeRef = useRef(pickMode);
  const onPickRef = useRef(onPick);
  const hotspotEls = useRef(new Map<string, HTMLElement>());
  const [loading, setLoading] = useState(true);
  const [covered, setCovered] = useState(true);
  const [error, setError] = useState<string | null>(null);

  autoRotateRef.current = autoRotate;
  speedRef.current = autoRotateSpeed;
  onInteractRef.current = onInteract;
  onViewChangeRef.current = onViewChange;
  initialYawRef.current = initialYaw;
  hotspotsRef.current = hotspots;
  pickModeRef.current = pickMode;
  onPickRef.current = onPick;

  useImperativeHandle(ref, () => ({
    lookAt(yaw, pitch = 0) {
      const ctx = ctxRef.current;
      if (!ctx) return;
      // Turn the short way round.
      let toLon = yaw + 180;
      toLon = ctx.view.lon + ((((toLon - ctx.view.lon + 180) % 360) + 360) % 360) - 180;
      ctx.anim = { fromLon: ctx.view.lon, fromLat: ctx.view.lat, toLon, toLat: pitch, start: performance.now() };
    },
    getView() {
      const ctx = ctxRef.current;
      if (!ctx) return { yaw: 0, pitch: 0, hfov: 90 };
      const hfov = radToDeg(2 * Math.atan(Math.tan(degToRad(ctx.view.fov / 2)) * ctx.camera.aspect));
      return { yaw: ctx.view.lon - 180, pitch: ctx.view.lat, hfov };
    },
  }));

  // ── Scene setup (once) ────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x0d0f12, 1);
    container.prepend(renderer.domElement);
    const canvas = renderer.domElement;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1100);
    const geometry = new THREE.SphereGeometry(500, 120, 80);
    geometry.scale(-1, 1, 1); // view the texture from inside the sphere
    const material = new THREE.MeshBasicMaterial({ color: 0x0d0f12 });
    scene.add(new THREE.Mesh(geometry, material));

    // Phones get a 4096 texture (memory), desktops up to 8192 – never above GPU max.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const textureWidth = Math.min(renderer.capabilities.maxTextureSize, coarse ? 4096 : 8192);

    // lon: 0 = left edge of the equirectangular image, increasing = turning right.
    const view = { lon: 180, lat: 0, fov: 75 };
    const ctx: Ctx = { renderer, camera, material, textureWidth, view, anim: null };
    ctxRef.current = ctx;

    // ── Sizing: always fill the container exactly ──
    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Portrait screens get a wider vertical FOV so the room doesn't feel cramped.
      if (view.fov === 75 || view.fov === 90) view.fov = camera.aspect < 1 ? 90 : 75;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // ── Input ──
    let interacted = false;
    const markInteracted = () => {
      if (interacted) return;
      interacted = true;
      onInteractRef.current?.();
    };
    window.addEventListener("pointerdown", markInteracted, true);
    window.addEventListener("keydown", markInteracted, true);

    const pointers = new Map<number, { x: number; y: number }>();
    let velLon = 0;
    let velLat = 0;
    let lastMoveTime = 0;
    let pinchStartDist = 0;
    let pinchStartFov = view.fov;
    let down: { x: number; y: number; t: number } | null = null;

    const pinchDistance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      velLon = velLat = 0;
      ctx.anim = null;
      lastMoveTime = performance.now();
      down = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: lastMoveTime } : null;
      if (pointers.size === 2) {
        pinchStartDist = pinchDistance();
        pinchStartFov = view.fov;
      }
      container.classList.add("is-dragging");
    };

    const onPointerMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const now = performance.now();

      if (pointers.size === 1) {
        const degPerPx = view.fov / container.clientHeight;
        const dLon = -(e.clientX - prev.x) * degPerPx;
        const dLat = (e.clientY - prev.y) * degPerPx;
        view.lon += dLon;
        view.lat += dLat;
        const dt = Math.max(1, now - lastMoveTime) / 1000;
        velLon = dLon / dt;
        velLat = dLat / dt;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStartDist > 0) {
        view.fov = clamp((pinchStartFov * pinchStartDist) / pinchDistance(), MIN_FOV, MAX_FOV);
      }
      lastMoveTime = now;
    };

    const ray = new THREE.Vector3();
    const onPointerUp = (e: PointerEvent) => {
      const wasTap =
        down && pointers.size === 1 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 500;
      pointers.delete(e.pointerId);
      if (performance.now() - lastMoveTime > 80) velLon = velLat = 0; // no fling if finger rested
      if (pointers.size < 2) pinchStartDist = 0;
      if (pointers.size === 0) container.classList.remove("is-dragging");

      if (wasTap && pickModeRef.current && onPickRef.current) {
        velLon = velLat = 0;
        const rect = canvas.getBoundingClientRect();
        ray
          .set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1), 0.5)
          .unproject(camera)
          .normalize();
        const lat = radToDeg(Math.asin(clamp(ray.y, -1, 1)));
        const lon = radToDeg(Math.atan2(ray.z, ray.x));
        let yaw = lon - 180;
        yaw = ((((yaw + 180) % 360) + 360) % 360) - 180;
        onPickRef.current(Math.round(yaw * 10) / 10, Math.round(lat * 10) / 10);
      }
      down = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      markInteracted();
      view.fov = clamp(view.fov + e.deltaY * 0.04, MIN_FOV, MAX_FOV);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // ── Render loop ──
    const target = new THREE.Vector3();
    const hs = new THREE.Vector3();
    let last = performance.now();
    let lastEmit = "";
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (ctx.anim) {
        const t = Math.min(1, (now - ctx.anim.start) / TURN_MS);
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // easeInOutQuad
        view.lon = ctx.anim.fromLon + (ctx.anim.toLon - ctx.anim.fromLon) * e;
        view.lat = ctx.anim.fromLat + (ctx.anim.toLat - ctx.anim.fromLat) * e;
        if (t >= 1) ctx.anim = null;
      } else if (pointers.size === 0) {
        if (autoRotateRef.current) {
          view.lon += speedRef.current * dt;
        } else if (Math.abs(velLon) + Math.abs(velLat) > 0.01) {
          view.lon += velLon * dt;
          view.lat += velLat * dt;
          const decay = Math.exp(-dt * 5);
          velLon *= decay;
          velLat *= decay;
        }
      }

      view.lat = clamp(view.lat, -85, 85);
      if (!ctx.anim) view.lon = ((view.lon % 360) + 360) % 360;

      direction(target, view.lon, view.lat);
      camera.lookAt(target);
      if (camera.fov !== view.fov) camera.fov = view.fov;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);

      // ── Hotspots: project each one to screen space ──
      const list = hotspotsRef.current;
      if (list.length) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        for (const spot of list) {
          const el = hotspotEls.current.get(spot.id);
          if (!el) continue;
          direction(hs, spot.yaw + 180, spot.pitch);
          if (hs.dot(target) < 0.05) {
            el.style.visibility = "hidden";
            continue;
          }
          hs.project(camera);
          const x = ((hs.x + 1) / 2) * w;
          const y = ((1 - hs.y) / 2) * h;
          if (x < -80 || x > w + 80 || y < -80 || y > h + 80) {
            el.style.visibility = "hidden";
          } else {
            el.style.visibility = "visible";
            el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          }
        }
      }

      const hfov = radToDeg(2 * Math.atan(Math.tan(degToRad(view.fov / 2)) * camera.aspect));
      const yaw = (((view.lon % 360) + 360) % 360) - 180;
      const sig = `${yaw.toFixed(1)}|${hfov.toFixed(1)}`;
      if (sig !== lastEmit) {
        lastEmit = sig;
        onViewChangeRef.current?.(yaw, hfov);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointerdown", markInteracted, true);
      window.removeEventListener("keydown", markInteracted, true);
      canvas.removeEventListener("wheel", onWheel);
      material.map?.dispose();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
      canvas.remove();
      ctxRef.current = null;
    };
  }, []);

  // ── Load / swap panorama ──────────────────────────────────────────────
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    let cancelled = false;

    setCovered(true);
    setError(null);
    if (!pano) {
      ctx.material.map?.dispose();
      ctx.material.map = null;
      ctx.material.color.set(0x0d0f12);
      ctx.material.needsUpdate = true;
      setLoading(false);
      setError("No 360 photo uploaded for this room yet.");
      return;
    }
    setLoading(true);

    const url = panoUrl(pano, ctx.textureWidth);
    const load = new THREE.TextureLoader().loadAsync(url);
    const fadeIn = new Promise((r) => setTimeout(r, FADE_MS));

    Promise.all([load, fadeIn])
      .then(([texture]) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
        texture.wrapS = THREE.RepeatWrapping; // seamless at the 0°/360° seam
        ctx.renderer.initTexture(texture); // upload now so the reveal doesn't stutter

        const old = ctx.material.map;
        ctx.material.map = texture;
        ctx.material.color.set(0xffffff);
        ctx.material.needsUpdate = true;
        old?.dispose();

        ctx.anim = null;
        ctx.view.lon = initialYawRef.current + 180;
        ctx.view.lat = 0;
        setLoading(false);
        requestAnimationFrame(() => !cancelled && setCovered(false));
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError("This panorama could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, [pano]);

  return (
    <div ref={containerRef} className={`pano-viewer${pickMode ? " is-picking" : ""}`}>
      <div className={`hotspot-layer${covered ? " is-hidden" : ""}`}>
        {hotspots.map((h) => (
          <button
            key={h.id}
            type="button"
            className={`hotspot${h.active ? " is-active" : ""}`}
            ref={(el) => {
              if (el) hotspotEls.current.set(h.id, el);
              else hotspotEls.current.delete(h.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onHotspotClick?.(h.id);
            }}
            aria-label={`Go to ${h.label}`}
          >
            <span className="hotspot-inner">
              <span className="hotspot-ring">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                  <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="hotspot-label">{h.label}</span>
            </span>
          </button>
        ))}
      </div>
      <div className={`pano-cover${covered ? " is-visible" : ""}`} aria-hidden />
      {loading && (
        <div className="pano-status">
          <span className="spinner" />
          Loading view…
        </div>
      )}
      {error && <div className="pano-status pano-error">{error}</div>}
    </div>
  );
});

export default PanoViewer;
