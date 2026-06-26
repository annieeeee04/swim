import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type SwimmerPose3D = "stand" | "swim" | "climb";

export interface Swimmer3D {
  suit: string;
  skin: string;
  cap: string;
  lane: number;
  pose: SwimmerPose3D;
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

function makeLaneNumberSprite(lane: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(168, 85, 247, 0.92)";
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

/**
 * A lightweight, dependency-light 3D pool scene built directly on three.js
 * (no react-three-fiber): a 10-lane pool with a deck, orbit camera controls
 * (drag to rotate, wheel/pinch to zoom), and a simple capsule-and-sphere
 * "swimmer" figure that stands on the deck or floats/bobs in its lane.
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
  const swimmerMaterialsRef = useRef<{
    suit: THREE.MeshStandardMaterial;
    skin: THREE.MeshStandardMaterial;
    cap: THREE.MeshStandardMaterial;
  } | null>(null);
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

    function laneZ(lane: number) {
      return (lane - 0.5) * LANE_WIDTH - halfWidth;
    }

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 9.5, 11.5);

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
    controls.maxDistance = 22;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.update();

    // ---------- lighting ----------
    scene.add(new THREE.AmbientLight(0xfff3e0, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(6, 12, 6);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xc7a4ff, 0.35);
    fill.position.set(-6, 4, -4);
    scene.add(fill);

    // ---------- deck ----------
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(DECK_LENGTH, DECK_HEIGHT, totalWidth),
      new THREE.MeshStandardMaterial({ color: 0xfbeaf6, roughness: 0.85 }),
    );
    deck.position.set(deckCenterX, DECK_HEIGHT / 2, 0);
    scene.add(deck);

    // ---------- water basin ----------
    const basin = new THREE.Mesh(
      new THREE.BoxGeometry(WATER_LENGTH, WATER_DEPTH, totalWidth),
      new THREE.MeshStandardMaterial({ color: 0xbfe0fb, roughness: 0.6 }),
    );
    basin.position.set(waterCenterX, -WATER_DEPTH / 2, 0);
    scene.add(basin);

    const waterSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(WATER_LENGTH, totalWidth),
      new THREE.MeshStandardMaterial({
        color: 0x4dabf7,
        transparent: true,
        opacity: 0.55,
        roughness: 0.15,
        metalness: 0.1,
      }),
    );
    waterSurface.rotation.x = -Math.PI / 2;
    waterSurface.position.set(waterCenterX, waterSurfaceY, 0);
    scene.add(waterSurface);

    // lane dividers (thin white strips on top of the water, one more than lane count)
    for (let i = 0; i <= lanesCount; i++) {
      const z = i * LANE_WIDTH - halfWidth;
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(WATER_LENGTH + 0.2, 0.04, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xffffff }),
      );
      divider.position.set(waterCenterX, waterSurfaceY + 0.03, z);
      scene.add(divider);
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

      const sprite = makeLaneNumberSprite(lane);
      sprite.position.set(deckCenterX + DECK_LENGTH / 2 + 0.15, DECK_HEIGHT + 0.4, z);
      scene.add(sprite);
    }
    lanePlanesRef.current = lanePlanes;

    // ---------- swimmer figure ----------
    const suitMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.5 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf3c89e, roughness: 0.7 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xff8787, roughness: 0.6 });
    swimmerMaterialsRef.current = { suit: suitMat, skin: skinMat, cap: capMat };

    const swimmerGroup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 4, 12), suitMat);
    body.position.y = 0;
    swimmerGroup.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skinMat);
    head.position.y = 0.58;
    swimmerGroup.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), capMat);
    cap.position.y = 0.6;
    swimmerGroup.add(cap);
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

    function pickLaneAt(clientX: number, clientY: number): number | null {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(lanePlanesRef.current, false);
      if (hits.length === 0) return null;
      return hits[0].object.userData.lane as number;
    }

    let pointerDownPos: { x: number; y: number } | null = null;
    function handlePointerDown(e: PointerEvent) {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    }
    function handlePointerUp(e: PointerEvent) {
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
    }
    function handlePointerMove(e: PointerEvent) {
      const lane = pickLaneAt(e.clientX, e.clientY);
      renderer.domElement.style.cursor =
        lane !== null && stateRef.current.onPickLane && !stateRef.current.occupiedLanes.includes(lane)
          ? "pointer"
          : "grab";
    }
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);

    // ---------- render loop ----------
    let raf = 0;
    const clock = new THREE.Clock();
    function tick() {
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
    }
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
    };
    // Scene is built once per lane-count; everything else flows through stateRef.
  }, [lanesCount]);

  // Update swimmer colors when the character changes.
  useEffect(() => {
    const mats = swimmerMaterialsRef.current;
    if (!mats || !swimmer) return;
    mats.suit.color.set(swimmer.suit);
    mats.skin.color.set(swimmer.skin);
    mats.cap.color.set(swimmer.cap);
  }, [swimmer?.suit, swimmer?.skin, swimmer?.cap, swimmer]);

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
