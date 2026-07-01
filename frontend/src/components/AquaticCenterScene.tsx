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
  focusZoneKey?: string | null;
  onPickZone?: (key: string) => void;
  onHoverZone?: (key: string | null) => void;
}

const DEFAULT_CAM_POS = new THREE.Vector3(-0.5, 13.5, 13.5);
const DEFAULT_TARGET = new THREE.Vector3(-0.5, 0, 0.2);

// ---------------------------------------------------------------------------
// Canvas Textures & Materials
// ---------------------------------------------------------------------------

function makeLabelSprite(
  text: string,
  opts: { bg?: string; fg?: string; w?: number; h?: number; isBadge?: boolean } = {},
): THREE.Sprite {
  const { bg = "rgba(255,255,255,0.96)", fg = "#1e1b4b", w = 320, h = 90, isBadge = false } = opts;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const radius = h / 2;
  ctx.shadowColor = "rgba(15,23,42,0.15)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(w, 0, w, h, radius);
  ctx.arcTo(w, h, 0, h, radius);
  ctx.arcTo(0, h, 0, 0, radius);
  ctx.arcTo(0, 0, w, 0, radius);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = fg;
  ctx.font = isBadge
    ? "bold 44px system-ui, -apple-system, sans-serif"
    : "700 28px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  const scale = isBadge ? 0.45 : 0.68;
  sprite.scale.set((w / h) * scale, scale, 1);
  sprite.renderOrder = 20;
  return sprite;
}

/** White ceramic deck tiles with soft grout lines */
function makeDeckTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f5f4f0";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#e2dfd5";
  ctx.lineWidth = 2;
  const step = size / 8;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Segmented buoy / lane-rope appearance via texture mapping */
function makeRopeTexture(mainColor: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 16;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = mainColor;
  ctx.fillRect(0, 0, 32, 16);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(32, 0, 32, 16);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(24, 1);
  return t;
}

/** Pool-water texture incorporating subsurface swimming lane T-lines */
function makeWaterTexture(widthUnits: number, depthUnits: number, tone: "rec" | "comp", lanes: number): THREE.CanvasTexture {
  const vertical = depthUnits >= widthUnits;
  const canvasW = vertical ? 256 : 512;
  const canvasH = vertical ? 512 : 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
  if (tone === "comp") {
    grad.addColorStop(0, "#2989d8");
    grad.addColorStop(0.5, "#1e73be");
    grad.addColorStop(1, "#105291");
  } else {
    grad.addColorStop(0, "#54c2e6");
    grad.addColorStop(0.5, "#34a5d4");
    grad.addColorStop(1, "#2082b3");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.strokeStyle = "rgba(8,50,85,0.45)";
  ctx.lineWidth = 5;
  const longLen = vertical ? canvasH : canvasW;
  for (let i = 1; i < lanes; i++) {
    const t = (i / lanes) * (vertical ? canvasW : canvasH);
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(t, longLen * 0.06);
      ctx.lineTo(t, longLen * 0.94);
    } else {
      ctx.moveTo(longLen * 0.06, t);
      ctx.lineTo(longLen * 0.94, t);
    }
    ctx.stroke();
    ctx.lineWidth = 7;
    for (const end of [0.08, 0.92]) {
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(t - 10, longLen * end);
        ctx.lineTo(t + 10, longLen * end);
      } else {
        ctx.moveTo(longLen * end, t - 10);
        ctx.lineTo(longLen * end, t + 10);
      }
      ctx.stroke();
    }
    ctx.lineWidth = 5;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSoftWaterTexture(tone: "leisure" | "hot-tub"): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size * 0.5, size * 0.45, size * 0.1, size * 0.5, size * 0.5, size * 0.75);
  if (tone === "leisure") {
    grad.addColorStop(0, "#c2f2ff");
    grad.addColorStop(0.6, "#70d6f2");
    grad.addColorStop(1, "#49b7d6");
  } else {
    grad.addColorStop(0, "#ffe8cc");
    grad.addColorStop(0.5, "#f7be83");
    grad.addColorStop(1, "#e0984c");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Custom Complex Vector Shapes
// ---------------------------------------------------------------------------

/** The organic architectural footprint of the Leisure Pool (with lazy-river arm). */
function buildLeisureShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-1.6, 1.4);
  shape.lineTo(0.2, 1.4);
  shape.quadraticCurveTo(0.9, 1.4, 0.9, 0.7);
  shape.lineTo(0.9, -0.1);
  shape.quadraticCurveTo(0.9, -0.8, 0.2, -1.2);
  shape.bezierCurveTo(-0.2, -1.5, -0.9, -1.5, -1.3, -1.1);
  shape.lineTo(-1.6, -0.7);
  shape.lineTo(-1.6, -1.2);
  shape.lineTo(-2.2, -1.2);
  shape.lineTo(-2.2, 0.5);
  shape.lineTo(-1.6, 0.5);
  shape.closePath();
  return shape;
}

