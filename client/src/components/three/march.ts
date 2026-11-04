// How marching columns look on the 3D maps, read from march.json. The scenes read MARCH every frame, so the test
// scene (/?test) can change a value and see it at once: the panel edits this same object, there is no second copy.
import SPEC from './march.json';

export interface MarchKnob { value: number; min: number; max: number; step: number; unit: string; label: string; note: string }
export type MarchGroup = 'yard' | 'patch';
type Spec = Record<MarchGroup, Record<string, MarchKnob>>;

export const MARCH_SPEC = { yard: SPEC.yard, patch: SPEC.patch } as Spec;

function defaults() {
  const out = {} as { [G in MarchGroup]: Record<string, number> };
  for (const g of Object.keys(MARCH_SPEC) as MarchGroup[]) {
    out[g] = {};
    for (const [k, v] of Object.entries(MARCH_SPEC[g])) out[g][k] = v.value;
  }
  return out;
}

/** The live values. Only the test scene changes them; everywhere else they are the file's numbers. */
export const MARCH = defaults() as {
  yard: Record<keyof typeof SPEC.yard, number>;
  patch: Record<keyof typeof SPEC.patch, number>;
};

/** Back to the file's numbers. */
export function resetMarch() {
  const d = defaults();
  for (const g of Object.keys(d) as MarchGroup[]) Object.assign(MARCH[g], d[g]);
}

/** Only the values that differ from the file, for Copy changes. */
export function marchChanges() {
  const out: Record<string, Record<string, number>> = {};
  for (const g of Object.keys(MARCH_SPEC) as MarchGroup[])
    for (const [k, v] of Object.entries(MARCH_SPEC[g])) {
      const now = (MARCH[g] as Record<string, number>)[k];
      if (now !== v.value) (out[g] ??= {})[k] = now;
    }
  return out;
}
