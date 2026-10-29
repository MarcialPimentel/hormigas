import { useEffect, useMemo, useState } from 'react';
import {
  CASTES,
  MVP_CASTES,
  RESOURCE_IDS,
  WILDS_SPOT,
  distance,
  forageSlots,
  maxColonies,
  groupCargo,
  groupSpeed,
  lvl,
  missionFuel,
  missionSlots,
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
import { Countdown, Empty, Panel, ResDot, Trip } from '../components/ui';
import { ENABLED_MISSIONS, MISSION_HELP, MISSION_LABEL, type MissionType } from '../nav';
import { BattlePreview } from '../components/BattlePreview';
import { ForageOdds } from '../components/ForageOdds';

export interface MissionDraft {
  type?: MissionType;
  target?: Coords;
}

const UNITS_FOR: Partial<Record<MissionType, CasteId[]>> = {
  scout: ['scout'],
};

export function Missions({ draft }: { draft?: MissionDraft }) {
  const { colony, state, act, now } = useGame();
  const [type, setType] = useState<MissionType>(draft?.type && ENABLED_MISSIONS.includes(draft.type) ? draft.type : 'transport');
  const [target, setTarget] = useState<Coords>(draft?.target ?? colony?.coords ?? { region: 1, patch: 1, spot: 1 });
  const [units, setUnits] = useState<Record<string, string>>({});
  const [cargo, setCargo] = useState<Record<string, string>>({});
  const [speedPct, setSpeedPct] = useState(100);
  const [returnBy, setReturnBy] = useState('');

  useEffect(() => {
    if (draft?.type && ENABLED_MISSIONS.includes(draft.type)) setType(draft.type);
    if (draft?.target) setTarget(draft.target);
  }, [draft]);

  const chosen: UnitCounts = useMemo(() => {
    const u: UnitCounts = {};
    for (const [k, v] of Object.entries(units)) {
      const n = Math.floor(Number(v) || 0);
      if (n > 0) u[k as CasteId] = n;
    }
    return u;
  }, [units]);

  if (!colony || !state) return null;
  const research = state.player.research;
  const allowed = (UNITS_FOR[type] ?? MVP_CASTES).filter((id) => lvl(colony.units, id) > 0 || chosen[id]);
  const cargoAllowed = type === 'transport' || type === 'relocate' || type === 'colonize';
  const cargoAmounts = Object.fromEntries(RESOURCE_IDS.map((r) => [r, cargoAllowed ? Math.floor(Number(cargo[r]) || 0) : 0])) as Record<'foliage' | 'protein' | 'nectar', number>;
  const cargoTotal = cargoAmounts.foliage + cargoAmounts.protein + cargoAmounts.nectar;
  const capacity = groupCargo(chosen, { corpses: type === 'haul' });
  const wildsOk = type === 'forage' || type === 'scout';
  const valid = validCoords(target, wildsOk);
  const dist = valid ? distance(colony.coords, target) : 0;
  const speed = groupSpeed(chosen, research);
  const oneWay = speed > 0 && valid ? travelSeconds(dist, speed, speedPct, state.world.speed) : 0;
  const fuel = speed > 0 && valid ? missionFuel(chosen, dist, speedPct) : 0;
  const pool = type === 'forage' ? 'forage' : 'mission';
  const missions: any[] = state.missions ?? [];
  const used = missions.filter((m) => (m.type === 'forage' ? 'forage' : 'mission') === pool).length;
  const max = pool === 'forage' ? forageSlots(research) : missionSlots(research);

  const problems: string[] = [];
  if (!valid) problems.push(wildsOk ? 'Pick a real patch.' : 'Pick a real colony spot (spots 1–12).');
  if (type === 'forage' && valid && target.spot !== WILDS_SPOT) problems.push(`Foragers go to the wilds (spot ${WILDS_SPOT}).`);
  if (presentUnits(chosen).length === 0) problems.push('Choose units to send.');
  for (const [k, n] of Object.entries(chosen)) if (n! > lvl(colony.units, k as CasteId)) problems.push(`Only ${lvl(colony.units, k as CasteId)} ${CASTES[k as CasteId].name} at home.`);
  if (cargoTotal > capacity) problems.push(`Cargo is over capacity (${fmtFull(capacity)}).`);
  if (cargoAmounts.nectar + fuel > colony.resources.nectar) problems.push(`Not enough Nectar: needs ${fmtFull(fuel)} for the trip${cargoAmounts.nectar ? ' plus cargo' : ''}.`);
  for (const r of ['foliage', 'protein'] as const) if (cargoAmounts[r] > colony.resources[r]) problems.push(`Not enough ${RESOURCE_LABEL[r]} to load.`);
  if (used >= max) problems.push(pool === 'forage' ? 'All forage parties are out.' : `All ${max} mission slots are in use.`);
  if (valid && target.region === colony.coords.region && target.patch === colony.coords.patch && target.spot === colony.coords.spot) problems.push("That's this colony.");
  if (type === 'colonize') {
    if ((chosen.winged_queen ?? 0) !== 1) problems.push('Send exactly one Winged Queen.');
    const flying = missions.filter((m) => m.type === 'colonize' && m.status === 'outbound').length;
    const cap = maxColonies(research);
    if (state.colonies.length + flying >= cap) problems.push(`You can rule ${cap} ${cap === 1 ? 'colony' : 'colonies'} now. Research Nuptial Flight for more.`);
  }

  const returnTrip = type === 'relocate' || type === 'colonize' ? 0 : oneWay;

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
      () => api.post('/api/missions', { colonyId: colony!.id, type, target, units: chosen, cargo: cargoAllowed ? cargoAmounts : undefined, speedPct }),
      `${MISSION_LABEL[type]} mission sent.`,
    );
    if (ok) {
      setUnits({});
      setCargo({});
      setReturnBy('');
    }
  }

  return (
    <div className="stack">
      <Panel title="Send a mission" actions={<span className="muted">{used}/{max} {pool === 'forage' ? 'forage parties' : 'slots'} in use</span>}>
        <div className="seg" role="radiogroup" aria-label="Mission type">
          {ENABLED_MISSIONS.map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={type === t}
              className={type === t ? 'on' : ''}
              onClick={() => {
                setType(t);
                if (t === 'forage' && target.spot !== WILDS_SPOT) setTarget({ ...colony.coords, spot: WILDS_SPOT });
                if (t !== 'forage' && t !== 'scout' && target.spot === WILDS_SPOT) setTarget({ ...target, spot: 1 });
              }}
            >
              {MISSION_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="muted small">{MISSION_HELP[type]}</p>

        <fieldset className="field">
          <legend>Target</legend>
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
          {type === 'scout' && target.spot === WILDS_SPOT && (
            <p className="muted small">Scouts will survey the wilds: what foragers can expect there, who lives in the patch, and any corpses lying around.</p>
          )}
        </fieldset>

        {type === 'forage' && (
          <fieldset className="field">
            <legend>What foragers might find</legend>
            {state.player.firstForage && (
              <p className="first-forage small">Your first forage party is sure to come back with food.</p>
            )}
            <ForageOdds luck={lvl(research, 'foraging_instinct')} />
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
            <input type="range" min={10} max={100} step={10} value={speedPct} onChange={(e) => { setSpeedPct(Number(e.target.value)); setReturnBy(''); }} aria-label="Speed" />
            {type !== 'relocate' && (
              <label className="return-by">
                Back no earlier than
                <input type="time" value={returnBy} onChange={(e) => applyReturnBy(e.target.value)} disabled={speed <= 0 || !valid} />
              </label>
            )}
          </div>
          <p className="muted small">Slower missions use less Nectar. Use "back no earlier than" to keep your army safely away while you're offline.</p>
        </fieldset>

        {type === 'raid' && <BattlePreview target={target} units={chosen} />}

        <dl className="summary">
          <div><dt>Distance</dt><dd>{valid ? fmtNum(dist) : '—'}</dd></div>
          <div><dt>One way</dt><dd>{oneWay ? fmtDuration(oneWay * 1000) : '—'}</dd></div>
          <div><dt>Arrives</dt><dd>{oneWay ? fmtClock(now + oneWay * 1000) : '—'}</dd></div>
          <div><dt>Back home</dt><dd>{returnTrip ? fmtClock(now + 2 * oneWay * 1000) : type === 'relocate' ? 'stays' : '—'}</dd></div>
          <div><dt>Nectar fuel</dt><dd className={fuel > colony.resources.nectar ? 'warn' : ''}>{fuel ? fmtFull(fuel) : '—'}</dd></div>
          {type !== 'scout' && <div><dt>{type === 'haul' ? 'Corpse capacity' : 'Capacity'}</dt><dd>{fmtFull(capacity)}</dd></div>}
        </dl>

        {problems.length > 0 && presentUnits(chosen).length > 0 && (
          <ul className="problems">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        <button className="btn primary wide" disabled={problems.length > 0} onClick={send}>
          Send {MISSION_LABEL[type].toLowerCase()} to {valid ? fmtCoords(target) : '…'}
        </button>
      </Panel>

      <Panel title="Missions under way">
        <MissionList />
      </Panel>
    </div>
  );
}

export function MissionList() {
  const { state, act, now } = useGame();
  const missions: any[] = state?.missions ?? [];
  if (missions.length === 0) return <Empty>No missions out.</Empty>;
  return (
    <ul className="missions">
      {missions.map((m) => {
        const out = m.status === 'outbound';
        const count = Object.values(m.units as Record<string, number>).reduce((a, b) => a + b, 0);
        return (
          <li key={m.id}>
            <div>
              <strong>{MISSION_LABEL[m.type as MissionType] ?? m.type}</strong> {out ? '→' : '←'} {fmtCoords(m.target)}
              <span className="muted small">
                {' '}· {fmtFull(count)} units{m.result?.recalled ? ' · recalled' : ''}
              </span>
            </div>
            <div className="mission-time">
              <Trip departAt={m.departAt} arriveAt={m.arriveAt} returnAt={m.returnAt} status={m.status} cargo={m.cargo} />
              <span className="muted small">{out ? 'Arrives' : 'Home'}</span>
              <Countdown endAt={out ? m.arriveAt : m.returnAt} />
              {out && now < m.arriveAt && (
                <button className="btn ghost small" onClick={() => act(() => api.post(`/api/missions/${m.id}/recall`), 'Mission recalled.')}>
                  Recall
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
