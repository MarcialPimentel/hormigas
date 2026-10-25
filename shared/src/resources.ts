import { RESOURCE_IDS, type Resources } from './data';

export const res = (foliage = 0, protein = 0, nectar = 0): Resources => ({ foliage, protein, nectar });

export const add = (a: Resources, b: Resources): Resources => res(a.foliage + b.foliage, a.protein + b.protein, a.nectar + b.nectar);
export const sub = (a: Resources, b: Resources): Resources => res(a.foliage - b.foliage, a.protein - b.protein, a.nectar - b.nectar);
export const scale = (a: Resources, k: number): Resources => res(a.foliage * k, a.protein * k, a.nectar * k);
export const floorRes = (a: Resources): Resources => res(Math.floor(a.foliage), Math.floor(a.protein), Math.floor(a.nectar));
export const total = (a: Resources): number => a.foliage + a.protein + a.nectar;
export const canAfford = (have: Resources, cost: Resources): boolean => RESOURCE_IDS.every((r) => have[r] + 1e-9 >= cost[r]);
export const clampMin0 = (a: Resources): Resources => res(Math.max(0, a.foliage), Math.max(0, a.protein), Math.max(0, a.nectar));
