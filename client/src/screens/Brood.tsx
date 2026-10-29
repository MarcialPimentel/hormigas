import { useState } from 'react';
import {
  CASTES,
  DEFENSES,
  MVP_CASTES,
  MVP_DEFENSES,
  RESOURCE_IDS,
  lvl,
  missingRequirements,
  queueEndsAt,
  queuedCounts,
  scale,
  unitSeconds,
  fedCost,
  feedingName,
  feedingTimeFactor,
  digestPlan,
  digestDeliveredAt,
  digestProteinPerHour,
  DIGEST_RULES,
  FEEDINGS,
  FORMULAS,
  type Feeding,
  type CasteId,
  type DefenseId,
  type Resources,
} from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtDuration, fmtFull, fmtNum } from '../format';
import { Cost, Countdown, Panel, Pic } from '../components/ui';
import { whyShort } from '../describe';

export const CASTE_BLURB: Record<string, string> = {
  worker: 'Cheap all-rounders. Carry loot and haul corpses.',
  minor_soldier: 'Fast and cheap. Good early raiders and fodder. Shred workers and scouts.',
  scout: 'Spies on other colonies. Nearly useless in a fight.',
  major_soldier: 'The colony’s main fighters. Tear through minor soldiers.',
  hauler: 'Big carriers for loot, transports and corpses.',
  winged_queen: 'Flies off to found a new colony. Send her from Missions or the Map with a Found colony mission.',
  soil_wall: 'One per colony. Huge guard that soaks up blows for the whole defense.',
  pit_trap: 'Cheap, Foliage-only trap. Good at absorbing an attack.',
  acid_sentry: 'Formic acid emplacement. Strong, and dangerous to major soldiers.',
};

const FEED = FORMULAS.brood.feeding;
const FEED_TEXT: Record<Feeding, string> = {
  normal: 'Larvae get their usual meals. Choose a richer diet to spend spare Protein on raising castes faster.',
  well_fed: `Extra Protein (+${FEED.well_fed.extraProteinPct}% of each caste's Foliage + Protein cost) and they're raised ${FEED.well_fed.timeCutPct}% faster. Well-fed ant larvae grow faster.`,
  feast: `Lots of extra Protein (+${FEED.feast.extraProteinPct}%) to raise them ${FEED.feast.timeCutPct}% faster. Costly: use it when Protein piles up.`,
};

const affordableCount = (cost: Resources, have: Resources) =>
  Math.max(0, Math.min(...RESOURCE_IDS.filter((r) => cost[r] > 0).map((r) => Math.floor(have[r] / cost[r]))));

function Stats({ def }: { def: any }) {
  const frenzy = Object.entries(def.frenzy ?? {}) as [string, number][];
  return (
    <dl className="stats">
      <div><dt>Attack</dt><dd>{fmtNum(def.attack)}</dd></div>
      <div><dt>Guard</dt><dd>{fmtNum(def.guard)}</dd></div>
      <div><dt>Health</dt><dd>{fmtNum(def.health)}</dd></div>
      {'speed' in def && <div><dt>Speed</dt><dd>{fmtNum(def.speed)}</dd></div>}
      {'cargo' in def && def.cargo > 0 && <div><dt>Cargo</dt><dd>{fmtNum(def.cargo)}</dd></div>}
      {frenzy.length > 0 && (
        <div className="wide">
          <dt>Frenzy</dt>
          <dd>{frenzy.map(([t, n]) => `vs ${(CASTES as any)[t]?.name ?? (DEFENSES as any)[t]?.name ?? t} ×${n}`).join(', ')}</dd>
        </div>
      )}
    </dl>
  );
}

