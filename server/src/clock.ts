// Server time source. Tests can replace it to fast-forward the world.
let source: () => number = () => Date.now();

export const now = (): number => source();

export function setClock(fn: () => number) {
  source = fn;
}

export function resetClock() {
  source = () => Date.now();
}
