export interface Character {
  id: string;
  name: string;
  skin: string;
  suit: string;
  cap: string;
}

/** Six cute swimmer avatars, distinguished by cap/suit color only (no external art). */
export const CHARACTERS: Character[] = [
  { id: "coral", name: "Coral", skin: "#f3c89e", suit: "#ff6b6b", cap: "#ff8787" },
  { id: "wave", name: "Wave", skin: "#e7b48a", suit: "#339af0", cap: "#4dabf7" },
  { id: "lime", name: "Lime", skin: "#ffd8a8", suit: "#82c91e", cap: "#a9e34b" },
  { id: "sunny", name: "Sunny", skin: "#c98a5e", suit: "#ffd43b", cap: "#ffe066" },
  { id: "plum", name: "Plum", skin: "#8d5a3f", suit: "#9775fa", cap: "#b197fc" },
  { id: "mint", name: "Mint", skin: "#f3c89e", suit: "#20c997", cap: "#63e6be" },
];
