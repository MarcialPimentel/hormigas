import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CASTES,
  MVP_CASTES,
  RESOURCE_IDS,
  WILDS_SPOT,
  DISCOVERY_MESSAGES,
  HERDS,
  DIPLOMACY_MESSAGES,
  raidBlockMessage,
  distance,
  forageFindCap,
  partyForageLuck,
  maxColonies,
  colonyCapMessage,
  groupCargo,
  groupSpeed,
  lvl,
  missionFuel,
  missionSlotUsage,
  missionTimes,
  missionUnitProblem,
  missionUnitsAllowed,
  noSlotsMessage,
  MISSION_SPEED,
  RETREAT_PCTS,
  MISSION_TYPES,
  presentUnits,
  speedForReturnIn,
  travelSeconds,
  validCoords,
  type CasteId,
  type Coords,
  type UnitCounts,
} from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtClock, fmtCoords, fmtDuration, fmtFull, fmtNum } from '../format';
import { RESOURCE_LABEL } from '../describe';
import { Empty, Panel, ResDot } from '../components/ui';
import { ENABLED_MISSIONS, MISSION_HELP, MISSION_LABEL, type MissionType } from '../nav';
import { BattlePreview } from '../components/BattlePreview';
import { ForageOdds } from '../components/ForageOdds';
import { PatchView, isScent, usePatchMode, type PartyFocus, type Spot } from '../components/Patch';
import { UnderWay, type FocusParty } from '../components/UnderWay';

export interface MissionDraft {
  type?: MissionType;
  target?: Coords;
  /** a patch to show (defaults to the target's patch, then your own) */
  view?: { region: number; patch: number };
  /** a battle report's data to replay on the 3D patch */
  replay?: unknown;
}

/** What's at the target spot, as this player knows it (scent or known colony), for the form's summary and checks. */
function useTargetSpot(target: Coords, valid: boolean): Spot | null | undefined {
  const { state } = useGame();
  const [spot, setSpot] = useState<Spot | null | undefined>(undefined);
  useEffect(() => {
    if (!valid) return setSpot(null);
    let live = true;
    api
      .get(`/api/map?region=${target.region}&patch=${target.patch}`)
      .then((r) => live && setSpot(r.spots.find((x: Spot) => x.spot === target.spot) ?? null))
      .catch(() => live && setSpot(null));
    return () => {
      live = false;
    };
  }, [target.region, target.patch, target.spot, valid, state?.serverNow]);
  return spot;
}

/** "Fire Ant Mound", "Ant scent", "The wilds", "Spot 6 (empty)" */
function targetName(spot: Spot | null | undefined, at: Coords, home: Coords): string {
  if (at.spot === WILDS_SPOT) return at.region === home.region && at.patch === home.patch ? 'The wilds of your patch' : 'The wilds';
  if (spot === undefined) return '…';
  if (!spot?.colony) return `Spot ${at.spot} (empty)`;
  return spot.colony.name;
}

