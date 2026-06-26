export interface Character {
  id: string;
  name: string;
  /** Flat accent colors, still used by the 2D SwimmerAvatar icon in pickers/lists. */
  skin: string;
  suit: string;
  cap: string;
  /** Path (under /public) to the real 3D model shown in the pool scene. */
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
];
