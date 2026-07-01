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

const DEFAULT_CAM_POS = new THREE.Vector3(-1.0, 13.5, 12);
const DEFAULT_TARGET = new THREE.Vector3(-1.0, 0, 0);

function zoneColor(zone: ZoneLayout): number {
  if (zone.key === "hot-tub") return 0xfef3c7;
  if (zone.key === "leisure") return 0xccfbf1;
  if (zone.poolLength === 50) return 0xf3e8ff;
  if (zone.poolLength === 25) return 0xe0f2fe;
  return 0xf1f5f9;
}

function makeLabelSprite(
  text: string,
  opts: { bg?: string; fg?: string; w?: number; h?: number; isBadge?: boolean } = {},
): THREE.Sprite {
  const { bg = "rgba(255, 255, 255, 0.92)", fg = "#1e1b4b", w = 280, h = 80, isBadge = false } = opts;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Elegant rounded pill background with a clean, soft shadow.
  const radius = h / 2;
  ctx.shadowColor = "rgba(0, 0, 0, 0.06)";
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

  // Reset shadow for crisp text rendering.
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = fg;
  ctx.font = isBadge
    ? "bold 36px system-ui, -apple-system, sans-serif"
    : "600 26px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: true, transparent: true });
  const sprite = new THREE.Sprite(material);

  const scale = isBadge ? 0.45 : 0.65;
  sprite.scale.set((w / h) * scale, scale, 1);
  return sprite;
}

function makeFloorTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Clean off-white minimalist floor.
  ctx.fillStyle = "#fcfbfa";
  ctx.fillRect(0, 0, size, size);

  // Subdued, professional thin grid lines.
  ctx.strokeStyle = "#f1f0ea";
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

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function makeLaneWaterTexture(
  widthUnits: number,
  depthUnits: number,
  tone: "rec" | "comp",
  lanes = 8,
): THREE.CanvasTexture {
  const vertical = depthUnits >= widthUnits;
  const long = Math.max(widthUnits, depthUnits);
  const resLong = 512;
  const resShort = Math.max(64, Math.round((Math.min(widthUnits, depthUnits) / long) * resLong));
  const canvasW = vertical ? resShort : resLong;
  const canvasH = vertical ? resLong : resShort;
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  // Smooth architectural blue gradient.
  const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
  if (tone === "comp") {
    grad.addColorStop(0, "#bae6fd");
    grad.addColorStop(1, "#38bdf8");
  } else {
    grad.addColorStop(0, "#ccfbf1");
    grad.addColorStop(1, "#2dd4bf");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Sleek, minimal technical lane lines.
  ctx.strokeStyle = "rgba(14, 116, 144, 0.25)";
  ctx.lineWidth = 3;
  for (let i = 1; i < lanes; i++) {
    const t = i / lanes;
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(t * canvasW, 0);
      ctx.lineTo(t * canvasW, canvasH);
    } else {
      ctx.moveTo(0, t * canvasH);
      ctx.lineTo(canvasW, t * canvasH);
    }
    ctx.stroke();
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
  const grad = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.7);

  if (tone === "leisure") {
    grad.addColorStop(0, "#e0f2fe");
    grad.addColorStop(1, "#bae6fd");
  } else {
    grad.addColorStop(0, "#ffedd5");
    grad.addColorStop(1, "#fed7aa");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildLeisureShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-0.45, -0.35);
  shape.bezierCurveTo(-0.52, 0.1, -0.3, 0.45, 0.05, 0.42);
  shape.bezierCurveTo(0.35, 0.4, 0.5, 0.15, 0.4, -0.1);
  shape.bezierCurveTo(0.48, -0.22, 0.42, -0.4, 0.22, -0.45);
  shape.bezierCurveTo(-0.02, -0.5, -0.28, -0.48, -0.45, -0.35);
  return shape;
}

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
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
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

function buildAvatar(): THREE.Group {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x4f46e5, roughness: 0.4 });
  const pin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 4), baseMat);
  pin.position.y = 0.3;
  pin.rotation.x = Math.PI;
  group.add(pin);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.16, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  group.add(shadow);
  return group;
}

const AVATAR_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "enter", " "]);

/**
 * A clean, minimalist top-down map of the aquatic centre: an off-white tiled
 * deck, each real pool/zone rendered as a sunken basin of water with pill
 * labels and a session-count badge, plus a soft camera "focus" ease when a
 * zone is selected. Built directly on three.js (no react-three-fiber).
 */
