import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface ZoneLayout {
  key: string;
  label: string;
  shape: "rect" | "ellipse" | "leisure";
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
  /** The currently selected/open zone — the camera eases in toward it. */
  focusZoneKey?: string | null;
  onPickZone?: (key: string) => void;
  onHoverZone?: (key: string | null) => void;
}

const DEFAULT_CAM_POS = new THREE.Vector3(-1.0, 12, 11);
const DEFAULT_TARGET = new THREE.Vector3(-1.0, 0, 0);

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
  ctx.fillStyle = "#e7e4da";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#d2cdbb";
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

/** Realistic-ish lane-pool water: a blue gradient with painted lane lines
 *  running along the pool's long axis, plus a soft shimmer overlay. */
function makeLaneWaterTexture(widthUnits: number, depthUnits: number, tone: "rec" | "comp", lanes = 8): THREE.CanvasTexture {
  const vertical = depthUnits >= widthUnits;
  const long = Math.max(widthUnits, depthUnits);
  const short = Math.min(widthUnits, depthUnits);
  const resLong = 320;
  const resShort = Math.max(40, Math.round((short / long) * resLong));
  const canvasW = vertical ? resShort : resLong;
  const canvasH = vertical ? resLong : resShort;
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
  if (tone === "comp") {
    grad.addColorStop(0, "#3fa6e3");
    grad.addColorStop(1, "#1c6fb0");
  } else {
    grad.addColorStop(0, "#74d6ec");
    grad.addColorStop(1, "#2fa6cf");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 16; i++) {
    const rx = Math.random() * canvasW;
    const ry = Math.random() * canvasH;
    ctx.beginPath();
    ctx.ellipse(rx, ry, 16, 5, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(8, 35, 60, 0.5)";
  ctx.lineWidth = Math.max(1, resLong * 0.006);
  for (let i = 1; i < lanes; i++) {
    const t = i / lanes;
    ctx.beginPath();
    if (vertical) {
      const x = t * canvasW;
      ctx.moveTo(x, canvasH * 0.03);
      ctx.lineTo(x, canvasH * 0.97);
    } else {
      const y = t * canvasH;
      ctx.moveTo(canvasW * 0.03, y);
      ctx.lineTo(canvasW * 0.97, y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  if (vertical) {
    ctx.fillRect(0, 0, canvasW, canvasH * 0.025);
    ctx.fillRect(0, canvasH * 0.975, canvasW, canvasH * 0.025);
  } else {
    ctx.fillRect(0, 0, canvasW * 0.025, canvasH);
    ctx.fillRect(canvasW * 0.975, 0, canvasW * 0.025, canvasH);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Soft, lane-less water for the leisure pool / hot tub — gradient plus a
 *  few light "ripple" highlights instead of straight lane markings. */
function makeSoftWaterTexture(tone: "leisure" | "hot-tub"): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size * 0.4, size * 0.35, size * 0.05, size * 0.5, size * 0.5, size * 0.72);
  if (tone === "leisure") {
    grad.addColorStop(0, "#82e4d4");
    grad.addColorStop(1, "#159e8a");
  } else {
    grad.addColorStop(0, "#ffd58a");
    grad.addColorStop(1, "#dd8a2e");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 14; i++) {
    const rx = Math.random() * size;
    const ry = Math.random() * size;
    ctx.beginPath();
    ctx.arc(rx, ry, 6 + Math.random() * 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** A rough winding "lazy river" blob, normalized to a -0.5..0.5 box so it
 *  can be scaled to any zone's width/depth like the other shapes. */
function buildLeisureShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-0.48, -0.32);
  shape.bezierCurveTo(-0.56, 0.08, -0.32, 0.5, 0.04, 0.46);
  shape.bezierCurveTo(0.38, 0.43, 0.54, 0.18, 0.4, -0.06);
  shape.bezierCurveTo(0.5, -0.16, 0.48, -0.36, 0.26, -0.46);
  shape.bezierCurveTo(-0.02, -0.56, -0.3, -0.54, -0.48, -0.32);
  return shape;
}

function addBenchRow(scene: THREE.Scene, centerX: number, centerZ: number, length: number, rotationY: number, count: number) {
  const benchMat = new THREE.MeshStandardMaterial({ color: 0xcaa472, roughness: 0.6 });
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count - 0.5;
    const bench = new THREE.Mesh(new THREE.BoxGeometry((length / count) * 0.7, 0.12, 0.3), benchMat);
    bench.position.set(centerX + Math.cos(rotationY) * t * length, 0.06, centerZ + Math.sin(rotationY) * t * length);
    bench.rotation.y = rotationY;
    scene.add(bench);
  }
}

/** A thick rectangular ring of exterior walls framing the whole building
 *  footprint, so the scene reads as an actual building shell rather than a
 *  bare textured floor. */
function addWallRing(
  scene: THREE.Scene,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  thickness: number,
  height: number,
  color: number,
) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const north = new THREE.Mesh(new THREE.BoxGeometry(w + thickness * 2, height, thickness), mat);
  north.position.set(cx, height / 2, minZ - thickness / 2);
  scene.add(north);
  const south = north.clone();
  south.position.set(cx, height / 2, maxZ + thickness / 2);
  scene.add(south);
  const east = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, d), mat);
  east.position.set(maxX + thickness / 2, height / 2, cz);
  scene.add(east);
  const west = east.clone();
  west.position.set(minX - thickness / 2, height / 2, cz);
  scene.add(west);
}

/** Lane flags, navy starting blocks, and a couple of pool-edge ladders for
 *  a real lap pool (Recreation / Competition), matching the small markers
 *  visible along the lanes in the reference floor-plan rendering. */
function addLaneAccessories(scene: THREE.Scene, zone: ZoneLayout) {
  const vertical = zone.depth >= zone.width;
  const lanes = zone.poolLength === 50 ? 8 : 6;
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x274472, roughness: 0.4 });
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
  const ladderMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e9, roughness: 0.25, metalness: 0.35 });

  for (let i = 0; i < lanes; i++) {
    const t = (i + 0.5) / lanes - 0.5;
    if (vertical) {
      const x = zone.x + t * zone.width;
      const zEdge = zone.z - zone.depth / 2;
      const block = new THREE.Mesh(new THREE.BoxGeometry((zone.width / lanes) * 0.5, 0.1, 0.16), blockMat);
      block.position.set(x, 0.07, zEdge - 0.14);
      scene.add(block);
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), flagMat);
      flag.position.set(x, 0.16, zEdge - 0.32);
      scene.add(flag);
    } else {
      const z = zone.z + t * zone.depth;
      const xEdge = zone.x - zone.width / 2;
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, (zone.depth / lanes) * 0.5), blockMat);
      block.position.set(xEdge - 0.14, 0.07, z);
      scene.add(block);
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), flagMat);
      flag.position.set(xEdge - 0.32, 0.16, z);
      scene.add(flag);
    }
  }

  const ladderSpots = vertical
    ? [-0.28, 0.28].map((f) => new THREE.Vector3(zone.x + zone.width / 2 + 0.08, 0.04, zone.z + f * zone.depth))
    : [-0.28, 0.28].map((f) => new THREE.Vector3(zone.x + f * zone.width, 0.04, zone.z + zone.depth / 2 + 0.08));
  for (const pos of ladderSpots) {
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.24), ladderMat);
    ladder.position.copy(pos);
    scene.add(ladder);
  }
}

