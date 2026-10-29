// Brood Hall Protein sinks: feeding the brood, and larval digestion (Protein → Nectar).
// Spec: docs/05-castes-units.md (Feeding the brood), docs/03-economy.md (Larval digestion), docs/data/formulas.json "brood"
import { FORMULAS, type Resources } from './data';

const FEED = FORMULAS.brood.feeding;
const DIGEST = FORMULAS.brood.digestion;

export type Feeding = 'normal' | 'well_fed' | 'feast';
export const FEEDINGS: Feeding[] = ['normal', 'well_fed', 'feast'];
export const isFeeding = (v: unknown): v is Feeding => FEEDINGS.includes(v as Feeding);

export const feedingName = (f: Feeding): string => (f === 'normal' ? 'Normal' : FEED[f].name);

/** Extra Protein to feed ONE unit of this cost. */
export function feedingExtraProtein(cost: Resources, feeding: Feeding): number {
  if (feeding === 'normal') return 0;
  return Math.ceil(((cost.foliage + cost.protein) * FEED[feeding].extraProteinPct) / 100);
}

/** What ONE unit costs when raised with this feeding. */
export const fedCost = (cost: Resources, feeding: Feeding): Resources => ({ ...cost, protein: cost.protein + feedingExtraProtein(cost, feeding) });

/** Multiplier on raising time: Well fed 0.75, Feast 0.6. */
export const feedingTimeFactor = (feeding: Feeding): number => (feeding === 'normal' ? 1 : 1 - FEED[feeding].timeCutPct / 100);

// ---------- larval digestion ----------

/** Larvae digest Protein and feed liquid food back to the workers. Stored on the colony while it runs. */
export interface DigestJob {
  protein: number;
  nectar: number;
  /** Nectar already added to the colony's stores. */
  delivered: number;
  startAt: number;
  endAt: number;
}

export const DIGEST_RULES = {
  proteinPerNectar: DIGEST.proteinPerNectar,
  unlockBroodHall: DIGEST.unlockBroodHall,
  minProtein: DIGEST.minProtein,
};

/** Protein the larvae get through per hour at this Brood Hall level. */
export const digestProteinPerHour = (broodHall: number, worldSpeed = 1): number => DIGEST.proteinPerHourPerLevel * broodHall * worldSpeed;

/** Nectar and duration for digesting `protein`. */
export function digestPlan(protein: number, broodHall: number, worldSpeed = 1): { nectar: number; ms: number } {
  const perHour = digestProteinPerHour(Math.max(1, broodHall), worldSpeed);
  return { nectar: Math.floor(protein / DIGEST.proteinPerNectar), ms: Math.max(1000, Math.round((protein / perHour) * 3600_000)) };
}

/** Nectar a job has produced in total by time `at` (it trickles in evenly). */
export function digestDeliveredAt(job: DigestJob, at: number): number {
  if (at >= job.endAt) return job.nectar;
  if (at <= job.startAt) return 0;
  return Math.floor((job.nectar * (at - job.startAt)) / (job.endAt - job.startAt));
}

/** Advance a job to time `to`: the new Nectar since last time, and the job (null once finished). */
export function advanceDigest(job: DigestJob | null | undefined, to: number): { job: DigestJob | null; nectar: number } {
  if (!job) return { job: null, nectar: 0 };
  const total = digestDeliveredAt(job, to);
  const nectar = Math.max(0, total - job.delivered);
  if (to >= job.endAt) return { job: null, nectar };
  return { job: { ...job, delivered: Math.max(job.delivered, total) }, nectar };
}

/** Protein not yet digested at `at` (refunded if the job is stopped). */
export function digestUndigested(job: DigestJob, at: number): number {
  if (at >= job.endAt) return 0;
  const frac = at <= job.startAt ? 0 : (at - job.startAt) / (job.endAt - job.startAt);
  return Math.floor(job.protein * (1 - frac));
}
