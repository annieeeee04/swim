export interface Character {
  id: string;
  name: string;
  /** Flat accent colors, still used by the 2D SwimmerAvatar icon in pickers/lists. */
  skin: string;
  suit: string;
  cap: string;
  /** Path (under /public) to the real 3D model shown in the pool scene.
   *  "" means no model has been uploaded yet — the 3D pool falls back to a
   *  generic placeholder swimmer, while every 2D spot (picker, records, etc.)
   *  already just uses the SwimmerAvatar icon, model or not. */
  modelUrl: string;
  /** Multiplies the model's auto-normalized height. 1 = the scene's standard swimmer height. */
  modelScale?: number;
  /** Extra yaw (radians) to make the model face "forward" down the lane. */
  modelRotationY?: number;
}

/** Toy Story crew — real GLTF models rendered in the 3D pool scene. */
export const CHARACTERS: Character[] = [
  {
    id: "woody",
    name: "Woody",
    skin: "#e7b48a",
    suit: "#d4a23c",
    cap: "#c0392b",
    modelUrl: "/models/woody.glb",
    modelScale: 1,
    modelRotationY: 0,
  },
  {
    id: "buzz",
    name: "Buzz Lightyear",
    skin: "#eef1f3",
    suit: "#2e7d46",
    cap: "#6b3fa0",
    modelUrl: "/models/buzz.glb",
    modelScale: 1,
    modelRotationY: 0,
  },
  {
    id: "bopeep",
    name: "Bo Peep",
    skin: "#f3c89e",
    suit: "#5b8fc7",
    cap: "#f2e6c9",
    modelUrl: "/models/bopeep.glb",
    modelScale: 1,
    modelRotationY: 0,
  },
  {
    id: "jessie",
    name: "Jessie",
    skin: "#f3c89e",
    suit: "#e11d48",
    cap: "#fbbf24",
    modelUrl: "",
    modelScale: 1,
    modelRotationY: 0,
  },
  {
    id: "rex",
    name: "Rex",
    skin: "#4ade80",
    suit: "#15803d",
    cap: "#166534",
    modelUrl: "",
    modelScale: 1,
    modelRotationY: 0,
  },
  {
    id: "hamm",
    name: "Hamm",
    skin: "#f9a8d4",
    suit: "#db2777",
    cap: "#9d174d",
    modelUrl: "",
    modelScale: 1,
    modelRotationY: 0,
  },
];
