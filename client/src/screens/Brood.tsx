import { useState } from 'react';
import {
  CASTES,
  DEFENSES,
  MVP_CASTES,
  MVP_DEFENSES,
  RESOURCE_IDS,
  lvl,
  missingRequirements,
  broodBlocker,
  defenseRoom,
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
  fighterName,
  strongAgainst,
  weakAgainst,
  type FighterId,
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


const FEED = FORMULAS.brood.feeding;
const FEED_TEXT: Record<Feeding, string> = {
  normal: 'Larvae get their usual meals. Choose a richer diet to spend spare Protein on raising castes faster.',
  well_fed: `Extra Protein (+${FEED.well_fed.extraProteinPct}% of each caste's Foliage + Protein cost) and they're raised ${FEED.well_fed.timeCutPct}% faster. Well-fed ant larvae grow faster.`,
  feast: `Lots of extra Protein (+${FEED.feast.extraProteinPct}%) to raise them ${FEED.feast.timeCutPct}% faster. Costly: use it when Protein piles up.`,
};

const affordableCount = (cost: Resources, have: Resources) =>
  Math.max(0, Math.min(...RESOURCE_IDS.filter((r) => cost[r] > 0).map((r) => Math.floor(have[r] / cost[r]))));

function Stats({ id, def }: { id: string; def: any }) {
  if (def.chokepoint) return null; // the tunnel doesn't fight; its blurb says what it does
  const strong = strongAgainst(id as FighterId);
  const weak = weakAgainst(id as FighterId);
  return (
    <dl className="stats">
      <div><dt>Attack</dt><dd>{fmtNum(def.attack)}</dd></div>
      <div><dt>Guard</dt><dd>{fmtNum(def.guard)}</dd></div>
      <div><dt>Health</dt><dd>{fmtNum(def.health)}</dd></div>
      {'speed' in def && <div><dt>Speed</dt><dd>{fmtNum(def.speed)}</dd></div>}
      {'cargo' in def && def.cargo > 0 && <div><dt>Cargo</dt><dd>{fmtNum(def.cargo)}</dd></div>}
      {/* who beats whom, read from the frenzy numbers (docs/05-castes-units.md) */}
      {strong.length > 0 && (
        <div className="wide">
          <dt>Strong vs</dt>
          <dd>{strong.map(fighterName).join(', ')}</dd>
        </div>
      )}
      {weak.length > 0 && (
        <div className="wide">
          <dt>Weak vs</dt>
          <dd>{weak.map(fighterName).join(', ')}</dd>
        </div>
      )}
    </dl>
  );
}

/** Your army in this colony: who's home, who's out on missions, who's being raised; defenses built. */
function Army() {
  const { colony, state } = useGame();
  if (!colony || !state) return null;
  const queued = queuedCounts(colony.unitQueue);
  const out: Record<string, number> = {};
  for (const m of (state.missions ?? []) as any[]) {
    if (m.originColonyId !== colony.id) continue;
    for (const [id, c] of Object.entries((m.units ?? {}) as Record<string, number>)) out[id] = (out[id] ?? 0) + (c ?? 0);
  }
  const castes = MVP_CASTES.filter((id) => lvl(colony.units, id as CasteId) > 0 || out[id] || queued[id]);
  const defenses = MVP_DEFENSES.filter((id) => lvl(colony.defenses, id as DefenseId) > 0 || queued[id]);
  if (!castes.length && !defenses.length) return <p className="muted small">No ants raised yet. Pick a caste below.</p>;
  const line = (kind: 'unit' | 'defense', id: string, name: string, parts: string[]) => (
    <li key={id} className="army-row">
      <Pic kind={kind} id={id} />
      <b>{name}</b>
      <span className="muted small">{parts.filter(Boolean).join(' · ')}</span>
    </li>
  );
  return (
    <ul className="army">
      {castes.map((id) =>
        line('unit', id, CASTES[id as CasteId].name, [
          `${fmtFull(lvl(colony.units, id as CasteId))} home`,
          out[id] ? `${fmtFull(out[id])} out` : '',
          queued[id] ? `${fmtFull(queued[id])} raising` : '',
        ]),
      )}
      {defenses.map((id) =>
        line('defense', id, DEFENSES[id as DefenseId].name, [`${fmtFull(lvl(colony.defenses, id as DefenseId))} built`, queued[id] ? `${fmtFull(queued[id])} building` : '']),
      )}
    </ul>
  );
}

export function Brood() {
  const { colony, state, act } = useGame();
  const [tab, setTab] = useState<'caste' | 'defense'>('caste');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [feed, setFeed] = useState<Feeding>('normal');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!colony || !state) return null;
  const brood = lvl(colony.chambers, 'brood_hall');
  const queued = queuedCounts(colony.unitQueue);
  const ends = queueEndsAt(colony.unitQueue);
  const head = colony.unitQueue[0];
  const ids = tab === 'caste' ? MVP_CASTES : MVP_DEFENSES;

  return (
    <div className="stack brood">
      <Panel title="Your army" actions={<span className="muted">Brood Hall {brood > 0 ? `Lv ${brood}` : 'not built'}</span>}>
        <Army />
        {colony.unitQueue.length > 0 && (
          <div className="queue">
            <h3 className="queue-title">Raising now</h3>
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
        {brood === 0 && <p className="muted small">Build a Brood Hall (Chambers → Colony) to raise castes and defenses.</p>}
        {colony.buildJob?.chamber === 'brood_hall' && <p className="notice">The Brood Hall is being enlarged and can't raise units until it's done.</p>}
      </Panel>

      <Panel
        title="Raise"
        actions={
          <div className="tabs brood-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'caste'} className={tab === 'caste' ? 'on' : ''} onClick={() => setTab('caste')}>
              Castes
            </button>
            <button role="tab" aria-selected={tab === 'defense'} className={tab === 'defense' ? 'on' : ''} onClick={() => setTab('defense')}>
              Defenses
            </button>
          </div>
        }
      >
        {tab === 'caste' && brood > 0 && (
          <div className="feed-pick" title={FEED_TEXT[feed]}>
            <span>Feeding</span>
            <div className="tabs feed-tabs" role="radiogroup" aria-label="Feeding">
              {FEEDINGS.map((f) => (
                <button key={f} role="radio" aria-checked={feed === f} className={feed === f ? 'on' : ''} onClick={() => setFeed(f)}>
                  {feedingName(f)}
                </button>
              ))}
            </div>
            {feed !== 'normal' && <p className="small muted feed-note">{FEED_TEXT[feed]}</p>}
          </div>
        )}
        <ul className="units">
          {ids.map((id) => {
            const def: any = tab === 'caste' ? CASTES[id as CasteId] : DEFENSES[id as DefenseId];
            const missing = missingRequirements(def.unlock, colony.chambers, state.player.research, state.player.deeds);
            const have = tab === 'caste' ? lvl(colony.units, id as CasteId) : lvl(colony.defenses, id as DefenseId);
            const f: Feeding = tab === 'caste' ? feed : 'normal';
            const unitCost: Resources = fedCost(def.cost, f);
            const maxAfford = affordableCount(unitCost, colony.resources);
            const cap = tab === 'defense' ? defenseRoom(id as DefenseId, def.max, colony) : Infinity;
            const maxN = Math.min(maxAfford, cap, 100000);
            const raw = counts[id] ?? '';
            const n = Math.max(0, Math.floor(Number(raw) || 0));
            const per = unitSeconds(def.cost, { worldSpeed: state.world.speed, broodHall: Math.max(1, brood), timeMultiplier: state.player.timeMultiplier, research: state.player.research }) * feedingTimeFactor(f);
            // the server refuses with the same checks (shared/src/blockers.ts); affordability is explained here
            const blocker = broodBlocker(tab, id, def, n, colony, state.player);
            const blocked = blocker ? blocker.short : maxAfford < n ? whyShort(colony, scale(unitCost, n), state.world.speed) : n > maxN ? 'Over the limit' : '';
            const isOpen = !!open[id];
            return (
              <li key={id} className={`unit${missing.length ? ' locked' : ''}${isOpen ? ' open' : ''}`}>
                <button type="button" className="unit-head" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [id]: !o[id] }))}>
                  <Pic kind={tab === 'caste' ? 'unit' : 'defense'} id={id} />
                  <span className="unit-name">
                    <b>{def.name}</b>
                    <span className="muted small">
                      {fmtFull(have)} {tab === 'caste' ? 'home' : 'built'}
                      {queued[id] ? ` · ${fmtFull(queued[id])} queued` : ''}
                    </span>
                  </span>
                  <span className="unit-more" aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
                  <span className="sr-only">{isOpen ? 'Hide details' : 'Show details'}</span>
                </button>
                {isOpen && (
                  <div className="unit-details">
                    <p className="blurb">{def.blurb}</p>
                    <Stats id={id} def={def} />
                  </div>
                )}
                {missing.length || brood === 0 ? (
                  <p className="req">{blocked}</p>
                ) : (
                  <div className="unit-buy">
                    <span className="small muted">
                      Each <Cost cost={unitCost} /> · {fmtDuration(per * 1000)}
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
                      <button className="btn primary small" disabled={n < 1 || !!blocked}>
                        Raise
                      </button>
                    </form>
                    {n > 0 && !blocked && (
                      <span className="why">
                        Total <Cost cost={scale(unitCost, n)} have={colony.resources} /> · {fmtDuration(per * n * 1000)}
                      </span>
                    )}
                    {blocked && <span className="why">{blocked}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

/**
 * Larval digestion: ant larvae digest solid Protein and feed liquid food back to the workers (docs/03-economy.md).
 * Lives on the Brood Hall's chamber card in the nest.
 */
export function Digestion() {

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
    <div className="digest">
      <h3>
        Larval digestion <span className="muted small">{rate} Protein → 1 Nectar</span>
      </h3>
      <p className="small muted">
        Larvae turn spare Protein into Nectar while you're away: {fmtNum(perHour)} Protein an hour (more with a bigger Brood Hall).
      </p>
      {job ? (
        <div className="queue">
          <div className="queue-item">
            <span>
              {fmtFull(job.protein)} Protein → <strong>{fmtFull(digestDeliveredAt(job, now))}</strong>
              <span className="muted"> / {fmtFull(job.nectar)} Nectar</span>
            </span>
            <span className="muted small">
              done in <Countdown endAt={job.endAt} />
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
    </div>
  );
}