export default function AquaticCenterScene({
  zones,
  activeZoneKey,
  focusZoneKey = null,
  onPickZone,
  onHoverZone,
}: AquaticCenterSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoneMeshesRef = useRef<THREE.Mesh[]>([]);
  const rippleMeshesRef = useRef<THREE.Mesh[]>([]);
  const rippleScalesRef = useRef<{ x: number; z: number }[]>([]);
  const baseOpacitiesRef = useRef<number[]>([]);
  const waterBaseYsRef = useRef<number[]>([]);
  const avatarGroupRef = useRef<THREE.Group | null>(null);
  const avatarPosRef = useRef(new THREE.Vector3(-1.0, 0, 1.2));
  const keysRef = useRef<Set<string>>(new Set());
  const stateRef = useRef({ activeZoneKey, onPickZone, onHoverZone, focusZoneKey });

  useEffect(() => {
    stateRef.current = { activeZoneKey, onPickZone, onHoverZone, focusZoneKey };
  }, [activeZoneKey, onPickZone, onHoverZone, focusZoneKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.Fog(0xfbfbfa, 10, 25);

    const camera = new THREE.PerspectiveCamera(32, container.clientWidth / container.clientHeight, 0.1, 100);
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
    controls.minDistance = 7;
    controls.maxDistance = 20;
    controls.minPolarAngle = 0.4;
    controls.maxPolarAngle = 1.1;
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

    // Balanced premium lighting.
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.6);
    mainLight.position.set(6, 18, 8);
    scene.add(mainLight);
    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.3);
    fillLight.position.set(-6, 12, -8);
    scene.add(fillLight);

    // Floor base.
    const floorTexture = makeFloorTexture();
    floorTexture.repeat.set(4, 2.5);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 9),
      new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(-1.0, -0.01, 0.0);
    scene.add(floor);

    // Flat outer borders instead of stark walls.
    addWallRing(scene, -7.8, 4.8, -4.2, 4.1, 0.12, 0.15, 0xf1f0eb);

    const zoneMeshes: THREE.Mesh[] = [];
    const rippleMeshes: THREE.Mesh[] = [];
    const rippleScales: { x: number; z: number }[] = [];
    const baseOpacities: number[] = [];
    const waterBaseYs: number[] = [];

    for (const zone of zones) {
      const isOtherFlat = zone.key.startsWith("other:");
      const hasBasin = !isOtherFlat;
      const basinDepth = zone.poolLength === 50 ? 0.45 : zone.poolLength === 25 ? 0.35 : 0.25;
      let geometry: THREE.BufferGeometry;
      let material: THREE.MeshStandardMaterial;
      let baseOpacity = 0.94;
      let scaleX = zone.width;
      let scaleZ = zone.depth;

      if (zone.shape === "leisure") {
        geometry = new THREE.ShapeGeometry(buildLeisureShape(), 32);
        baseOpacity = 0.9;
        material = new THREE.MeshStandardMaterial({
          map: makeSoftWaterTexture("leisure"),
          transparent: true,
          opacity: baseOpacity,
          roughness: 0.15,
        });
      } else if (zone.shape === "ellipse") {
        geometry = new THREE.CircleGeometry(1, 48);
        scaleX = zone.width / 2;
        scaleZ = zone.depth / 2;
        const tone = zone.key === "hot-tub" ? "hot-tub" : "leisure";
        material = new THREE.MeshStandardMaterial({
          map: makeSoftWaterTexture(tone),
          transparent: true,
          opacity: baseOpacity,
          roughness: 0.15,
        });
      } else if (isOtherFlat) {
        geometry = new THREE.PlaneGeometry(1, 1);
        baseOpacity = 0.85;
        material = new THREE.MeshStandardMaterial({
          color: zoneColor(zone),
          transparent: true,
          opacity: baseOpacity,
          roughness: 0.5,
        });
      } else {
        geometry = new THREE.PlaneGeometry(1, 1);
        material = new THREE.MeshStandardMaterial({
          map: makeLaneWaterTexture(zone.width, zone.depth, zone.poolLength === 50 ? "comp" : "rec"),
          transparent: true,
          opacity: baseOpacity,
          roughness: 0.12,
        });
      }

      const waterBaseY = hasBasin ? -(basinDepth - 0.05) : 0.02;
      if (hasBasin) {
        const wallMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.6 });
        const basinFloor = new THREE.Mesh(
          geometry.clone(),
          new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.5 }),
        );
        basinFloor.rotation.x = -Math.PI / 2;
        basinFloor.scale.set(scaleX, 1, scaleZ);
        basinFloor.position.set(zone.x, -basinDepth, zone.z);
        scene.add(basinFloor);
        if (zone.shape === "ellipse") {
          const cylinderWall = new THREE.Mesh(
            new THREE.CylinderGeometry(scaleX, scaleX, basinDepth, 48, 1, true),
            wallMat,
          );
          cylinderWall.position.set(zone.x, -basinDepth / 2, zone.z);
          scene.add(cylinderWall);
        } else if (zone.shape !== "leisure") {
          const halfW = zone.width / 2;
          const halfD = zone.depth / 2;
          const wt = 0.04;

          const nWall = new THREE.Mesh(new THREE.BoxGeometry(zone.width + wt * 2, basinDepth, wt), wallMat);
          nWall.position.set(zone.x, -basinDepth / 2, zone.z - halfD);
          scene.add(nWall);
          const sWall = nWall.clone();
          sWall.position.set(zone.x, -basinDepth / 2, zone.z + halfD);
          scene.add(sWall);
          const eWall = new THREE.Mesh(new THREE.BoxGeometry(wt, basinDepth, zone.depth + wt * 2), wallMat);
          eWall.position.set(zone.x + halfW, -basinDepth / 2, zone.z);
          scene.add(eWall);
          const wWall = eWall.clone();
          wWall.position.set(zone.x - halfW, -basinDepth / 2, zone.z);
          scene.add(wWall);
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

      // Soft architectural white edge line.
      const borderOutline = new THREE.Mesh(
        geometry.clone(),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }),
      );
      borderOutline.rotation.x = -Math.PI / 2;
      borderOutline.scale.set(scaleX * 1.04, 1, scaleZ * 1.04);
      borderOutline.position.set(zone.x, 0.005, zone.z);
      scene.add(borderOutline);

      // Clean interactive ring.
      const ripple = new THREE.Mesh(
        new THREE.RingGeometry(0.96, 1.0, 48),
        new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.4, depthWrite: false }),
      );
      ripple.rotation.x = -Math.PI / 2;
      ripple.scale.set(scaleX, 1, scaleZ);
      ripple.position.set(zone.x, 0.01, zone.z);
      ripple.visible = false;
      scene.add(ripple);
      rippleMeshes.push(ripple);
      rippleScales.push({ x: scaleX, z: scaleZ });

      // Pill label + optional session-count badge.
      const label = makeLabelSprite(zone.label);
      label.position.set(zone.x, 0.45, zone.z - zone.depth / 2 - 0.2);
      scene.add(label);

      if (zone.count > 0) {
        const badge = makeLabelSprite(String(zone.count), {
          bg: "#4f46e5",
          fg: "#ffffff",
          w: 80,
          h: 80,
          isBadge: true,
        });
        badge.position.set(zone.x + zone.width / 2 - 0.1, 0.5, zone.z + zone.depth / 2 - 0.1);
        scene.add(badge);
      }
    }

    zoneMeshesRef.current = zoneMeshes;
    rippleMeshesRef.current = rippleMeshes;
    rippleScalesRef.current = rippleScales;
    baseOpacitiesRef.current = baseOpacities;
    waterBaseYsRef.current = waterBaseYs;

    const avatar = buildAvatar();
    avatar.position.copy(avatarPosRef.current);
    scene.add(avatar);
    avatarGroupRef.current = avatar;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!AVATAR_KEYS.has(key)) return;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) e.preventDefault();
      keysRef.current.add(key);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", resize);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pickZoneAt = (clientX: number, clientY: number): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(zoneMeshesRef.current, false);
      return hits.length > 0 ? (hits[0].object.userData.zoneKey as string) : null;
    };

    let downPos: { x: number; y: number } | null = null;
    const handlePointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (!downPos) return;
      if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return;
      const key = pickZoneAt(e.clientX, e.clientY);
      if (key && stateRef.current.onPickZone) stateRef.current.onPickZone(key);
    };
    const handlePointerMove = (e: PointerEvent) => {
      const key = pickZoneAt(e.clientX, e.clientY);
      renderer.domElement.style.cursor = key ? "pointer" : "grab";
      if (stateRef.current.onHoverZone) stateRef.current.onHoverZone(key);
    };
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);

    let rafId = 0;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const { activeZoneKey: curActive, focusZoneKey: curFocus } = stateRef.current;

      // Animate active/hover states smoothly.
      zoneMeshes.forEach((mesh, idx) => {
        const isHovered = mesh.userData.zoneKey === curActive;
        const targetY = isHovered ? waterBaseYs[idx] + 0.04 : waterBaseYs[idx];
        mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, targetY, 0.15);

        const ripple = rippleMeshes[idx];
        if (ripple) {
          ripple.visible = isHovered;
          if (isHovered) {
            const cycle = (performance.now() % 1200) / 1200;
            ripple.scale.set(rippleScales[idx].x * (1 + cycle * 0.08), 1, rippleScales[idx].z * (1 + cycle * 0.08));
            (ripple.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - cycle);
          }
        }
      });

      // Camera easing focus.
      if (curFocus !== appliedFocusKey) {
        appliedFocusKey = curFocus;
        const targetZone = zones.find((z) => z.key === curFocus);
        const targetPos = targetZone
          ? new THREE.Vector3(targetZone.x, 6.5, targetZone.z + 4.5)
          : DEFAULT_CAM_POS.clone();
        const targetLook = targetZone ? new THREE.Vector3(targetZone.x, 0, targetZone.z) : DEFAULT_TARGET.clone();

        transition = {
          from: camera.position.clone(),
          fromTarget: controls.target.clone(),
          to: targetPos,
          toTarget: targetLook,
          start: performance.now(),
          duration: 500,
        };
      }
      if (transition) {
        const progress = Math.min(1, (performance.now() - transition.start) / transition.duration);
        const ease = progress * (2 - progress); // subtle quadratic ease-out
        camera.position.lerpVectors(transition.from, transition.to, ease);
        controls.target.lerpVectors(transition.fromTarget, transition.toTarget, ease);
        if (progress === 1) transition = null;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const material = obj.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
      container.innerHTML = "";
    };
  }, [zones]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }} />;
}
