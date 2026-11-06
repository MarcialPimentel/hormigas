import { useCallback, useEffect, useState } from 'react';
import { CASTES, CHAMBERS, DEFENSES, RESEARCH, RESOURCE_IDS, type Relation } from '@hormigas/shared';

/** "Because of …": why a pact partner's scouts are let be (docs/23-supercolonies.md). */
const PACT_PHRASE: Record<Relation, string> = { truce: 'your truce', truce_ending: 'your truce (still in its notice)', ally: 'your shared supercolony scent', fading: 'your shared scent (still fading)' };
import { api } from '../api';
import { useGame } from '../game';
import { fmtClock, fmtCoords, fmtDuration, fmtFull, fmtHours } from '../format';
import { RESOURCE_LABEL } from '../describe';
import { Empty, Panel, ResDot } from '../components/ui';
import type { Nav } from '../nav';
import { BattleReport } from '../components/BattleReport';
import { ForageOdds } from '../components/ForageOdds';
import { swarmMakeUp } from '../components/SwarmIntel';

interface Report {
  id: number;
  type: string;
  title: string;
  data: any;
  createdAt: number;
  read: boolean;
}

const NAME = (id: string): string =>
  (CASTES as any)[id]?.name ?? (DEFENSES as any)[id]?.name ?? (CHAMBERS as any)[id]?.name ?? (RESEARCH as any)[id]?.name ?? id;

export function Counts({ counts, empty = 'None' }: { counts?: Record<string, number>; empty?: string }) {
  const rows = Object.entries(counts ?? {}).filter(([, n]) => n > 0);
  if (rows.length === 0) return <span className="muted">{empty}</span>;
  return (
    <ul className="counts">
      {rows.map(([k, n]) => (
        <li key={k}>
          <span>{NAME(k)}</span>
          <strong>{fmtFull(n)}</strong>
        </li>
      ))}
    </ul>
  );
}

export function ResLine({ r, hideZero }: { r?: Record<string, number>; hideZero?: boolean }) {
  if (!r) return null;
  return (
    <span className="cost">
      {RESOURCE_IDS.filter((k) => !hideZero || (r[k] ?? 0) !== 0).map((k) => (
        <span key={k} className="cost-item" title={RESOURCE_LABEL[k]}>
          <ResDot r={k} />
          {fmtFull(r[k] ?? 0)}
        </span>
      ))}
    </span>
  );
}

