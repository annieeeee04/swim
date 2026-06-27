import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface ZoneLayout {
  key: string;
  label: string;
  shape: "rect" | "ellipse";
  x: number;
  z: number;
  width: number;
  depth: number;
  poolLength: 25 | 50 | null;
  count: number;
}

interface AquaticCenterSceneProps {
  zones: ZoneLayout[];
  activeZoneKey: string | null;
  onPickZone?: (key: string) => void;
}

function zoneColor(zone: ZoneLayout): number {
  if (zone.key === "hot-tub") return 0xf59e0b;
  if (zone.key === "leisure") return 0x14b8a6;
  if (zone.poolLength === 50) return 0xa855f7;
  if (zone.poolLength === 25) return 0x38bdf8;
  return 0x94a3b8;
}

/** Short text label drawn onto a canvas, used both for the zone-name plate
 *  and the session-count badge. */
function makeLabelSprite(text: string, opts: { bg?: string; fg?: string; w?: number; h?: number } = {}): THREE.Sprite {
  const { bg = "rgba(44,35,80,0.82)", fg = "#fff", w = 256, h = 72 } = opts;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const radius = h / 2;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(w, 0, w, h, radius);
  ctx.arcTo(w, h, 0, h, radius);
  ctx.arcTo(0, h, 0, 0, radius);
  ctx.arcTo(0, 0, w, 0, radius);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = "bold 30px Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  const scale = 1.4;
  sprite.scale.set((w / h) * scale * 0.6, scale * 0.6, 1);
  return sprite;
}

function makeFloorTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4f1e9";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#e1dbc8";
  ctx.lineWidth = 3;
  const step = size / 6;
  for (let i = 0; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * A top-down, floor-plan-style three.js scene of the whole aquatic centre —
 * each real named pool (Recreation, Competition North/South, Leisure, Hot
 * Tub) is its own clickable shape, tinted by whether it has sessions today
 * and what length it runs, with a small count badge floating above it.
 */
export default function AquaticCenterScene({ zones, activeZoneKey, onPickZone }: AquaticCenterSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoneMeshesRef = useRef<THREE.Mesh[]>([]);
  const stateRef = useRef({ activeZoneKey, onPickZone });

  useEffect(() => {
    stateRef.current = { activeZoneKey, onPickZone };
  }, [activeZoneKey, onPickZone]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 15.5, 4.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 10;
    controls.maxDistance = 22;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI / 2.6;
    controls.update();

    scene.add(new THREE.AmbientLight(0xfdf7e8, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(4, 14, 6);
    scene.add(sun);

    // ---------- building floor ----------
    const floorTexture = makeFloorTexture();
    floorTexture.repeat.set(4, 2.5);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 7.5),
      new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0.2, -0.02, 0.1);
    scene.add(floor);

    // ---------- zone shapes ----------
    const zoneMeshes: THREE.Mesh[] = [];
    for (const zone of zones) {
      let geometry: THREE.BufferGeometry;
      if (zone.shape === "ellipse") {
        geometry = new THREE.CircleGeometry(1, 40);
      } else {
        geometry = new THREE.PlaneGeometry(1, 1);
      }
      const material = new THREE.MeshStandardMaterial({
        color: zoneColor(zone),
        transparent: true,
        opacity: 0.55,
        roughness: 0.4,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(zone.width / 2, 1, zone.depth / 2);
      mesh.position.set(zone.x, 0.04, zone.z);
      mesh.userData.zoneKey = zone.key;
      scene.add(mesh);
      zoneMeshes.push(mesh);

      // subtle rim so each zone reads as a distinct basin
      if (zone.shape === "rect") {
        const edges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1));
        const rim = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.6, transparent: true }));
        rim.rotation.x = -Math.PI / 2;
        rim.scale.set(zone.width / 2, 1, zone.depth / 2);
        rim.position.set(zone.x, 0.05, zone.z);
        scene.add(rim);
      } else {
        const rim = new THREE.Mesh(
          new THREE.RingGeometry(0.97, 1.03, 40),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }),
        );
        rim.rotation.x = -Math.PI / 2;
        rim.scale.set(zone.width / 2, 1, zone.depth / 2);
        rim.position.set(zone.x, 0.05, zone.z);
        scene.add(rim);
      }

      // zone name plate
      const label = makeLabelSprite(zone.label, { bg: "rgba(44,35,80,0.85)", w: Math.max(180, zone.label.length * 16) });
      label.position.set(zone.x, 0.45, zone.z - zone.depth / 2 + 0.05);
      scene.add(label);

      // session-count badge (hidden if zero)
      if (zone.count > 0) {
        const badge = makeLabelSprite(String(zone.count), {
          bg: zone.poolLength === 50 ? "rgba(168,85,247,0.92)" : zone.poolLength === 25 ? "rgba(56,189,248,0.92)" : "rgba(20,184,166,0.92)",
          w: 90,
          h: 90,
        });
        badge.position.set(zone.x + zone.width / 2 - 0.3, 0.55, zone.z + zone.depth / 2 - 0.3);
        scene.add(badge);
      }
    }
    zoneMeshesRef.current = zoneMeshes;

    // ---------- resize ----------
    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // ---------- picking ----------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pickZoneAt = (clientX: number, clientY: number): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(zoneMeshesRef.current, false);
      if (hits.length === 0) return null;
      return hits[0].object.userData.zoneKey as string;
    };

    let downPos: { x: number; y: number } | null = null;
    const handleDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const handleUp = (e: PointerEvent) => {
      if (!downPos) return;
      const dx = e.clientX - downPos.x;
      const dy = e.clientY - downPos.y;
      downPos = null;
      if (Math.hypot(dx, dy) > 6) return;
      const key = pickZoneAt(e.clientX, e.clientY);
      if (key && stateRef.current.onPickZone) stateRef.current.onPickZone(key);
    };
    const handleMove = (e: PointerEvent) => {
      const key = pickZoneAt(e.clientX, e.clientY);
      renderer.domElement.style.cursor = key ? "pointer" : "grab";
    };
    renderer.domElement.addEventListener("pointerdown", handleDown);
    renderer.domElement.addEventListener("pointerup", handleUp);
    renderer.domElement.addEventListener("pointermove", handleMove);

    // ---------- render loop ----------
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { activeZoneKey: curActive } = stateRef.current;
      for (const mesh of zoneMeshesRef.current) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const isActive = mesh.userData.zoneKey === curActive;
        mat.opacity = isActive ? 0.82 : 0.55;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handleDown);
      renderer.domElement.removeEventListener("pointerup", handleUp);
      renderer.domElement.removeEventListener("pointermove", handleMove);
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          const material = obj.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      container.removeChild(renderer.domElement);
    };
    // Geometry is rebuilt whenever the set of zones (their shapes/labels/counts) changes.
  }, [zones]);

  return <div ref={containerRef} className="aquatic-scene-canvas" />;
}