/** Wide enough for the left nav (styles.css, 900px): the patch fills the screen and the cards float over it. */
const WIDE = '(min-width: 900px)';
function useWide() {
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(WIDE).matches);
  useEffect(() => {
    const m = matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * The Missions screen. On a computer with the 3D patch it's the war room (docs/11-world.md): the patch or the
 * Garden fills the screen; where you are floats top left, everything under way and the picked spot down the
 * right, and picking an action on a spot opens the Deploy card. Otherwise the patch, the form and the list stack.
 */
export function Missions({ draft, go }: { draft?: MissionDraft; go?: (screen: string) => void }) {
  const { colony, state } = useGame();
  const [type, setType] = useState<MissionType>(draft?.type && ENABLED_MISSIONS.includes(draft.type) ? draft.type : 'transport');
  const [target, setTarget] = useState<Coords>(draft?.target ?? colony?.coords ?? { region: 1, patch: 1, spot: 1 });
  const [deploy, setDeploy] = useState(!!draft?.type);
  const [focus, setFocus] = useState<PartyFocus | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const wide = useWide();
  const pm = usePatchMode(draft?.replay);
  const staged = wide && pm.show3d;

  useEffect(() => {
    if (draft?.type && ENABLED_MISSIONS.includes(draft.type)) {
      setType(draft.type);
      setDeploy(true);
    }
    if (draft?.target) setTarget(draft.target);
  }, [draft]);

  if (!colony || !state) return null;
  function pick(t: MissionType, at: Coords) {
    setType(t);
    setTarget(at);
    setDeploy(true);
    if (!staged) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const onFocus: FocusParty = (key, at, alsoAt) => setFocus((f) => ({ key, at, alsoAt, n: (f?.n ?? 0) + 1 }));
  const start = draft?.view ?? (draft?.target ? { region: draft.target.region, patch: draft.target.patch } : undefined);
  const form = (
    <SendMission
      type={type}
      setType={setType}
      target={target}
      setTarget={setTarget}
      onClose={staged ? () => setDeploy(false) : undefined}
      onSent={staged ? () => setDeploy(false) : undefined}
    />
  );
  const underWay = (
    <Panel title="Under way">
      <UnderWay onFocus={onFocus} />
    </Panel>
  );

  if (staged)
    return (
      <PatchView
        start={start}
        selected={target}
        onAct={pick}
        replay={draft?.replay}
        go={go}
        pm={pm}
        stage={{ side: underWay, deploy: deploy ? <div className="deploy">{form}</div> : null, focus, inset: { left: deploy ? 300 : 16, right: 200, top: 80, bottom: 40 } }}
      />
    );
  return (
    <div className="stack">
      <Panel title="Missions">
        <PatchView start={start} selected={target} onAct={pick} replay={draft?.replay} go={go} pm={pm} />
      </Panel>
      <div ref={formRef} className="scroll-anchor" />
      {form}
      {underWay}
    </div>
  );
}

/**
 * The mission form: type, target, units, cargo, speed, fall-back, and Send. In the war room it's the Deploy card
 * that opens over the patch when you pick an action on a spot (`onClose` set); on phones it sits under the patch.
 */
function SendMission({ type, setType, target, setTarget, onClose, onSent }: {
  type: MissionType;
  setType: (t: MissionType) => void;
  target: Coords;
  setTarget: (c: Coords) => void;
  onClose?: () => void;
  onSent?: () => void;
}) {
  const { colony, state, act, now } = useGame();
  const [units, setUnits] = useState<Record<string, string>>({});
  const [cargo, setCargo] = useState<Record<string, string>>({});
  const [speedPct, setSpeedPct] = useState(100);
  const [retreatPct, setRetreatPct] = useState(0);
  const [returnBy, setReturnBy] = useState('');
  const [manual, setManual] = useState(false);
  const chosen: UnitCounts = useMemo(() => {
    const u: UnitCounts = {};
    for (const [k, v] of Object.entries(units)) {
      const n = Math.floor(Number(v) || 0);
      if (n > 0) u[k as CasteId] = n;
    }
    return u;
  }, [units]);

  const targetSpot = useTargetSpot(target, validCoords(target, true, true));

  if (!colony || !state) return null;
  const research = state.player.research;
  // the mission's fixed rules, the same table the server checks (shared/src/missions.ts)
  const rules = MISSION_TYPES[type];
  const allowed = (missionUnitsAllowed(type) ?? MVP_CASTES).filter((id) => lvl(colony.units, id) > 0 || chosen[id]);
  const cargoAllowed = rules.allowsCargo;
  const cargoAmounts = Object.fromEntries(RESOURCE_IDS.map((r) => [r, cargoAllowed ? Math.floor(Number(cargo[r]) || 0) : 0])) as Record<'foliage' | 'protein' | 'nectar', number>;
  const cargoTotal = cargoAmounts.foliage + cargoAmounts.protein + cargoAmounts.nectar;
  const capacity = groupCargo(chosen, { corpses: type === 'haul' });
  const wildsOk = rules.allowsWilds;
  // wild sites (spots 14+) hold aphid herds, termite mounds and spider dens (docs/24-npcs.md)
  const valid = validCoords(target, wildsOk, rules.allowsSites);
  const dist = valid ? distance(colony.coords, target) : 0;
  const speed = groupSpeed(chosen, research);
  const oneWay = speed > 0 && valid ? travelSeconds(dist, speed, speedPct, state.world.speed) : 0;
  const fuel = speed > 0 && valid ? missionFuel(chosen, dist, speedPct) : 0;
  const pool = rules.slot;
  const missions: any[] = state.missions ?? [];
  const { used, max } = missionSlotUsage(missions, pool, research, colony.id);

  const problems: string[] = [];
  if (!valid) problems.push(wildsOk ? 'Pick a real patch.' : 'Pick a real colony spot (spots 1–12).');
  if (rules.target === 'wilds' && valid && target.spot !== WILDS_SPOT) problems.push(`Foragers go to the wilds (spot ${WILDS_SPOT}).`);
  const unscouted = isScent(targetSpot?.colony);
  if (unscouted && type === 'raid') problems.push(DISCOVERY_MESSAGES.raid_needs_scout);
  if (unscouted && type === 'transport') problems.push(DISCOVERY_MESSAGES.send_needs_scout);
  const herd = targetSpot?.colony?.herd;
  if (type === 'tend') {
    if (unscouted) problems.push(DISCOVERY_MESSAGES.tend_needs_scout);
    else if (targetSpot !== undefined && !herd) problems.push('Only aphid herds can be tended. Tap a herd on the patch above.');
    else if (herd?.tended && !herd.yours) problems.push(`${herd.tenderName}'s ants tend this herd. Raid it to drive them off first.`);
  }
  if (type === 'raid' && herd && !herd.tended) problems.push('Nobody tends this herd, so there is no one to fight. Send ants to tend it instead.');
  if (type === 'raid' && herd?.yours) problems.push('Your own ants tend this herd.');
  const rel = targetSpot?.colony?.relation;
  if (type === 'raid' && rel) problems.push(raidBlockMessage({ relation: rel, until: targetSpot?.colony?.relationUntil ?? undefined }));
  if (type === 'hold' && targetSpot !== undefined && rel !== 'ally') problems.push(DIPLOMACY_MESSAGES.hold_needs_ally);
  if (presentUnits(chosen).length === 0) problems.push('Choose units to send.');
  const unitProblem = missionUnitProblem(type, chosen);
  if (unitProblem && presentUnits(chosen).length > 0) problems.push(unitProblem.short);
  for (const [k, n] of Object.entries(chosen)) if (n! > lvl(colony.units, k as CasteId)) problems.push(`Only ${lvl(colony.units, k as CasteId)} ${CASTES[k as CasteId].name} at home.`);
  if (cargoTotal > capacity) problems.push(`Cargo is over capacity (${fmtFull(capacity)}).`);
  if (cargoAmounts.nectar + fuel > colony.resources.nectar) problems.push(`Not enough Nectar: needs ${fmtFull(fuel)} for the trip${cargoAmounts.nectar ? ' plus cargo' : ''}.`);
  for (const r of ['foliage', 'protein'] as const) if (cargoAmounts[r] > colony.resources[r]) problems.push(`Not enough ${RESOURCE_LABEL[r]} to load.`);
  if (used >= max) problems.push(noSlotsMessage(pool, max));
  if (valid && target.region === colony.coords.region && target.patch === colony.coords.patch && target.spot === colony.coords.spot) problems.push("That's this colony.");
  if (type === 'colonize') {
    const flying = missions.filter((m) => m.type === 'colonize' && m.status === 'outbound').length;
    const cap = maxColonies(research);
    if (state.colonies.length + flying >= cap) problems.push(colonyCapMessage(cap));
  }

  const stays = rules.oneWay;
  const times = oneWay ? missionTimes(type, now, oneWay) : null;

  function applyReturnBy(value: string) {
    setReturnBy(value);
    if (!value || speed <= 0 || !valid) return;
    const [h, m] = value.split(':').map(Number);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    let wanted = d.getTime() - now;
    if (wanted <= 0) wanted += 86400_000;
    setSpeedPct(speedForReturnIn(wanted / 1000, dist, speed, state!.world.speed));
  }

  function fillCargo() {
    let left = capacity;
    const out: Record<string, string> = {};
    // fill rarest first so nectar for fuel stays available
    for (const r of ['foliage', 'protein', 'nectar'] as const) {
      const avail = Math.floor(r === 'nectar' ? colony!.resources.nectar - fuel : colony!.resources[r]);
      const take = Math.max(0, Math.min(left, avail));
      out[r] = take ? String(take) : '';
      left -= take;
    }
    setCargo(out);
  }

  async function send() {
    const ok = await act(
      () => api.post('/api/missions', { colonyId: colony!.id, type, target, units: chosen, cargo: cargoAllowed ? cargoAmounts : undefined, speedPct, ...(type === 'raid' ? { retreatPct } : {}) }),
      `${MISSION_LABEL[type]} mission sent.`,
    );
    if (ok) {
      setUnits({});
      setCargo({});
      setReturnBy('');
      onSent?.();
    }
  }

  return (
      <Panel
        title={onClose ? `Deploy: ${MISSION_LABEL[type]} → ${targetName(targetSpot, target, colony.coords)}` : 'Send a mission'}
        actions={
          <>
            <span className="muted small">{used}/{max} {pool === 'forage' ? 'forage parties' : 'slots'} in use</span>
            {onClose && (
              <button className="btn ghost small" onClick={onClose} aria-label="Close the deploy card">
                ✕
              </button>
            )}
          </>
        }
      >
        <div className="seg" role="radiogroup" aria-label="Mission type">
          {ENABLED_MISSIONS.filter((t) => t !== 'hold' || state.player.supercolony || type === 'hold').map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={type === t}
              className={type === t ? 'on' : ''}
              onClick={() => {
                setType(t);
                if (MISSION_TYPES[t].target === 'wilds' && target.spot !== WILDS_SPOT) setTarget({ ...colony.coords, spot: WILDS_SPOT });
                if (!MISSION_TYPES[t].allowsWilds && target.spot === WILDS_SPOT) setTarget({ ...target, spot: 1 });
              }}
            >
              {MISSION_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="muted small">{MISSION_HELP[type]}</p>

        <fieldset className="field">
          <legend>Target</legend>
          <div className="target-line">
            <span>
              <strong>{targetName(targetSpot, target, colony.coords)}</strong>{' '}
              <span className="muted small">{valid ? fmtCoords(target) : 'not a place'}</span>
              {unscouted && <span className="scent-tag">Not scouted</span>}
            </span>
            <button className="btn ghost small" aria-expanded={manual} onClick={() => setManual(!manual)}>
              {manual ? 'Done' : 'Enter coordinates'}
            </button>
          </div>
          <p className="muted small">Pick a target by tapping it on the patch{onClose ? '' : ' above'}.</p>
          {manual && (
            <div className="coords-input">
              {(['region', 'patch', 'spot'] as const).map((k) => (
                <label key={k}>
                  {k[0].toUpperCase() + k.slice(1)}
                  <input type="number" min={1} value={target[k]} onChange={(e) => setTarget({ ...target, [k]: Math.floor(Number(e.target.value)) || 1 })} />
                </label>
              ))}
              {wildsOk && target.spot !== WILDS_SPOT && (
                <button className="btn ghost small" onClick={() => setTarget({ ...colony.coords, spot: WILDS_SPOT })}>
                  My patch's wilds
                </button>
              )}
            </div>
          )}
          {type === 'scout' && target.spot === WILDS_SPOT && (
            <p className="muted small">Scouts will survey the wilds: what foragers can expect there, who lives in the patch, and any corpses lying around.</p>
          )}
          {type === 'tend' && herd && (
            <p className="muted small">
              This herd makes {fmtFull(herd.nectarPerHour)} Nectar an hour while tended, carried home every {HERDS.deliverEveryHours} hours. Tenders stay
              until you call them home from the herd's card. Anyone can raid them to take the herd, so soldiers make good tenders.
            </p>
          )}
          {type === 'scout' && unscouted && (
            <p className="muted small">Scouting turns this scent into a colony you know: its name, owner and what's inside. Then you can raid it.</p>
          )}
        </fieldset>

        {type === 'forage' && (
          <fieldset className="field">
            <legend>What foragers might find</legend>
            {state.player.firstForage && (
              <p className="first-forage small">Your first forage party is sure to come back with food.</p>
            )}
            <ForageOdds luck={partyForageLuck(research, chosen)} />
            <ForageCap capacity={capacity} findCap={forageFindCap(state.player.points.total, partyForageLuck(research, chosen))} />
          </fieldset>
        )}

        <fieldset className="field">
          <legend>Units</legend>
          {allowed.length === 0 ? (
            <Empty>{type === 'scout' ? 'No Scouts at home. Raise some in the Brood Hall.' : 'No units at home. Raise some in the Brood Hall.'}</Empty>
          ) : (
            <ul className="pick">
              {allowed.map((id) => (
                <li key={id}>
                  <span>
                    {CASTES[id].name} <span className="muted small">{fmtFull(lvl(colony.units, id))} home</span>
                  </span>
                  <span className="pick-input">
                    <input inputMode="numeric" placeholder="0" aria-label={`${CASTES[id].name} to send`} value={units[id] ?? ''} onChange={(e) => setUnits({ ...units, [id]: e.target.value.replace(/\D/g, '') })} />
                    <button className="btn ghost small" onClick={() => setUnits({ ...units, [id]: String(lvl(colony.units, id)) })}>
                      All
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        {cargoAllowed && (
          <fieldset className="field">
            <legend>
              Cargo <span className="muted small">{fmtFull(cargoTotal)} / {fmtFull(capacity)}</span>
            </legend>
            <div className="cargo-input">
              {RESOURCE_IDS.map((r) => (
                <label key={r}>
                  <span><ResDot r={r} /> {RESOURCE_LABEL[r]}</span>
                  <input inputMode="numeric" placeholder="0" value={cargo[r] ?? ''} onChange={(e) => setCargo({ ...cargo, [r]: e.target.value.replace(/\D/g, '') })} />
                </label>
              ))}
              <button className="btn ghost small" disabled={capacity === 0} onClick={fillCargo}>
                Fill
              </button>
            </div>
          </fieldset>
        )}

        <fieldset className="field">
          <legend>Speed {speedPct}%</legend>
          <div className="speed">
            <input type="range" min={MISSION_SPEED.min} max={MISSION_SPEED.max} step={MISSION_SPEED.step} value={speedPct} onChange={(e) => { setSpeedPct(Number(e.target.value)); setReturnBy(''); }} aria-label="Speed" />
            {!stays && (
              <label className="return-by">
                Back no earlier than
                <input type="time" value={returnBy} onChange={(e) => applyReturnBy(e.target.value)} disabled={speed <= 0 || !valid} />
              </label>
            )}
          </div>
          <p className="muted small">Slower missions use less Nectar. Use "back no earlier than" to keep your army safely away while you're offline.</p>
        </fieldset>

        {type === 'raid' && (
          <fieldset className="field">
            <legend>Fall back</legend>
            <div className="tabs" role="radiogroup" aria-label="Fall back">
              {RETREAT_PCTS.map((p) => (
                <button key={p} role="radio" aria-checked={retreatPct === p} className={retreatPct === p ? 'on' : ''} onClick={() => setRetreatPct(p)}>
                  {p === 0 ? 'Fight to the end' : `After ${p}% losses`}
                </button>
              ))}
            </div>
            <p className="muted small">
              Raiding ants break off when a fight goes badly. Falling back saves the rest of your army, but brings home no loot.
            </p>
          </fieldset>
        )}

        {type === 'raid' && !unscouted && <BattlePreview target={target} units={chosen} retreatPct={retreatPct} />}

        <dl className="summary">
          <div><dt>Distance</dt><dd>{valid ? fmtNum(dist) : '—'}</dd></div>
          <div><dt>One way</dt><dd>{oneWay ? fmtDuration(oneWay * 1000) : '—'}</dd></div>
          <div><dt>Arrives</dt><dd>{times ? fmtClock(times.arriveAt) : '—'}</dd></div>
          <div><dt>Back home</dt><dd>{times?.returnAt ? fmtClock(times.returnAt) : type === 'hold' ? 'when recalled' : stays ? 'stays' : '—'}</dd></div>
          <div><dt>Nectar fuel (paid once)</dt><dd className={fuel > colony.resources.nectar ? 'warn' : ''}>{fuel ? fmtFull(fuel) : '—'}</dd></div>
          {type !== 'scout' && <div><dt>{type === 'haul' ? 'Corpse capacity' : 'Capacity'}</dt><dd>{fmtFull(capacity)}</dd></div>}
        </dl>
        <p className="muted small">
          Fuel is taken from your Nectar once, when the party leaves, and covers the whole trip; your Nectar per hour doesn't change. It grows with how many
          ants you send (soldiers drink more than workers, scouts hardly any), how far they go, and how fast.
        </p>

        {problems.length > 0 && presentUnits(chosen).length > 0 && (
          <ul className="problems">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        <button className="btn primary wide" disabled={problems.length > 0} onClick={send}>
          Send {MISSION_LABEL[type].toLowerCase()} to {valid ? fmtCoords(target) : '…'}
        </button>
      </Panel>
  );
}

/** The most one forage party can bring home, and how many Workers it takes to carry that. */
function ForageCap({ capacity, findCap }: { capacity: number; findCap: number }) {
  const per = CASTES.worker.cargo;
  const workers = Math.ceil(findCap / per);
  return (
    <p className="small">
      A forage party brings home at most <strong>{fmtFull(findCap)}</strong> food (grows with your points), about{' '}
      {fmtFull(workers)} {workers === 1 ? 'Worker' : 'Workers'} of carrying at {fmtFull(per)} each.{' '}
      {capacity === 0 ? null : capacity < findCap ? (
        <span className="muted">This party carries {fmtFull(capacity)}, so a big find would be cut to that.</span>
      ) : (
        <span className="muted">This party carries {fmtFull(capacity)}: enough for the biggest find.</span>
      )}
    </p>
  );
}