/** The angular trapezoidal boundary of the Hot Tub. */
function buildHotTubShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-0.6, 0.7);
  shape.lineTo(0.6, 0.7);
  shape.lineTo(0.6, -0.3);
  shape.lineTo(0.1, -0.8);
  shape.lineTo(-0.6, -0.1);
  shape.closePath();
  return shape;
}

// ---------------------------------------------------------------------------
// 3D Procedural Prop Builders
// ---------------------------------------------------------------------------

/** Olympic diving platform: 3 platform heights + flanking springboards. */
function buildDivingTower(): THREE.Group {
  const group = new THREE.Group();
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0xe2e5e9, roughness: 0.6 });
  const platformMat = new THREE.MeshStandardMaterial({ color: 0xd0d5dd, roughness: 0.7 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4, metalness: 0.4 });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.5 });

  const towerColumn = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 0.6), concreteMat);
  towerColumn.position.set(0, 1.6, -0.3);
  group.add(towerColumn);

  const levels = [1.2, 2.1, 3.0];
  levels.forEach((height, idx) => {
    const platW = 0.45;
    const platD = 1.1;
    const platform = new THREE.Mesh(new THREE.BoxGeometry(platW, 0.08, platD), platformMat);
    platform.position.set(0, height, -0.1 + idx * 0.05);
    group.add(platform);
    const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, platD), railMat);
    leftRail.position.set(-platW / 2, height + 0.18, 0);
    const rightRail = leftRail.clone();
    rightRail.position.x = platW / 2;
    group.add(leftRail, rightRail);
  });

  [-0.6, 0.6].forEach((offsetX) => {
    const sprBase = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.3), baseMat);
    sprBase.position.set(offsetX, 0.2, -0.4);
    group.add(sprBase);
    const springboard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 1.2), boardMat);
    springboard.position.set(offsetX, 0.42, 0.1);
    springboard.rotation.x = 0.03;
    group.add(springboard);
    const sbRail = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.4, 0.6), railMat);
    sbRail.position.set(offsetX + (offsetX > 0 ? 0.08 : -0.08), 0.62, -0.2);
    group.add(sbRail);
  });
  return group;
}

/** Hydraulic aquatic accessibility lift. */
function buildAquaticLift(): THREE.Group {
  const lift = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xbcc4cc, metalness: 0.8, roughness: 0.2 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 12), metalMat);
  post.position.y = 0.3;
  lift.add(post);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), blueMat);
  cyl.position.set(0, 0.4, 0);
  lift.add(cyl);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.45), metalMat);
  arm.position.set(0, 0.58, 0.15);
  arm.rotation.x = -0.15;
  lift.add(arm);
  const chairHang = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 8), metalMat);
  chairHang.position.set(0, 0.4, 0.36);
  lift.add(chairHang);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.15), blueMat);
  seat.position.set(0, 0.25, 0.36);
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.02), blueMat);
  backrest.position.set(0, 0.33, 0.295);
  lift.add(seat, backrest);
  return lift;
}