export function Brood() {
  const { colony, state, act } = useGame();
  const [tab, setTab] = useState<'caste' | 'defense'>('caste');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [feed, setFeed] = useState<Feeding>('normal');
  if (!colony || !state) return null;
  const brood = lvl(colony.chambers, 'brood_hall');
  const queued = queuedCounts(colony.unitQueue);
  const ends = queueEndsAt(colony.unitQueue);
  const head = colony.unitQueue[0];
  const ids = tab === 'caste' ? MVP_CASTES : MVP_DEFENSES;

  return (
    <div className="stack">
      <Panel title="Brood Hall" actions={<span className="muted">{brood > 0 ? `Lv ${brood}` : 'not built'}</span>}>
        {brood === 0 ? (
          <p className="muted">Build a Brood Hall (Chambers → Colony) to raise castes and defenses.</p>
        ) : colony.unitQueue.length === 0 ? (
          <p className="muted">The Brood Hall is empty. Raise castes to forage, raid and defend.</p>
        ) : (
          <div className="queue">
            {colony.unitQueue.map((item, i) => {
              const def = item.kind === 'caste' ? CASTES[item.id as CasteId] : DEFENSES[item.id as DefenseId];
              return (
                <div key={i} className="queue-item">
                  <span>
                    {def.name} <span className="muted">{fmtFull(item.done)}/{fmtFull(item.count)}</span>
                    {item.feed && item.feed !== 'normal' && <span className="feed-tag"> · {feedingName(item.feed)}</span>}
                  </span>
                  {i === 0 && head?.startAt != null && (
                    <span className="muted small">
                      next in <Countdown endAt={head.startAt + (head.done + 1) * head.perUnitMs} />
                    </span>
                  )}
                </div>
              );
            })}
            {ends && (
              <p className="small muted">
                All done in <Countdown endAt={ends} />
              </p>
            )}
          </div>
        )}
        {colony.buildJob?.chamber === 'brood_hall' && <p className="notice">The Brood Hall is being enlarged and can't raise units until it's done.</p>}
      </Panel>

      {brood > 0 && <Digestion />}

      <div className="tabs" role="tablist" style={{ maxWidth: 360 }}>
        <button role="tab" aria-selected={tab === 'caste'} className={tab === 'caste' ? 'on' : ''} onClick={() => setTab('caste')}>
          Castes
        </button>
        <button role="tab" aria-selected={tab === 'defense'} className={tab === 'defense' ? 'on' : ''} onClick={() => setTab('defense')}>
          Defenses
        </button>
      </div>

      {tab === 'caste' && brood > 0 && (
        <Panel>
          <div className="feed-pick">
            <span>Feeding</span>
            <div className="tabs feed-tabs" role="radiogroup" aria-label="Feeding">
              {FEEDINGS.map((f) => (
                <button key={f} role="radio" aria-checked={feed === f} className={feed === f ? 'on' : ''} onClick={() => setFeed(f)}>
                  {feedingName(f)}
                </button>
              ))}
            </div>
          </div>
          <p className="small muted">{FEED_TEXT[feed]}</p>
        </Panel>
      )}

      <Panel>
        <ul className="rows">
          {ids.map((id) => {
            const def: any = tab === 'caste' ? CASTES[id as CasteId] : DEFENSES[id as DefenseId];
            const missing = missingRequirements(def.unlock, colony.chambers, state.player.research);
            const have = tab === 'caste' ? lvl(colony.units, id as CasteId) : lvl(colony.defenses, id as DefenseId);
            const f: Feeding = tab === 'caste' ? feed : 'normal';
            const unitCost: Resources = fedCost(def.cost, f);
            const maxAfford = affordableCount(unitCost, colony.resources);
            const cap = def.max ? Math.max(0, def.max - have - (queued[id] ?? 0)) : Infinity;
            const maxN = Math.min(maxAfford, cap, 100000);
            const raw = counts[id] ?? '';
            const n = Math.max(0, Math.floor(Number(raw) || 0));
            const per = unitSeconds(def.cost, { worldSpeed: state.world.speed, broodHall: Math.max(1, brood), timeMultiplier: state.player.timeMultiplier, research: state.player.research }) * feedingTimeFactor(f);
            let blocked = '';
            if (brood === 0) blocked = 'Build a Brood Hall first';
            else if (missing.length) blocked = `Needs ${missing.map((m) => `${m.name} ${m.need}`).join(', ')}`;
            else if (colony.buildJob?.chamber === 'brood_hall') blocked = 'Brood Hall is being enlarged';
            else if (cap === 0) blocked = `Limit ${def.max} per colony`;
            else if (n > maxN) blocked = maxAfford < n ? whyShort(colony, scale(unitCost, n), state.world.speed) : 'Over the limit';
            return (
              <li key={id} className={`row has-pic${missing.length ? ' locked' : ''}`}>
                <Pic kind={tab === 'caste' ? 'unit' : 'defense'} id={id} />
                <div className="row-main">
                  <div className="row-title">
                    <h3>{def.name}</h3>
                    <span className="muted small">
                      {fmtFull(have)} {tab === 'caste' ? 'home' : 'built'}
                      {queued[id] ? ` · ${fmtFull(queued[id])} queued` : ''}
                    </span>
                  </div>
                  <p className="blurb">{CASTE_BLURB[id]}</p>
                  <Stats def={def} />
                </div>
                <div className="row-side">
                  {missing.length || brood === 0 ? (
                    <span className="req">{blocked}</span>
                  ) : (
                    <>
                      <span className="small muted">
                        Each: <Cost cost={unitCost} /> · {fmtDuration(per * 1000)}
                      </span>
                      <form
                        className="count-form"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (n < 1 || blocked) return;
                          if (await act(() => api.post(`/api/colonies/${colony.id}/brood`, { kind: tab, id, count: n, feed: f }), `${fmtFull(n)} ${def.name} queued${f !== 'normal' ? ` (${feedingName(f).toLowerCase()})` : ''}.`))
                            setCounts((c) => ({ ...c, [id]: '' }));
                        }}
                      >
                        <input
                          inputMode="numeric"
                          aria-label={`How many ${def.name}`}
                          placeholder="0"
                          value={raw}
                          onChange={(e) => setCounts((c) => ({ ...c, [id]: e.target.value.replace(/\D/g, '') }))}
                        />
                        <button type="button" className="btn ghost small" disabled={maxN < 1} onClick={() => setCounts((c) => ({ ...c, [id]: String(maxN) }))}>
                          Max {fmtNum(maxN)}
                        </button>
                        <button className="btn primary" disabled={n < 1 || !!blocked}>
                          Raise
                        </button>
                      </form>
                      {n > 0 && !blocked && (
                        <span className="why">
                          Total <Cost cost={scale(unitCost, n)} have={colony.resources} /> · {fmtDuration(per * n * 1000)}
                        </span>
                      )}
                      {blocked && <span className="why">{blocked}</span>}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

/** Larval digestion: ant larvae digest solid Protein and feed liquid food back to the workers. docs/03-economy.md */
function Digestion() {
  const { colony, state, act, now } = useGame();
  const [raw, setRaw] = useState('');
  if (!colony || !state) return null;
  const brood = lvl(colony.chambers, 'brood_hall');
  const job = colony.digestJob;
  const rate = DIGEST_RULES.proteinPerNectar;
  const perHour = digestProteinPerHour(brood, state.world.speed);
  const amount = Math.max(0, Math.floor(Number(raw) || 0));
  const plan = digestPlan(amount, brood, state.world.speed);
  const have = Math.floor(colony.resources.protein);
  let blocked = '';
  if (brood < DIGEST_RULES.unlockBroodHall) blocked = `Needs Brood Hall ${DIGEST_RULES.unlockBroodHall}`;
  else if (amount > 0 && amount < DIGEST_RULES.minProtein) blocked = `At least ${DIGEST_RULES.minProtein} Protein`;
  else if (amount > have) blocked = 'Not enough Protein';
  return (
    <Panel title="Larval digestion" actions={<span className="muted small">{rate} Protein → 1 Nectar</span>}>
      <p className="small muted">
        Adult ants can't digest solid food, so they feed Protein to the larvae, who turn it into liquid food for the colony. A poor
        trade, but it turns spare Protein into Nectar while you're away. The larvae get through {fmtNum(perHour)} Protein an hour (more with a bigger Brood Hall).
      </p>
      {job ? (
        <div className="queue">
          <div className="queue-item">
            <span>
              {fmtFull(job.protein)} Protein → <strong>{fmtFull(digestDeliveredAt(job, now))}</strong>
              <span className="muted"> / {fmtFull(job.nectar)} Nectar</span>
            </span>
            <span className="muted small">
              done in <Countdown endAt={job.endAt} startAt={job.startAt} />
            </span>
          </div>
          <button
            className="btn ghost small"
            onClick={() => act(() => api.post(`/api/colonies/${colony.id}/digest/stop`, {}), 'Digestion stopped. The undigested Protein is back in the Larder.')}
          >
            Stop (refund undigested Protein)
          </button>
        </div>
      ) : brood < DIGEST_RULES.unlockBroodHall ? (
        <p className="req">{blocked}</p>
      ) : (
        <>
          <form
            className="count-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (amount < 1 || blocked) return;
              if (await act(() => api.post(`/api/colonies/${colony.id}/digest`, { protein: amount }), `The larvae are digesting ${fmtFull(amount)} Protein.`)) setRaw('');
            }}
          >
            <input inputMode="numeric" aria-label="Protein to digest" placeholder="Protein" value={raw} onChange={(e) => setRaw(e.target.value.replace(/\D/g, ''))} />
            <button type="button" className="btn ghost small" disabled={have < DIGEST_RULES.minProtein} onClick={() => setRaw(String(have))}>
              All {fmtNum(have)}
            </button>
            <button className="btn primary" disabled={amount < 1 || !!blocked}>
              Digest
            </button>
          </form>
          {amount > 0 && <span className="why">{blocked || <>Makes {fmtFull(plan.nectar)} Nectar over {fmtDuration(plan.ms)}</>}</span>}
        </>
      )}
    </Panel>
  );
}