/**
 * A top-down-ish, floor-plan-style three.js scene of the whole aquatic
 * centre — each real named pool (Recreation, Competition North/South,
 * Leisure, Hot Tub) is its own clickable basin with realistic lane-line
 * water, white deck borders, and surrounding context (deck, change rooms,
 * front desk, benches) so it reads like the building, not an abstraction.
 * Hovering raises a basin slightly and pulses a ripple ring; selecting one
 * eases the camera in toward it.
 */
export default function AquaticCenterScene({ zones, activeZoneKey, focusZoneKey = null, onPickZone, onHoverZone }: AquaticCenterSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoneMeshesRef = useRef<THREE.Mesh[]>([]);
  const rippleMeshesRef = useRef<THREE.Mesh[]>([]);
  const rippleScalesRef = useRef<{ x: number; z: number }[]>([]);
  const baseOpacitiesRef = useRef<number[]>([]);
  const waterBaseYsRef = useRef<number[]>([]);
  const stateRef = useRef({ activeZoneKey, onPickZone, onHoverZone, focusZoneKey });

  useEffect(() => {
    stateRef.current = { activeZoneKey, onPickZone, onHoverZone, focusZoneKey };
  }, [activeZoneKey, onPickZone, onHoverZone, focusZoneKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = null;
    // Warm cream fog matching the page background (see index.css --grad-bg)
    // so the far edges of the building fade into the page instead of
    // stopping at a hard rectangular silhouette.
    scene.fog = new THREE.Fog(0xfff3c4, 9, 23);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.copy(DEFAULT_CAM_POS);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(DEFAULT_TARGET);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 22;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.15;
    controls.update();

    // ---------- camera focus transition ----------
    interface CamTransition {
      from: THREE.Vector3;
      fromTarget: THREE.Vector3;
      to: THREE.Vector3;
      toTarget: THREE.Vector3;
      start: number;
      duration: number;
    }
    let transition: CamTransition | null = null;
    let appliedFocusKey: string | null = null;

    // If the user grabs the view mid-transition, let them take over
    // immediately instead of fighting their drag.
    controls.addEventListener("start", () => {
      transition = null;
    });

    scene.add(new THREE.AmbientLight(0xfdf7e8, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(4, 14, 6);
    scene.add(sun);

    // ---------- building floor + context ----------
    const floorTexture = makeFloorTexture();
    floorTexture.repeat.set(5, 3.2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14.5, 8.2),
      new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(-1.0, -0.02, 0.0);
    scene.add(floor);

    // Thick exterior wall ring framing the whole footprint, plus a sage-green
    // skylight accent band along the back (north) wall like the real centre.
    addWallRing(scene, -7.6, 4.7, -4.0, 3.9, 0.18, 0.42, 0xf2f0e7);
    const wallBand = new THREE.Mesh(
      new THREE.BoxGeometry(12.5, 0.34, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xb9c9ad, roughness: 0.8 }),
    );
    wallBand.position.set(-1.0, 0.17, -3.8);
    scene.add(wallBand);

    const changeRooms = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.5, 6.4),
      new THREE.MeshStandardMaterial({ color: 0xd8d4c6, roughness: 0.7 }),
    );
    changeRooms.position.set(-6.6, 0.25, -0.25);
    scene.add(changeRooms);
    const changeLabel = makeLabelSprite("Change Rooms", { bg: "rgba(80,75,60,0.85)", w: 230 });
    changeLabel.position.set(-6.6, 0.85, -0.25);
    scene.add(changeLabel);

    const frontDesk = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.4, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xc9c4b2, roughness: 0.7 }),
    );
    frontDesk.position.set(-6.2, 0.2, 3.3);
    scene.add(frontDesk);
    const deskLabel = makeLabelSprite("Front Desk", { bg: "rgba(80,75,60,0.85)", w: 190 });
    deskLabel.position.set(-6.2, 0.7, 3.3);
    scene.add(deskLabel);

    const rec = zones.find((z) => z.key === "recreation");
    if (rec) addBenchRow(scene, rec.x - rec.width / 2 - 0.35, rec.z, rec.depth, Math.PI / 2, 3);
    const compZones = zones.filter((z) => z.key.startsWith("comp"));
    if (compZones.length > 0) {
      const maxX = Math.max(...compZones.map((z) => z.x + z.width / 2));
      const minZ = Math.min(...compZones.map((z) => z.z - z.depth / 2));
      const maxZ = Math.max(...compZones.map((z) => z.z + z.depth / 2));
      addBenchRow(scene, maxX + 0.35, (minZ + maxZ) / 2, maxZ - minZ, Math.PI / 2, 4);
    }

    // ---------- zone basins ----------
    // Each real pool is built as an actual sunken basin — a recessed floor
    // plus vertical walls down to it, with the water surface floating partway
    // down — rather than a flat painted rectangle, so it reads as a real
    // pool you're looking down into instead of a coloured floor decal.
    const zoneMeshes: THREE.Mesh[] = [];
    const rippleMeshes: THREE.Mesh[] = [];
    const rippleScales: { x: number; z: number }[] = [];
    const baseOpacities: number[] = [];
    const waterBaseYs: number[] = [];

    for (const zone of zones) {
      const isOtherFlat = zone.key.startsWith("other:");
      const hasBasin = !isOtherFlat;
      const basinDepth = zone.poolLength === 50 ? 0.78 : zone.poolLength === 25 ? 0.6 : zone.shape === "ellipse" ? 0.34 : 0.4;

      let geometry: THREE.BufferGeometry;
      let material: THREE.MeshStandardMaterial;
      let baseOpacity: number;
      let scaleX: number;
      let scaleZ: number;

      if (zone.shape === "leisure") {
        geometry = new THREE.ShapeGeometry(buildLeisureShape(), 24);
        scaleX = zone.width;
        scaleZ = zone.depth;
        baseOpacity = 0.92;
        material = new THREE.MeshStandardMaterial({ map: makeSoftWaterTexture("leisure"), transparent: true, opacity: baseOpacity, roughness: 0.25 });
      } else if (zone.shape === "ellipse") {
        geometry = new THREE.CircleGeometry(1, 40);
        scaleX = zone.width / 2;
        scaleZ = zone.depth / 2;
        baseOpacity = 0.92;
        const tone = zone.key === "hot-tub" ? "hot-tub" : "leisure";
        material = new THREE.MeshStandardMaterial({ map: makeSoftWaterTexture(tone), transparent: true, opacity: baseOpacity, roughness: 0.25 });
      } else if (isOtherFlat) {
        geometry = new THREE.PlaneGeometry(1, 1);
        scaleX = zone.width;
        scaleZ = zone.depth;
        baseOpacity = 0.55;
        material = new THREE.MeshStandardMaterial({ color: zoneColor(zone), transparent: true, opacity: baseOpacity, roughness: 0.4 });
      } else {
        geometry = new THREE.PlaneGeometry(1, 1);
        scaleX = zone.width;
        scaleZ = zone.depth;
        baseOpacity = 0.95;
        material = new THREE.MeshStandardMaterial({
          map: makeLaneWaterTexture(zone.width, zone.depth, zone.poolLength === 50 ? "comp" : "rec"),
          transparent: true,
          opacity: baseOpacity,
          roughness: 0.2,
          metalness: 0.05,
        });
      }

      const waterBaseY = hasBasin ? -(basinDepth - 0.1) : 0.04;

      if (hasBasin) {
        const tileMat = new THREE.MeshStandardMaterial({ color: 0xe3e1d6, roughness: 0.55 });
        const basinFloor = new THREE.Mesh(geometry.clone(), new THREE.MeshStandardMaterial({ color: 0xbfe6ef, roughness: 0.6 }));
        basinFloor.rotation.x = -Math.PI / 2;
        basinFloor.scale.set(scaleX, 1, scaleZ);
        basinFloor.position.set(zone.x, -basinDepth, zone.z);
        scene.add(basinFloor);

        if (zone.shape === "ellipse") {
          const wall = new THREE.Mesh(
            new THREE.CylinderGeometry(scaleX, scaleX, basinDepth, 32, 1, true),
            new THREE.MeshStandardMaterial({ color: 0xe3e1d6, roughness: 0.55, side: THREE.DoubleSide }),
          );
          wall.position.set(zone.x, -basinDepth / 2, zone.z);
          scene.add(wall);
        } else if (zone.shape !== "leisure") {
          const halfW = zone.width / 2;
          const halfD = zone.depth / 2;
          const wt = 0.06;
          const northWall = new THREE.Mesh(new THREE.BoxGeometry(zone.width + wt * 2, basinDepth, wt), tileMat);
          northWall.position.set(zone.x, -basinDepth / 2, zone.z - halfD);
          scene.add(northWall);
          const southWall = northWall.clone();
          southWall.position.set(zone.x, -basinDepth / 2, zone.z + halfD);
          scene.add(southWall);
          const eastWall = new THREE.Mesh(new THREE.BoxGeometry(wt, basinDepth, zone.depth + wt * 2), tileMat);
          eastWall.position.set(zone.x + halfW, -basinDepth / 2, zone.z);
          scene.add(eastWall);
          const westWall = eastWall.clone();
          westWall.position.set(zone.x - halfW, -basinDepth / 2, zone.z);
          scene.add(westWall);
        }
      }

      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(scaleX, 1, scaleZ);
      mesh.position.set(zone.x, waterBaseY, zone.z);
      mesh.userData.zoneKey = zone.key;
      scene.add(mesh);
      zoneMeshes.push(mesh);
      baseOpacities.push(baseOpacity);
      waterBaseYs.push(waterBaseY);

      // white coping/deck rim right at deck level, around the basin's rim
      const outline = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
      outline.rotation.x = -Math.PI / 2;
      outline.scale.set(scaleX * 1.08, 1, scaleZ * 1.08);
      outline.position.set(zone.x, 0.015, zone.z);
      scene.add(outline);

      // hidden-by-default hover ripple ring, pulsed in tick()
      const ripple = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1, 40),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }),
      );
      ripple.rotation.x = -Math.PI / 2;
      ripple.scale.set(scaleX, 1, scaleZ);
      ripple.position.set(zone.x, 0.03, zone.z);
      ripple.visible = false;
      scene.add(ripple);
      rippleMeshes.push(ripple);
      rippleScales.push({ x: scaleX, z: scaleZ });

      // lane flags, starting blocks, and ladders for the two real lap pools
      if (!isOtherFlat && zone.shape === "rect" && zone.poolLength !== null) {
        addLaneAccessories(scene, zone);
      }

      // zone name plate
      const label = makeLabelSprite(zone.label, { bg: "rgba(44,35,80,0.85)", w: Math.max(180, zone.label.length * 16) });
      label.position.set(zone.x, hasBasin ? 0.5 : 0.45, zone.z - zone.depth / 2 + 0.05);
      scene.add(label);

      // session-count badge (hidden if zero)
      if (zone.count > 0) {
        const badge = makeLabelSprite(String(zone.count), {
          bg: zone.poolLength === 50 ? "rgba(168,85,247,0.92)" : zone.poolLength === 25 ? "rgba(56,189,248,0.92)" : "rgba(20,184,166,0.92)",
          w: 90,
          h: 90,
        });
        badge.position.set(zone.x + zone.width / 2 - 0.3, hasBasin ? 0.6 : 0.55, zone.z + zone.depth / 2 - 0.3);
        scene.add(badge);
      }
    }
    zoneMeshesRef.current = zoneMeshes;
    rippleMeshesRef.current = rippleMeshes;
    rippleScalesRef.current = rippleScales;
    baseOpacitiesRef.current = baseOpacities;
    waterBaseYsRef.current = waterBaseYs;

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
      if (stateRef.current.onHoverZone) stateRef.current.onHoverZone(key);
    };
    const handleLeave = () => {
      renderer.domElement.style.cursor = "grab";
      if (stateRef.current.onHoverZone) stateRef.current.onHoverZone(null);
    };
    renderer.domElement.addEventListener("pointerdown", handleDown);
    renderer.domElement.addEventListener("pointerup", handleUp);
    renderer.domElement.addEventListener("pointermove", handleMove);
    renderer.domElement.addEventListener("pointerleave", handleLeave);

    // ---------- render loop ----------
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { activeZoneKey: curActive, focusZoneKey: curFocus } = stateRef.current;

      if (curFocus !== appliedFocusKey) {
        appliedFocusKey = curFocus;
        const zone = curFocus ? zones.find((z) => z.key === curFocus) : null;
        const toPos = zone
          ? new THREE.Vector3(zone.x + zone.width * 0.1, 7, zone.z + zone.depth * 0.55 + 3)
          : DEFAULT_CAM_POS.clone();
        const toTarget = zone ? new THREE.Vector3(zone.x, 0, zone.z) : DEFAULT_TARGET.clone();
        transition = {
          from: camera.position.clone(),
          fromTarget: controls.target.clone(),
          to: toPos,
          toTarget,
          start: performance.now(),
          duration: 650,
        };
      }

      if (transition) {
        const t = Math.min(1, (performance.now() - transition.start) / transition.duration);
        const eased = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(transition.from, transition.to, eased);
        controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
        if (t >= 1) transition = null;
      }

      const now = performance.now();
      for (let i = 0; i < zoneMeshesRef.current.length; i++) {
        const mesh = zoneMeshesRef.current[i];
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const isActive = mesh.userData.zoneKey === curActive;
        const base = baseOpacitiesRef.current[i] ?? 0.85;
        mat.opacity = isActive ? Math.min(1, base + 0.1) : base;

        // Running-water feel: slowly drift the water texture (a gentle
        // current) and bob the surface up and down a touch, each pool out
        // of phase with the others so it doesn't look mechanically uniform.
        const phase = i * 1.7;
        if (mat.map) {
          mat.map.offset.set(Math.sin(now / 3400 + phase) * 0.025, (now / 9000 + phase * 0.1) % 1);
        }
        const restY = waterBaseYsRef.current[i] ?? 0.04;
        const bob = Math.sin(now / 900 + phase) * 0.012;
        const targetY = (isActive ? restY + 0.06 : restY) + bob;
        mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, targetY, 0.15);

        const ripple = rippleMeshesRef.current[i];
        const rippleScale = rippleScalesRef.current[i];
        if (ripple && rippleScale) {
          ripple.visible = isActive;
          if (isActive) {
            const pulse = 1 + 0.16 * Math.sin(performance.now() / 220);
            ripple.scale.set(rippleScale.x * pulse, 1, rippleScale.z * pulse);
            (ripple.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.16 * Math.sin(performance.now() / 220);
          }
        }
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
      renderer.domElement.removeEventListener("pointerleave", handleLeave);
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