/** Something small that happened in one of your colonies. Older reports only saved the colony's id. */
function NestEventReport({ d }: { d: any }) {
  const { state } = useGame();
  const known = state?.colonies.find((c) => c.id === d.colonyId);
  const name = d.colony ?? known?.name;
  const coords = d.coords ?? known?.coords;
  const gifted = d.found && RESOURCE_IDS.some((k) => d.found[k] > 0);
  return (
    <div className="report-body">
      {name && (
        <p className="muted small">
          In {name}
          {coords ? ` (${fmtCoords(coords)})` : ''}
        </p>
      )}
      <p>{d.text}</p>
      {gifted && (
        <p>
          Added to {name ? `${name}'s` : 'your'} stores: <ResLine r={d.found} hideZero />
          {d.full && <span className="muted small"> (the stores were nearly full, so that's all that fit)</span>}
        </p>
      )}
    </div>
  );
}

/** A Scout's survey of a patch's wilds. */
function WildsReport({ d }: { d: any }) {
  const { state } = useGame();
  const luck = state?.player.research.foraging_instinct ?? 0;
  return (
    <div className="report-body">
      <p>{d.text}</p>
      <h4>Foraging here</h4>
      <ForageOdds luck={luck} compact />
      <p className="muted small">A party can bring home up to {fmtFull(d.findCap)} resources, if it can carry them.</p>
      <h4>The patch</h4>
      <p>
        {d.colonies === 0
          ? 'No other colonies live in this patch yet.'
          : `${d.colonies} other ${d.colonies === 1 ? 'colony lives' : 'colonies live'} in this patch${d.inactive ? `, ${d.inactive} of them inactive` : ''}.`}{' '}
        {d.corpses > 0 ? `About ${fmtFull(d.corpses)} Protein in corpses is lying around, ready to haul.` : 'No corpses lying around.'}
      </p>
    </div>
  );
}

/** Windfalls (docs/25-windfalls.md): one dropped nearby, your ants took one, or one ran out. */
function WindfallReport({ d, go }: { d: any; go?: Nav }) {
  const { now } = useGame();
  const show = go && d.coords ? () => go('missions', { view: { region: d.coords.region, patch: d.coords.patch } }) : undefined;
  const mapButton = show && (
    <button className="btn small" onClick={show}>
      Show on the map
    </button>
  );
  if (d.turnedBack) return <p className="report-body">{d.why} Your ants are walking home.</p>;
  if (d.event === 'windfall')
    return (
      <div className="report-body">
        <p>{d.text}</p>
        <p>
          It holds <ResLine r={d.pile} /> and rots {d.endsAt > now ? `in ${fmtDuration(d.endsAt - now)}` : 'soon'}.{' '}
          {d.guarded ? 'Wild ants are already on it: bring soldiers.' : 'Nobody holds it yet.'} Send ants to claim it from its card in the wilds, at{' '}
          {fmtCoords(d.coords)}.
        </p>
        {mapButton}
      </div>
    );
  if (d.event === 'windfall_held')
    return (
      <div className="report-body">
        <p>
          {d.claimed ? `Your ants from ${d.colony} hold the ${String(d.windfall).toLowerCase()} (${fmtCoords(d.coords)}).` : `More of your ants joined the others at the ${String(d.windfall).toLowerCase()}.`}{' '}
          They carry up to {fmtFull(d.carryPerLoad)} home every {fmtHours(d.deliverEveryHours)}
          {d.loadCutPct ? ` (${d.loadCutPct}% sooner: Recruitment Trails)` : ''} until it's gone or rots. Anyone can fight them for it; call them home from its card.
        </p>
        <h4>Left on it</h4>
        <ResLine r={d.left} />
        <h4>Holding it now</h4>
        <Counts counts={d.holders} />
        {mapButton}
      </div>
    );
  return (
    <div className="report-body">
      <p>
        {d.done === 'rotted'
          ? `The ${String(d.windfall).toLowerCase()} rotted away. Your ants are bringing home one last load:`
          : `Nothing is left of the ${String(d.windfall).toLowerCase()}. The last load is in your stores and your ants are walking home:`}
      </p>
      <ResLine r={d.carried ?? d.delivered} />
    </div>
  );
}

/** Scouts sent out to meet an army-ant swarm heading for your colony (docs/20-swarms.md § Scouting the swarm). */
function SwarmScoutReport({ d }: { d: any }) {
  const s = d.swarm;
  const lost = d.lost ? ` Army ants ate ${fmtFull(d.lost)} of the ${fmtFull(d.scouts)} you sent.` : '';
  if (s.gone) return <div className="report-body"><p>By the time your scouts got out, the swarm had already reached {s.colony}. They came home.</p></div>;
  if (!s.units)
    return (
      <div className="report-body">
        <p>
          None of your {fmtFull(d.scouts)} {d.scouts === 1 ? 'scout' : 'scouts'} came back from the army ant column heading for {s.colony}. You still don't know how big it is.
        </p>
        <p className="muted small">Send more Scouts to try again before it lands at {fmtClock(s.arriveAt)}. Scent Reading and Chemical Mimicry help them slip past.</p>
      </div>
    );
  const n = Object.values(s.units as Record<string, number>).reduce((a, b) => a + b, 0);
  return (
    <div className="report-body">
      <p>
        Your scouts got close to the column heading for {s.colony} ({fmtCoords(s.coords)}):{' '}
        {s.sizeName ? <>a <strong>{s.sizeName.toLowerCase()}</strong> ({s.sizeBlurb}) of </> : null}
        <strong>{fmtFull(n)} army ants</strong>, {swarmMakeUp(s.units)}. It lands at{' '}
        {fmtClock(s.arriveAt)}.{lost}
      </p>
      <p className="muted small">Its size and your live odds against it are on its card under Under way. They change as you raise soldiers or send them away.</p>
    </div>
  );
}

/** Trade trails (docs/23-supercolonies.md § Trade trails): opened, turned back or closed, for the sender or the host. */
function TradeReport({ d }: { d: any }) {
  // how often, at this world's speed (older reports only kept the hours at speed 1)
  const every = d.everyMs ? fmtDuration(d.everyMs) : `${d.everyHours} hours`;
  const days = d.everyMs ? fmtDuration(d.everyMs * d.deliveries) : `${(d.deliveries * d.everyHours) / 24} days`;
  const kind = d.kind === 'own' ? 'between your colonies' : d.kind === 'ally' ? 'with a supercolony mate' : 'under your truce';
  if (d.turnedBack) return <p className="report-body">Your caravan turned back from {d.colony ?? 'the trail'}: {d.why} It is walking home.</p>;
  if (d.opened && d.host)
    return (
      <div className="report-body">
        <p>
          {d.from}'s caravan from {d.fromColony} keeps a trail open to {d.colony} for {days}. Both sides gain: every {every} you get {d.goods} from their ground, about <ResLine r={d.partnerPerDelivery} hideZero /> a time. Your colony gives nothing up.
        </p>
      </div>
    );
  if (d.opened)
    return (
      <div className="report-body">
        <p>
          Your caravan from {d.from} keeps a trail open to {d.colony} ({kind}). Every {every} it brings home {d.goods}, about{' '}
          <ResLine r={d.perDelivery} hideZero /> a time, {d.deliveries} times{d.extraDays ? ` (${d.extraDays} ${d.extraDays === 1 ? 'day' : 'days'} longer: Trophallaxis)` : ''}. Then it walks home and you can open the trail again.
        </p>
        {d.units && <Counts counts={d.units} />}
      </div>
    );
  const why = d.closed === 'pact_ended' ? 'Your pact ended, so the trail closed early.' : d.closed === 'gone' ? 'The colony was gone.' : 'It ran its full course.';
  if (d.host)
    return (
      <p className="report-body">
        {d.from}'s trade trail to {d.colony} has closed. {why} Over {d.deliveries} {d.deliveries === 1 ? 'delivery' : 'deliveries'} it brought you{' '}
        <ResLine r={d.partnerGot} hideZero />, and your colony gave nothing up.
      </p>
    );
  return (
    <div className="report-body">
      <p>
        {why} Over {d.deliveries} {d.deliveries === 1 ? 'delivery' : 'deliveries'} it brought home <ResLine r={d.delivered} hideZero />
        {d.kind !== 'own' && d.partnerGot ? <> and gave your partner <ResLine r={d.partnerGot} hideZero /></> : null}. The caravan is walking home; send it out again from Missions to renew the trail.
      </p>
    </div>
  );
}

/** Joint raid news (docs/23-supercolonies.md § Joint raids): one opened, called off by its opener, or called off at landing. */
function JointReport({ d, go }: { d: any; go?: Nav }) {
  if (d.opened)
    return (
      <div className="report-body">
        <p>
          {d.leader} opened a joint raid on {d.colony} ({fmtCoords(d.target)}). It lands at <strong>{fmtClock(d.landAt)}</strong>: send an army that can get there
          by then and it fights beside theirs. {d.playersNeeded > 1 ? `It needs at least ${d.playersNeeded} players. ` : ''}Loot is split by each army's worth.
        </p>
        {go && d.target && (
          <p>
            <button type="button" className="btn small primary" onClick={() => go('missions', { type: 'raid', target: d.target })}>
              Join the joint raid
            </button>
          </p>
        )}
      </div>
    );
  if (d.calledOff)
    return (
      <p className="report-body">
        {d.why} Nobody fought; your army is walking home{d.returnAt ? `, back at ${fmtClock(d.returnAt)}` : ''}.
      </p>
    );
  return <p className="report-body">The joint raid on {d.colony} was called off before it landed. Your army is walking home{d.returnAt ? `, back at ${fmtClock(d.returnAt)}` : ''}.</p>;
}

function ReportBody({ r, go }: { r: Report; go?: Nav }) {
  const d = r.data;
  switch (r.type) {
    case 'scout':
      if (d.wilds) return <WildsReport d={d} />;
      if (d.swarm) return <SwarmScoutReport d={d} />;
      return (
        <div className="report-body">
          <p>
            {d.herd ? (
              <>
                {d.colony} ({fmtCoords(d.coords)}): aphids that make {fmtFull(d.herd.nectarPerHour)} Nectar an hour while tended.{' '}
                {d.herd.tended ? `${d.herd.tenderName}'s ants tend it: raid them to take it over.` : 'Nobody tends it: send ants to tend it.'}{' '}
                <span className="muted">{d.herd.style}</span>{' '}
              </>
            ) : d.wild?.kind === 'mound' ? (
              <>
                {d.colony} ({fmtCoords(d.coords)}), a tier {d.wild.level} termite mound. <span className="muted">{d.wild.style}</span>{' '}
              </>
            ) : d.wild?.kind === 'den' ? (
              <>
                {d.colony} ({fmtCoords(d.coords)}), the lair of a {d.owner} (tier {d.wild.level}). <span className="muted">{d.wild.style}</span>{' '}
              </>
            ) : d.wild ? (
              <>
                {d.colony} ({fmtCoords(d.coords)}), a level {d.wild.level} nest of wild {d.owner}. <span className="muted">{d.wild.style}</span>{' '}
              </>
            ) : (
              <>{d.colony} ({fmtCoords(d.coords)}), owned by {d.owner}.{' '}</>
            )}
            {d.caught ? <strong className="warn">Your scouts were caught after reporting back what they saw.</strong> : null}
            {d.pact ? <span className="muted">Because of {PACT_PHRASE[d.pact as Relation]}, they let your scouts go home safely, and they know you looked.</span> : null}
          </p>
          {d.raidArrivesAt ? (
            <p className="warn small">Your raid hadn't arrived yet when your scouts looked (it lands at {fmtClock(d.raidArrivesAt)}). Scouts are faster than soldiers, so this is the colony before the fight.</p>
          ) : null}
          {d.wild && d.regrowMs ? (
            <p className="muted small">
              {d.wild.kind === 'mound' ? 'Termite mounds regrow' : d.wild.kind === 'den' ? 'The spider and her young recover' : 'Wild nests regrow their soldiers and food'} to full within {regrowText(d.regrowMs)} of a raid.
            </p>
          ) : null}
          <h4>Resources</h4>
          <ResLine r={d.resources} />
          {d.protectedEach > 0 && <p className="muted small">About {fmtFull(d.protectedEach)} of each is protected in a Honeypot Gallery.</p>}
          <h4>{d.herd ? 'Tenders' : 'Units at home'}</h4>
          {d.units ? <Counts counts={d.units} /> : <p className="muted small">Not seen. Send more Scouts or research Scent Reading.</p>}
          {d.garrison && (
            <>
              <h4>Allied soldiers holding position</h4>
              <Counts counts={d.garrison} />
              <p className="muted small">They belong to a supercolony mate and fight beside the colony's own.</p>
            </>
          )}
          <h4>Defenses</h4>
          {d.defenses ? <Counts counts={d.defenses} /> : <p className="muted small">Not seen.</p>}
          {d.chambers && (
            <>
              <h4>Chambers</h4>
              <Counts counts={d.chambers} />
              <h4>Research</h4>
              <Counts counts={d.research} />
            </>
          )}
        </div>
      );
    case 'scouted':
      return (
        <p className="report-body">
          {d.scouts} {d.scouts === 1 ? 'scout' : 'scouts'} from {d.from} ({fmtCoords(d.origin)}) {d.caught ? 'were caught and killed near' : 'looked over'} {d.colony}.
          {d.pact ? ` Because of ${PACT_PHRASE[d.pact as Relation]}, your ants let them look and go home.` : ''}
        </p>
      );
    case 'transport':
      return (
        <p className="report-body">
          {d.from ? `${d.from} sent` : 'Delivered'} to {d.colony}: <ResLine r={d.delivered} />
        </p>
      );
    case 'colonize':
      return d.founded ? (
        <div className="report-body">
          <p>
            Your Winged Queen landed at {fmtCoords(d.target)} ({d.terrain}), shed her wings and dug the first chamber of <strong>{d.name}</strong>. Switch to it from the colony picker at the top.
          </p>
          {d.units && Object.keys(d.units).length > 0 && (
            <>
              <h4>Escorts who stayed</h4>
              <Counts counts={d.units} />
            </>
          )}
          {d.cargo && <ResLine r={d.cargo} />}
        </div>
      ) : (
        <p className="report-body">She turned back from {fmtCoords(d.target)}: {d.why} She is flying home with everyone.</p>
      );
    case 'relocate':
      return (
        <div className="report-body">
          <p>Arrived at {d.colony}.</p>
          <Counts counts={d.units} />
          <ResLine r={d.cargo} />
        </div>
      );
    case 'battle':
      return <BattleReport data={d} onReplay={go && d.rounds?.length && d.target ? () => go('missions', { view: { region: d.target.region, patch: d.target.patch }, replay: d }) : undefined} />;
    case 'herd':
      return d.turnedBack ? (
        <p className="report-body">Your tenders turned back from {d.herd} ({fmtCoords(d.coords)}): {d.why} They are walking home.</p>
      ) : (
        <div className="report-body">
          <p>
            {d.claimed ? `Your ants from ${d.colony} now tend ${d.herd} (${fmtCoords(d.coords)}).` : `More of your ants joined the tenders at ${d.herd}.`} It makes{' '}
            {fmtFull(d.nectarPerHour)} Nectar an hour, carried home every {d.deliverEveryHours} hours{d.bonusPct ? `, and your Aphid Husbandry adds ${d.bonusPct}% to each delivery` : ''}. Anyone can raid the tenders to take it; call them home
            from the herd's card on the Missions tab.
          </p>
          <h4>Tenders now</h4>
          <Counts counts={d.tenders} />
        </div>
      );
    case 'windfall':
      return <WindfallReport d={d} go={go} />;
    case 'trade':
      return <TradeReport d={d} />;
    case 'joint':
      return <JointReport d={d} go={go} />;
    case 'hold':
      return (
        <div className="report-body">
          {d.turnedBack ? (
            <p>You no longer share a scent with {d.colony}, so your soldiers are coming home.</p>
          ) : d.from ? (
            <p>{d.from}'s soldiers will fight beside yours at {d.colony} until they are called home.</p>
          ) : (
            <p>Your soldiers will fight in every battle at {d.colony} until you recall them from Missions.</p>
          )}
          {d.units && <Counts counts={d.units} />}
        </div>
      );
    case 'diplomacy':
      return <p className="report-body">{diplomacyText(d)}</p>;
    case 'milestone':
      return <p className="report-body milestone-text">{d.text}</p>;
    case 'haul':
      return (
        <p className="report-body">
          {d.collected > 0 ? <>Your haulers collected <strong>{fmtFull(d.collected)}</strong> Protein from {fmtCoords(d.target)}.</> : <>Nothing left to haul at {fmtCoords(d.target)}.</>}
        </p>
      );
    case 'forage':
      return (
        <div className="report-body">
          <p>{d.text}</p>
          {d.found && RESOURCE_IDS.some((k) => d.found[k] > 0) && (
            <p>
              Found: <ResLine r={d.found} />
            </p>
          )}
          {d.returnsAt != null && (
            <p className="muted small">
              {d.returnsAt > Date.now()
                ? <>On the way home{d.colony ? <> to <strong>{d.colony}</strong></> : ''}, arriving {fmtClock(d.returnsAt)}.{d.found && RESOURCE_IDS.some((k) => d.found[k] > 0) ? ` The food lands in ${d.colony ? `${d.colony}'s` : 'your'} stores then.` : ''}</>
                : <>Got home{d.colony ? <> to <strong>{d.colony}</strong></> : ''} at {fmtClock(d.returnsAt)}.</>}
            </p>
          )}
          {d.lost && Object.keys(d.lost).length > 0 && (
            <>
              <h4>Lost</h4>
              <Counts counts={d.lost} />
            </>
          )}
        </div>
      );
    case 'nest_event':
      return <NestEventReport d={d} />;
    default:
      return <pre className="report-body small">{JSON.stringify(d, null, 2)}</pre>;
  }
}

export function Reports({ go }: { go?: Nav }) {
  const { refresh } = useGame();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => api.get('/api/reports').then((r) => setReports(r.reports)), []);
  useEffect(() => {
    load();
  }, [load]);

  async function openReport(r: Report) {
    setOpen(open === r.id ? null : r.id);
    if (!r.read) {
      await api.post('/api/reports/read', { ids: [r.id] });
      setReports((rs) => rs?.map((x) => (x.id === r.id ? { ...x, read: true } : x)) ?? null);
      refresh();
    }
  }

  return (
    <Panel
      title="Reports"
      actions={
        <span className="row-actions">
          <button className="btn ghost small" onClick={async () => { await api.post('/api/reports/read', {}); await load(); refresh(); }}>
            Mark all read
          </button>
        </span>
      }
    >
      {!reports ? (
        <p className="muted">Loading…</p>
      ) : reports.length === 0 ? (
        <Empty>No reports yet. Send a Scout or a forage party to get your first one.</Empty>
      ) : (
        <ul className="reports">
          {reports.map((r) => (
            <li key={r.id} className={`${r.read ? '' : 'unread'} type-${r.type}`}>
              <button className="report-head" aria-expanded={open === r.id} onClick={() => openReport(r)}>
                <span className="report-title">{r.title}</span>
                <span className="muted small">{fmtClock(r.createdAt)}</span>
              </button>
              {open === r.id && (
                <div className="report-open">
                  <ReportBody r={r} go={go} />
                  <button
                    className="btn ghost small"
                    onClick={async () => {
                      await api.post('/api/reports/delete', { ids: [r.id] });
                      setReports((rs) => rs?.filter((x) => x.id !== r.id) ?? null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** One line explaining a truce or supercolony report (docs/23-supercolonies.md). */
function diplomacyText(d: any): string {
  const until = (t?: number) => (t ? fmtClock(t) : 'then');
  switch (d.event) {
    case 'truce_offered': return `${d.with} offers a truce: neither of you raids the other. Answer it on the Allies screen.`;
    case 'truce_active': return `You and ${d.with} have a truce. Neither of you can raid the other until one side gives notice and it runs out.`;
    case 'truce_declined': return `${d.with} turned down your truce.`;
    case 'truce_ending': return `Notice has been given. Raids between you and ${d.with} stay off until ${until(d.endsAt)}.`;
    case 'truce_ended': return `The truce with ${d.with} is over. You can raid each other again.`;
    case 'founded': return `Your colonies now carry the scent of ${d.supercolony}. Invite players you've met from the Allies screen.`;
    case 'invited': return `${d.with} invites you to share the scent of ${d.supercolony}. Answer it on the Allies screen.`;
    case 'joined': return d.with ? `${d.with} now shares the scent of ${d.supercolony}.` : `Your colonies now carry the scent of ${d.supercolony}. Members never raid each other and can send soldiers to hold position at each other's nests.`;
    case 'left':
    case 'removed': return `The ${d.supercolony} scent is fading from ${d.with}'s colonies. Raids between them and the supercolony stay off until ${until(d.fadeUntil)}. Soldiers holding position on either side are walking home.`;
    case 'faded': return `${d.with} and ${d.supercolony} no longer share a scent. They can raid each other again.`;
    default: return '';
  }
}

/** "a day", "2 days" or "5 hours": how long a wild nest takes to regrow. */
function regrowText(ms: number) {
  const h = Math.round(ms / 3600_000);
  if (h >= 24 && h % 24 === 0) return h === 24 ? 'a day' : `${h / 24} days`;
  return h <= 1 ? 'an hour' : `${h} hours`;
}