/** Water fountain / spray arch feature. */
function buildFountainSpout(arcRadius: number, rotY: number): THREE.Group {
  const fountain = new THREE.Group();
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.1 });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.65, roughness: 0.0 });
  const neck = new THREE.Mesh(new THREE.TorusGeometry(arcRadius, 0.025, 12, 24, Math.PI * 0.6), chromeMat);
  neck.rotation.set(0, rotY, Math.PI * 0.7);
  neck.position.set(0, 0.35, 0);
  fountain.add(neck);
  const stream = new THREE.Mesh(new THREE.TorusGeometry(arcRadius * 1.1, 0.02, 8, 16, Math.PI * 0.4), waterMat);
  stream.rotation.set(0, rotY, Math.PI * 1.1);
  stream.position.set(0, 0.25, 0.05);
  fountain.add(stream);
  return fountain;
}

/** Submerged structural entry steps. */
function buildPoolStairs(stepsCount: number, width: number, depth: number, height: number): THREE.Group {
  const stairs = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.5 });
  for (let i = 0; i < stepsCount; i++) {
    const stepW = width;
    const stepD = depth * (1 - i / stepsCount);
    const stepH = height / stepsCount;
    const box = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepH, stepD), mat);
    box.position.set(0, -height + stepH / 2 + i * stepH, -depth / 2 + stepD / 2);
    stairs.add(box);
  }
  return stairs;
}

/** Poolside basketball hoop. */
function buildBasketballHoop(): THREE.Group {
  const hoop = new THREE.Group();
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, roughness: 0.1 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), whiteMat);
  post.position.set(0, 0.35, 0);
  hoop.add(post);
  const backboard = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.02), glassMat);
  backboard.position.set(0, 0.7, 0.05);
  hoop.add(backboard);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.01, 8, 16), orangeMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, 0.64, 0.14);
  hoop.add(rim);
  return hoop;
}

/** Stainless grab-rail / ladder handle on a pool edge. */
function buildLadder(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.25, metalness: 0.75 });
  for (const dx of [-0.08, 0.08]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 10), mat);
    rail.position.set(dx, 0.06, 0);
    g.add(rail);
    const step = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), mat);
    step.rotation.z = Math.PI / 2;
    step.position.set(0, -0.05, 0);
    g.add(step);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.016, 8, 18, Math.PI), mat);
  arch.position.y = 0.28;
  arch.rotation.y = Math.PI / 2;
  g.add(arch);
  return g;
}

function buildBench(): THREE.Group {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xccaa77, roughness: 0.65 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.26), woodMat);
  seat.position.y = 0.15;
  g.add(seat);
  for (const dx of [-0.4, 0.4]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.22), legMat);
    leg.position.set(dx, 0.075, 0);
    g.add(leg);
  }
  return g;
}

