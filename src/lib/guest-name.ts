// Erzeugt einen freundlichen, anonymen Gastnamen, falls keiner angegeben wird.
const ADJECTIVES = [
  "Fröhlicher",
  "Neugieriger",
  "Sonniger",
  "Ruhiger",
  "Flinker",
  "Freundlicher",
  "Verträumter",
  "Munterer",
];

const ANIMALS = [
  "Fuchs",
  "Otter",
  "Igel",
  "Kranich",
  "Delfin",
  "Luchs",
  "Waschbär",
  "Kolibri",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomGuestName(): string {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}
