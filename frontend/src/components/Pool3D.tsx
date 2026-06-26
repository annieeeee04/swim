import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

export type SwimmerPose3D = "stand" | "swim" | "climb";

export interface Swimmer3D {
  suit: string;
  skin: string;
  cap: string;
  lane: number;
  pose: SwimmerPose3D;
  /** Path to the real GLTF model (e.g. "/models/woody.glb"). */
  modelUrl: string;
  modelScale?: number;
  modelRotationY?: number;
}

interface Pool3DProps {
  lanesCount?: number;
  activeLane: number | null;
  occupiedLanes?: number[];
  /** If set, lanes become clickable (lane-picking mode). */
  onPickLane?: (lane: number) => void;
  swimmer?: Swimmer3D | null;
  /** Bump this number to trigger a one-off splash effect in the swimmer's lane. */
  splashTrigger?: number;
}

const LANE_WIDTH = 1.5;
const WATER_LENGTH = 9;
const DECK_LENGTH = 3;
const DECK_HEIGHT = 0.35;
const WATER_DEPTH = 0.9;
/** Target standing height (meters) that every loaded character model gets normalized to. */
const TARGET_HEIGHT = 1.05;

// Module-level cache so re-opening the pool (or switching characters) doesn't
// re-download/re-parse the same GLB more than once per page session.
const gltfTemplateCache = new Map<string, Promise<THREE.Object3D>>();
const gltfLoader = new GLTFLoader();

function loadCharacterTemplate(url: string): Promise<THREE.Object3D> {
  let pending = gltfTemplateCache.get(url);
  if (!pending) {
    pending = gltfLoader.loadAsync(url).then((gltf) => {
      const root = gltf.scene;
      // Normalize every model to the same standing height & a feet-at-origin
      // pivot, so Woody/Buzz/Bo Peep (all very different native scales) sit
      // consistently in the lane regardless of how they were modeled.
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      const height = size.y || 1;
      const scale = TARGET_HEIGHT / height;
      root.scale.setScalar(scale);

      const scaledBox = new THREE.Box3().setFromObject(root);
      root.position.x -= (scaledBox.min.x + scaledBox.max.x) / 2;
      root.position.z -= (scaledBox.min.z + scaledBox.max.z) / 2;
      root.position.y -= scaledBox.min.y;

      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        }
      });
      return root;
    });
    gltfTemplateCache.set(url, pending);
  }
  return pending;
}

function makeLaneNumberSprite(lane: number, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 64px Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(lane), 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.55, 0.55, 0.55);
  return sprite;
}

/** White ceramic deck tiles with light grout lines, generated procedurally
 *  (no external image) so the deck reads as tiled rather than flat-colored. */
function makeDeckTileTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f5f1e8";
  ctx.fillRect(0, 0, size, size);
  const tiles = 4;
  const step = size / tiles;
  ctx.strokeStyle = "#d8d0bd";
  ctx.lineWidth = 4;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  // subtle per-tile shading variation
  for (let x = 0; x < tiles; x++) {
    for (let y = 0; y < tiles; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.02)";
      ctx.fillRect(x * step + 2, y * step + 2, step - 4, step - 4);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Lane-rope color, FINA-style banding inspired by the Olympic reference photo:
 *  outer lanes red, next band blue, innermost lanes yellow. */
function laneLineColor(dividerIndex: number, lanesCount: number): number {
  const edgeDistance = Math.min(dividerIndex, lanesCount - dividerIndex);
  const third = lanesCount / 3;
  if (edgeDistance < third) return 0xe03131;
  if (edgeDistance < third * 2) return 0x1c7ed6;
  return 0xffd43b;
}

/**
 * A lightweight, dependency-light 3D pool scene built directly on three.js
 * (no react-three-fiber): a 10-lane Olympic-style pool with a tiled deck,
 * starting blocks, colored lane lines, orbit camera controls (drag to
 * rotate, wheel/pinch to zoom), and real GLTF character models standing on
 * the deck or floating/bobbing in their lane.
 */
export default function Pool3D({
  lanesCount = 10,
  activeLane,
  occupiedLanes = [],
  onPickLane,
  swimmer = null,
  splashTrigger = 0,
}: Pool3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lanePlanesRef = useRef<THREE.Mesh[]>([]);
  const swimmerGroupRef = useRef<THREE.Group | null>(null);
  const modelHolderRef = useRef<THREE.Group | null>(null);
  const placeholderRef = useRef<THREE.Group | null>(null);
  const loadedModelUrlRef = useRef<string | null>(null);
  const stateRef = useRef({
    activeLane,
    occupiedLanes,
    onPickLane,
    swimmer,
  });
  const splashGroupRef = useRef<THREE.Group | null>(null);
  const splashesRef = useRef<{ mesh: THREE.Mesh; born: number }[]>([]);
  const elapsedRef = useRef(0);

  // Keep the imperative render loop reading the latest props without
  // tearing the whole three.js scene down and rebuilding it every render.
  useEffect(() => {
    stateRef.current = { activeLane, occupiedLanes, onPickLane, swimmer };
  }, [activeLane, occupiedLanes, onPickLane, swimmer]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const totalWidth = lanesCount * LANE_WIDTH;
    const halfWidth = totalWidth / 2;
    const deckCenterX = -DECK_LENGTH / 2;
    const waterCenterX = DECK_LENGTH / 2 + WATER_LENGTH / 2 - 1.4;
    const waterSurfaceY = -WATER_DEPTH * 0.18;
    const deckEdgeX = deckCenterX + DECK_LENGTH / 2;

    const laneZ = (lane: number) => (lane - 0.5) * LANE_WIDTH - halfWidth;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 11.5, 12.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.3, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.update();

    // ---------- lighting ----------
    scene.add(new THREE.AmbientLight(0xfdf7e8, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(6, 14, 6);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfe0fb, 0.4);
    fill.position.set(-6, 4, -4);
    scene.add(fill);

    // ---------- deck (white tiled) ----------
    const deckTexture = makeDeckTileTexture();
    deckTexture.repeat.set(DECK_LENGTH * 1.3, totalWidth * 1.3);
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(DECK_LENGTH, DECK_HEIGHT, totalWidth),
      new THREE.MeshStandardMaterial({ map: deckTexture, roughness: 0.8 }),
    );
    deck.position.set(deckCenterX, DECK_HEIGHT / 2, 0);
    scene.add(deck);

    // ---------- starting blocks (one per lane, at the deck/water edge) ----------
    const blockMat = new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.55 });
    const blockTopMat = new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.6 });
    for (let lane = 1; lane <= lanesCount; lane++) {
      const z = laneZ(lane);
      const block = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, LANE_WIDTH - 0.3), blockMat);
      base.position.set(deckEdgeX - 0.18, DECK_HEIGHT + 0.16, z);
      block.add(base);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, LANE_WIDTH - 0.4), blockTopMat);
      top.position.set(deckEdgeX - 0.16, DECK_HEIGHT + 0.34, z);
      top.rotation.z = -0.06;
      block.add(top);
      scene.add(block);
    }

    // ---------- water basin ----------
    const basin = new THREE.Mesh(
      new THREE.BoxGeometry(WATER_LENGTH, WATER_DEPTH, totalWidth),
      new THREE.MeshStandardMaterial({ color: 0x0b6fb0, roughness: 0.55 }),
    );
    basin.position.set(waterCenterX, -WATER_DEPTH / 2, 0);
    scene.add(basin);

    const waterSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(WATER_LENGTH, totalWidth),
      new THREE.MeshStandardMaterial({
        color: 0x18a3e8,
        transparent: true,
        opacity: 0.62,
        roughness: 0.1,
        metalness: 0.15,
      }),
    );
    waterSurface.rotation.x = -Math.PI / 2;
    waterSurface.position.set(waterCenterX, waterSurfaceY, 0);
    scene.add(waterSurface);

    // lane lines (colored rope-style dividers — red outer, blue mid, yellow center,
    // matching the Olympic reference photo's banding)
    for (let i = 0; i <= lanesCount; i++) {
      const z = i * LANE_WIDTH - halfWidth;
      const color = laneLineColor(i, lanesCount);
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(WATER_LENGTH + 0.2, 0.045, 0.07),
        new THREE.MeshStandardMaterial({ color }),
      );
      divider.position.set(waterCenterX, waterSurfaceY + 0.03, z);
      scene.add(divider);

      // small floats along the rope for a bit of texture/readability
      const floatGeo = new THREE.SphereGeometry(0.07, 8, 8);
      const floatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
      for (let f = -WATER_LENGTH / 2 + 0.4; f <= WATER_LENGTH / 2 - 0.4; f += 1.1) {
        const bead = new THREE.Mesh(floatGeo, floatMat);
        bead.position.set(waterCenterX + f, waterSurfaceY + 0.05, z);
        scene.add(bead);
      }
    }

    // interactive/highlight plane per lane + number sprite
    const lanePlanes: THREE.Mesh[] = [];
    for (let lane = 1; lane <= lanesCount; lane++) {
      const z = laneZ(lane);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(WATER_LENGTH - 0.1, LANE_WIDTH - 0.08),
        new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0 }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(waterCenterX, waterSurfaceY + 0.05, z);
      plane.userData.lane = lane;
      scene.add(plane);
      lanePlanes.push(plane);

      const sprite = makeLaneNumberSprite(lane, "rgba(28, 126, 214, 0.92)");
      sprite.position.set(deckCenterX + DECK_LENGTH / 2 + 0.15, DECK_HEIGHT + 0.4, z);
      scene.add(sprite);
    }
    lanePlanesRef.current = lanePlanes;

    // ---------- swimmer figure ----------
    // A simple capsule+sphere placeholder shows immediately; it's hidden as
    // soon as the real GLTF character model finishes loading (loading
    // happens in a separate effect keyed on swimmer.modelUrl below).
    const placeholder = new THREE.Group();
    const placeholderBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.5, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.5 }),
    );
    placeholder.add(placeholderBody);
    const placeholderHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xf3c89e, roughness: 0.7 }),
    );
    placeholderHead.position.y = 0.58;
    placeholder.add(placeholderHead);
    placeholderRef.current = placeholder;

    const modelHolder = new THREE.Group();
    modelHolderRef.current = modelHolder;

    const swimmerGroup = new THREE.Group();
    swimmerGroup.add(placeholder);
    swimmerGroup.add(modelHolder);
    swimmerGroup.visible = false;
    scene.add(swimmerGroup);
    swimmerGroupRef.current = swimmerGroup;

    // ---------- splash effect group ----------
    const splashGroup = new THREE.Group();
    scene.add(splashGroup);
    splashGroupRef.current = splashGroup;

    // ---------- resize handling ----------
    const resize = () => {
      const clientWidth = container.clientWidth;
      const clientHeight = container.clientHeight;
      if (clientWidth === 0 || clientHeight === 0) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // ---------- lane picking ----------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const pickLaneAt = (clientX: number, clientY: number): number | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(lanePlanesRef.current, false);
      if (hits.length === 0) return null;
      return hits[0].object.userData.lane as number;
    };

    let pointerDownPos: { x: number; y: number } | null = null;
    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (!stateRef.current.onPickLane) return;
      if (!pointerDownPos) return;
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      pointerDownPos = null;
      // Ignore this as a click if it was actually a drag (camera rotate).
      if (Math.hypot(dx, dy) > 6) return;
      const lane = pickLaneAt(e.clientX, e.clientY);
      if (lane === null) return;
      if (stateRef.current.occupiedLanes.includes(lane)) return;
      stateRef.current.onPickLane(lane);
    };
    const handlePointerMove = (e: PointerEvent) => {
      const lane = pickLaneAt(e.clientX, e.clientY);
      renderer.domElement.style.cursor =
        lane !== null && stateRef.current.onPickLane && !stateRef.current.occupiedLanes.includes(lane)
          ? "pointer"
          : "grab";
    };
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);

    // ---------- render loop ----------
    let raf = 0;
    const clock = new THREE.Clock();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      elapsedRef.current = t;
      const { activeLane: curActiveLane, occupiedLanes: curOccupied, swimmer: curSwimmer } = stateRef.current;

      // lane highlight colors: active (purple) > occupied (muted) > free (invisible)
      for (const plane of lanePlanesRef.current) {
        const lane = plane.userData.lane as number;
        const mat = plane.material as THREE.MeshBasicMaterial;
        if (lane === curActiveLane) {
          mat.color.set(0xa855f7);
          mat.opacity = 0.22;
        } else if (curOccupied.includes(lane)) {
          mat.color.set(0x8a83a8);
          mat.opacity = 0.18;
        } else {
          mat.opacity = 0;
        }
      }

      // swimmer position/pose
      const group = swimmerGroupRef.current;
      if (group && curSwimmer) {
        group.visible = true;
        const z = laneZ(curSwimmer.lane);
        if (curSwimmer.pose === "swim") {
          group.position.set(waterCenterX, waterSurfaceY + 0.22 + Math.sin(t * 2.2) * 0.05, z);
          group.rotation.set(0, 0, Math.PI / 2);
        } else if (curSwimmer.pose === "climb") {
          group.position.set(deckCenterX + 0.6, DECK_HEIGHT + 0.55, z);
          group.rotation.set(-0.35, 0, 0);
        } else {
          group.position.set(deckCenterX, DECK_HEIGHT + 0.55, z);
          group.rotation.set(0, 0, 0);
        }
      } else if (group) {
        group.visible = false;
      }

      // splash particles: grow + fade, then remove
      const splashes = splashesRef.current;
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        const age = t - s.born;
        const life = 0.7;
        if (age > life) {
          splashGroup.remove(s.mesh);
          s.mesh.geometry.dispose();
          (s.mesh.material as THREE.Material).dispose();
          splashes.splice(i, 1);
          continue;
        }
        const progress = age / life;
        const scale = 0.2 + progress * 1.6;
        s.mesh.scale.set(scale, scale, scale);
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - progress);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const material = obj.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      container.removeChild(renderer.domElement);
      loadedModelUrlRef.current = null;
    };
    // Scene is built once per lane-count; everything else flows through stateRef.
  }, [lanesCount]);

  // Load (or swap to) the real GLTF model whenever the active character changes.
  useEffect(() => {
    const url = swimmer?.modelUrl;
    const holder = modelHolderRef.current;
    const placeholder = placeholderRef.current;
    if (!url || !holder || !placeholder) return;
    if (loadedModelUrlRef.current === url) return;

    let cancelled = false;
    placeholder.visible = true;
    loadCharacterTemplate(url)
      .then((template) => {
        if (cancelled) return;
        while (holder.children.length > 0) {
          holder.remove(holder.children[0]);
        }
        const instance = cloneSkeleton(template) as THREE.Object3D;
        const scale = swimmer?.modelScale ?? 1;
        instance.scale.multiplyScalar(scale);
        instance.rotation.y = swimmer?.modelRotationY ?? 0;
        holder.add(instance);
        loadedModelUrlRef.current = url;
        placeholder.visible = false;
      })
      .catch(() => {
        // Keep the placeholder visible if the model fails to load.
        loadedModelUrlRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [swimmer?.modelUrl, swimmer?.modelScale, swimmer?.modelRotationY]);

  // Trigger a splash burst in the swimmer's lane.
  useEffect(() => {
    if (!splashTrigger || !swimmer) return;
    const group = splashGroupRef.current;
    if (!group) return;

    const totalWidth = lanesCount * LANE_WIDTH;
    const halfWidth = totalWidth / 2;
    const z = (swimmer.lane - 0.5) * LANE_WIDTH - halfWidth;
    const waterCenterX = DECK_LENGTH / 2 + WATER_LENGTH / 2 - 1.4;
    const waterSurfaceY = -WATER_DEPTH * 0.18;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(waterCenterX, waterSurfaceY + 0.06, z);
    group.add(ring);
    splashesRef.current.push({ mesh: ring, born: elapsedRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splashTrigger]);

  return <div ref={containerRef} className="pool3d-canvas" />;
}