function buildLifeguardChair(): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
  for (const dx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.8, 8), frame);
    leg.position.set(dx, 0.4, 0);
    g.add(leg);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.28), redMat);
  seat.position.y = 0.8;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.25, 0.04), redMat);
  back.position.set(0, 0.95, -0.12);
  g.add(back);
  return g;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AquaticCenterScene({
  zones,
  activeZoneKey,
  focusZoneKey = null,
  onPickZone,
  onHoverZone,
}: AquaticCenterSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoneMeshesRef = useRef<THREE.Mesh[]>([]);
  const stateRef = useRef({ activeZoneKey, onPickZone, onHoverZone, focusZoneKey });

  useEffect(() => {
    stateRef.current = { activeZoneKey, onPickZone, onHoverZone, focusZoneKey };
  }, [activeZoneKey, onPickZone, onHoverZone, focusZoneKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.Fog(0xf1f5f9, 18, 35);

    const camera = new THREE.PerspectiveCamera(28, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.copy(DEFAULT_CAM_POS);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(DEFAULT_TARGET);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 24;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = 1.2;
    controls.update();

    let transition: {
      from: THREE.Vector3;
      fromTarget: THREE.Vector3;
      to: THREE.Vector3;
      toTarget: THREE.Vector3;
      start: number;
      duration: number;
    } | null = null;
    let appliedFocusKey: string | null = null;
    controls.addEventListener("start", () => {
      transition = null;
    });

    // ---- Illumination ----
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const primarySun = new THREE.DirectionalLight(0xffffff, 0.9);
    primarySun.position.set(6, 20, 8);
    scene.add(primarySun);
    const softFill = new THREE.DirectionalLight(0xdbeafe, 0.4);
    softFill.position.set(-8, 12, -6);
    scene.add(softFill);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe7ef, 0.3));

    // ---- Deck + enclosure ----
    const dMinX = -8.0,
      dMaxX = 7.2,
      dMinZ = -4.5,
      dMaxZ = 4.5;
    const dW = dMaxX - dMinX,
      dD = dMaxZ - dMinZ;
    const dCx = (dMinX + dMaxX) / 2,
      dCz = (dMinZ + dMaxZ) / 2;

    const baseBuffer = new THREE.Mesh(
      new THREE.BoxGeometry(dW + 0.8, 0.16, dD + 0.8),
      new THREE.MeshStandardMaterial({ color: 0xaecfa0, roughness: 0.9 }),
    );
    baseBuffer.position.set(dCx, -0.08, dCz);
    scene.add(baseBuffer);

    const deckTexture = makeDeckTexture();
    deckTexture.repeat.set(dW * 0.8, dD * 0.8);
    const mainDeck = new THREE.Mesh(
      new THREE.BoxGeometry(dW, 0.18, dD),
      new THREE.MeshStandardMaterial({ map: deckTexture, roughness: 0.8 }),
    );
    mainDeck.position.set(dCx, 0.01, dCz);
    scene.add(mainDeck);
    const deckY = 0.1;

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xdaebd6, roughness: 0.9 });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(dW + 0.8, 2.4, 0.2), wallMat);
    backWall.position.set(dCx, 1.2, dMinZ - 0.3);
    scene.add(backWall);
    const sideWallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, dD + 0.8), wallMat);
    sideWallLeft.position.set(dMinX - 0.3, 1.2, dCz);
    scene.add(sideWallLeft);

    // ---- Zone iteration ----
    const zoneMeshes: THREE.Mesh[] = [];
    const waterAnimations: { mesh: THREE.Mesh; baseY: number; type: string }[] = [];

    for (const zone of zones) {
      const isOther = zone.key.startsWith("other:");
      const isHotTub = zone.key === "hot-tub" || zone.label.toLowerCase().includes("tub");
      const bDepth = zone.poolLength === 50 ? 0.7 : zone.poolLength === 25 ? 0.55 : 0.35;
      const wBaseY = !isOther ? deckY - bDepth + 0.06 : deckY + 0.01;
      let geo: THREE.BufferGeometry;
      let mat: THREE.MeshStandardMaterial;
      let sX = zone.width;
      let sZ = zone.depth;
      const along: "x" | "z" = zone.depth >= zone.width ? "z" : "x";
      const shortSide = Math.min(zone.width, zone.depth);
      const laneCount = THREE.MathUtils.clamp(Math.round(shortSide / 0.58), 4, 10);

      if (zone.shape === "leisure") {
        geo = new THREE.ShapeGeometry(buildLeisureShape(), 36);
        mat = new THREE.MeshStandardMaterial({ map: makeSoftWaterTexture("leisure"), transparent: true, opacity: 0.9, roughness: 0.05 });
        sX = 1;
        sZ = 1;
      } else if (isHotTub) {
        geo = new THREE.ShapeGeometry(buildHotTubShape(), 24);
        mat = new THREE.MeshStandardMaterial({ map: makeSoftWaterTexture("hot-tub"), transparent: true, opacity: 0.88, roughness: 0.05 });
        sX = 1;
        sZ = 1;
      } else if (isOther) {
        geo = new THREE.PlaneGeometry(1, 1);
        mat = new THREE.MeshStandardMaterial({ color: 0xd6e4ee, transparent: true, opacity: 0.85, roughness: 0.4 });
      } else {
        geo = new THREE.PlaneGeometry(1, 1);
        mat = new THREE.MeshStandardMaterial({
          map: makeWaterTexture(zone.width, zone.depth, zone.poolLength === 50 ? "comp" : "rec", laneCount),
          transparent: true,
          opacity: 0.92,
          roughness: 0.06,
        });
      }

      // Basin floor + coping
      if (!isOther) {
        const basinFloorMat = new THREE.MeshStandardMaterial({
          color: zone.poolLength === 50 ? 0xa8daf5 : zone.shape === "leisure" ? 0xbfeefc : 0xbce5f7,
          roughness: 0.5,
        });
        const basinFloor = new THREE.Mesh(geo.clone(), basinFloorMat);
        basinFloor.rotation.x = -Math.PI / 2;
        basinFloor.scale.set(sX, 1, sZ);
        basinFloor.position.set(zone.x, deckY - bDepth, zone.z);
        scene.add(basinFloor);

        const copeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
        if (zone.shape === "rect") {
          const ct = 0.12;
          const hW = zone.width / 2 + ct / 2;
          const hD = zone.depth / 2 + ct / 2;
          const cn = new THREE.Mesh(new THREE.BoxGeometry(zone.width + ct * 2, 0.05, ct), copeMat);
          cn.position.set(zone.x, deckY + 0.01, zone.z - hD);
          scene.add(cn);
          const cs = cn.clone();
          cs.position.set(zone.x, deckY + 0.01, zone.z + hD);
          scene.add(cs);
          const ce = new THREE.Mesh(new THREE.BoxGeometry(ct, 0.05, zone.depth + ct * 2), copeMat);
          ce.position.set(zone.x + hW, deckY + 0.01, zone.z);
          scene.add(ce);
          const cw = ce.clone();
          cw.position.set(zone.x - hW, deckY + 0.01, zone.z);
          scene.add(cw);
        } else if (zone.shape === "leisure") {
          const rimExtrude = new THREE.ExtrudeGeometry(buildLeisureShape(), { depth: 0.04, bevelEnabled: false });
          const leisureRim = new THREE.Mesh(rimExtrude, copeMat);
          leisureRim.rotation.x = -Math.PI / 2;
          leisureRim.position.set(zone.x, deckY + 0.01, zone.z);
          scene.add(leisureRim);
        } else {
          const rimExtrude = new THREE.ExtrudeGeometry(buildHotTubShape(), { depth: 0.04, bevelEnabled: false });
          const htRim = new THREE.Mesh(rimExtrude, copeMat);
          htRim.rotation.x = -Math.PI / 2;
          htRim.position.set(zone.x, deckY + 0.01, zone.z);
          scene.add(htRim);
        }
      }

      // Water surface
      const waterMesh = new THREE.Mesh(geo, mat);
      waterMesh.rotation.x = -Math.PI / 2;
      waterMesh.scale.set(sX, 1, sZ);
      waterMesh.position.set(zone.x, wBaseY, zone.z);
      waterMesh.userData.zoneKey = zone.key;
      scene.add(waterMesh);
      zoneMeshes.push(waterMesh);
      if (!isOther) waterAnimations.push({ mesh: waterMesh, baseY: wBaseY, type: zone.shape });

      // ---- Lap pool: ropes, blocks, ladders, features ----
      if (zone.shape === "rect" && zone.poolLength) {
        const halfW = zone.width / 2;
        const halfD = zone.depth / 2;
        const laneSpan = along === "z" ? zone.width : zone.depth;
        const laneLen = along === "z" ? zone.depth : zone.width;
        const ropeTex = makeRopeTexture(zone.poolLength === 50 ? "#e11d48" : "#2563eb");

        for (let i = 1; i < laneCount; i++) {
          const off = -laneSpan / 2 + (laneSpan * i) / laneCount;
          const rope = new THREE.Mesh(
            new THREE.CylinderGeometry(0.024, 0.024, laneLen - 0.08, 6),
            new THREE.MeshStandardMaterial({ map: ropeTex.clone(), roughness: 0.5 }),
          );
          rope.rotation.z = Math.PI / 2;
          if (along === "z") {
            rope.rotation.y = Math.PI / 2;
            rope.position.set(zone.x + off, wBaseY + 0.03, zone.z);
          } else {
            rope.position.set(zone.x, wBaseY + 0.03, zone.z + off);
          }
          scene.add(rope);
        }

        // Starting blocks
        const blockBaseMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 });
        const blockPlankMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.4 });
        for (let i = 0; i < laneCount; i++) {
          const off = -laneSpan / 2 + laneSpan * ((i + 0.5) / laneCount);
          const blockGroup = new THREE.Group();
          const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), blockBaseMat);
          baseBlock.position.y = deckY + 0.09;
          const plankBlock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.22), blockPlankMat);
          plankBlock.position.y = deckY + 0.19;
          plankBlock.rotation.x = 0.12;
          blockGroup.add(baseBlock, plankBlock);
          if (along === "z") {
            blockGroup.position.set(zone.x + off, 0, zone.z - halfD - 0.1);
          } else {
            blockGroup.rotation.y = Math.PI / 2;
            blockGroup.position.set(zone.x - halfW - 0.1, 0, zone.z + off);
          }
          scene.add(blockGroup);
        }

        // Grab-rail ladders on the far corners of every lap pool.
        const cornerA = buildLadder();
        const cornerB = buildLadder();
        if (along === "z") {
          cornerA.position.set(zone.x - halfW + 0.25, deckY, zone.z + halfD - 0.05);
          cornerB.position.set(zone.x + halfW - 0.25, deckY, zone.z + halfD - 0.05);
        } else {
          cornerA.rotation.y = Math.PI / 2;
          cornerB.rotation.y = Math.PI / 2;
          cornerA.position.set(zone.x + halfW - 0.05, deckY, zone.z - halfD + 0.25);
          cornerB.position.set(zone.x + halfW - 0.05, deckY, zone.z + halfD - 0.25);
        }
        scene.add(cornerA, cornerB);

        // 50m pool: diving tower. 25m pool: basketball hoop.
        if (zone.poolLength === 50) {
          const dTower = buildDivingTower();
          dTower.position.set(zone.x, deckY, zone.z - halfD + 0.15);
          scene.add(dTower);
        }
        if (zone.poolLength === 25) {
          const bHoop = buildBasketballHoop();
          bHoop.position.set(zone.x - halfW - 0.15, deckY, zone.z);
          bHoop.rotation.y = Math.PI / 2;
          scene.add(bHoop);
        }
      }

      // ---- Leisure pool: island, stairs, fountains, lift, ledge seats ----
      if (zone.shape === "leisure") {
        const stairs = buildPoolStairs(4, 0.5, 0.4, bDepth - 0.06);
        stairs.position.set(zone.x - 1.9, deckY, zone.z + 0.3);
        stairs.rotation.y = Math.PI / 2;
        scene.add(stairs);

        const islandShape = new THREE.Shape();
        islandShape.moveTo(-1.0, 0.5);
        islandShape.quadraticCurveTo(-0.4, 0.5, -0.4, -0.1);
        islandShape.quadraticCurveTo(-0.4, -0.6, -0.9, -0.6);
        islandShape.quadraticCurveTo(-1.2, -0.4, -1.1, 0.0);
        islandShape.closePath();
        const islandExtrude = new THREE.ExtrudeGeometry(islandShape, { depth: bDepth + 0.04, bevelEnabled: false });
        const islandMesh = new THREE.Mesh(islandExtrude, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
        islandMesh.rotation.x = -Math.PI / 2;
        islandMesh.position.set(zone.x, deckY - bDepth, zone.z);
        scene.add(islandMesh);

        const spout1 = buildFountainSpout(0.28, 0);
        spout1.position.set(zone.x - 1.0, deckY, zone.z + 0.8);
        const spout2 = buildFountainSpout(0.24, Math.PI * 0.25);
        spout2.position.set(zone.x - 0.3, deckY, zone.z + 0.4);
        scene.add(spout1, spout2);

        const lLift = buildAquaticLift();
        lLift.position.set(zone.x - 0.3, deckY, zone.z - 1.3);
        lLift.rotation.y = -Math.PI * 0.7;
        scene.add(lLift);

        // Submerged ledge seats around the inner edge.
        const ledgeMat = new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.55 });
        for (const [lx, lz] of [
          [0.55, 1.0],
          [0.55, 0.4],
          [-1.9, -0.6],
        ] as [number, number][]) {
          const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.2), ledgeMat);
          ledge.position.set(zone.x + lx, deckY - bDepth + 0.14, zone.z + lz);
          scene.add(ledge);
        }
      }

      // ---- Hot tub: stairs, lift, ring of inner ledge seats, jets ----
      if (isHotTub) {
        const htStairs = buildPoolStairs(3, 0.4, 0.3, bDepth - 0.06);
        htStairs.position.set(zone.x + 0.3, deckY, zone.z + 0.4);
        htStairs.rotation.y = -Math.PI / 4;
        scene.add(htStairs);

        const htLift = buildAquaticLift();
        htLift.position.set(zone.x + 0.45, deckY, zone.z - 0.1);
        htLift.rotation.y = -Math.PI * 0.4;
        scene.add(htLift);

        // Warm inner ledge bench following the tub edge.
        const benchMat = new THREE.MeshStandardMaterial({ color: 0xfde3c4, roughness: 0.6 });
        for (const [bx, bz] of [
          [-0.3, 0.45],
          [0.35, 0.35],
          [-0.3, -0.35],
        ] as [number, number][]) {
          const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.16), benchMat);
          ledge.position.set(zone.x + bx, deckY - bDepth + 0.12, zone.z + bz);
          scene.add(ledge);
        }
        // Bubbling jets.
        const jetMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
        for (const [jx, jz] of [
          [0.0, 0.0],
          [-0.15, 0.15],
          [0.15, -0.1],
        ] as [number, number][]) {
          const jet = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), jetMat);
          jet.position.set(zone.x + jx, wBaseY + 0.02, zone.z + jz);
          scene.add(jet);
        }
      }

      // ---- Labels ----
      const pillLabel = makeLabelSprite(zone.label);
      pillLabel.position.set(zone.x, deckY + 1.1, zone.z - zone.depth / 2 - 0.2);
      scene.add(pillLabel);
      if (zone.count > 0) {
        const counterBadge = makeLabelSprite(String(zone.count), { bg: "#7c3aed", fg: "#ffffff", w: 84, h: 84, isBadge: true });
        counterBadge.position.set(zone.x + zone.width / 2 - 0.1, deckY + 1.15, zone.z + zone.depth / 2 - 0.1);
        scene.add(counterBadge);
      }
    }
    zoneMeshesRef.current = zoneMeshes;

    // ---- Poolside furnishings ----
    for (let i = 0; i < 5; i++) {
      const bench = buildBench();
      bench.position.set(-6.8 + i * 1.35, deckY, dMinZ + 0.4);
      scene.add(bench);
    }
    const primaryGuardChair = buildLifeguardChair();
    primaryGuardChair.position.set(-1.6, deckY, -0.4);
    primaryGuardChair.rotation.y = Math.PI / 4;
    scene.add(primaryGuardChair);

    // ---- Interaction ----
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);
    handleResize();

    const raycaster = new THREE.Raycaster();
    const cursorVector = new THREE.Vector2();
    const queryZoneHit = (clientX: number, clientY: number): string | null => {
      const boundary = renderer.domElement.getBoundingClientRect();
      cursorVector.x = ((clientX - boundary.left) / boundary.width) * 2 - 1;
      cursorVector.y = -((clientY - boundary.top) / boundary.height) * 2 + 1;
      raycaster.setFromCamera(cursorVector, camera);
      const intersections = raycaster.intersectObjects(zoneMeshesRef.current, false);
      return intersections.length > 0 ? (intersections[0].object.userData.zoneKey as string) : null;
    };

    let pointerOrigin: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      pointerOrigin = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!pointerOrigin) return;
      if (Math.hypot(e.clientX - pointerOrigin.x, e.clientY - pointerOrigin.y) > 4) return;
      const zoneKey = queryZoneHit(e.clientX, e.clientY);
      if (zoneKey && stateRef.current.onPickZone) stateRef.current.onPickZone(zoneKey);
    };
    const onPointerMove = (e: PointerEvent) => {
      const zoneKey = queryZoneHit(e.clientX, e.clientY);
      renderer.domElement.style.cursor = zoneKey ? "pointer" : "grab";
      if (stateRef.current.onHoverZone) stateRef.current.onHoverZone(zoneKey);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointermove", onPointerMove);

    // ---- Loop ----
    const animationClock = new THREE.Clock();
    let frameRequestCallbackId = 0;
    const executeFrameTick = () => {
      frameRequestCallbackId = requestAnimationFrame(executeFrameTick);
      const elapsed = animationClock.getElapsedTime();
      const { activeZoneKey: hoverKey, focusZoneKey: targetFocusKey } = stateRef.current;

      for (const { mesh, baseY, type } of waterAnimations) {
        const isHovered = mesh.userData.zoneKey === hoverKey;
        const speed = type === "leisure" ? 1.9 : 1.4;
        const amp = type === "leisure" ? 0.015 : 0.01;
        const fluidWaveBob = Math.sin(elapsed * speed + mesh.position.x * 1.5) * amp;
        const targetClampedY = baseY + fluidWaveBob + (isHovered ? 0.05 : 0);
        mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, targetClampedY, 0.16);
        const meshMat = mesh.material as THREE.MeshStandardMaterial;
        meshMat.opacity = THREE.MathUtils.lerp(meshMat.opacity, isHovered ? 0.96 : 0.9, 0.16);
      }

      if (targetFocusKey !== appliedFocusKey) {
        appliedFocusKey = targetFocusKey;
        const focusedZone = zones.find((z) => z.key === targetFocusKey);
        const destinationPos = focusedZone ? new THREE.Vector3(focusedZone.x, 7.0, focusedZone.z + 5.5) : DEFAULT_CAM_POS.clone();
        const destinationLookAt = focusedZone ? new THREE.Vector3(focusedZone.x, 0, focusedZone.z) : DEFAULT_TARGET.clone();
        transition = {
          from: camera.position.clone(),
          fromTarget: controls.target.clone(),
          to: destinationPos,
          toTarget: destinationLookAt,
          start: performance.now(),
          duration: 500,
        };
      }
      if (transition) {
        const progress = Math.min(1, (performance.now() - transition.start) / transition.duration);
        const smoothFactor = progress * (2 - progress);
        camera.position.lerpVectors(transition.from, transition.to, smoothFactor);
        controls.target.lerpVectors(transition.fromTarget, transition.toTarget, smoothFactor);
        if (progress === 1) transition = null;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    executeFrameTick();

    return () => {
      cancelAnimationFrame(frameRequestCallbackId);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
          else object.material.dispose();
        }
      });
      renderer.dispose();
      container.innerHTML = "";
    };
  }, [zones]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }} />;
}
