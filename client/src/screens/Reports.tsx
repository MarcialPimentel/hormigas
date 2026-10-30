import { useCallback, useEffect, useState } from 'react';
import { CASTES, CHAMBERS, DEFENSES, RESEARCH, RESOURCE_IDS } from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtClock, fmtCoords, fmtFull } from '../format';
import { RESOURCE_LABEL } from '../describe';
import { Empty, Panel, ResDot } from '../components/ui';
import type { Nav } from '../nav';
import { BattleReport } from '../components/BattleReport';
import { ForageOdds } from '../components/ForageOdds';

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

export function ResLine({ r }: { r?: Record<string, number> }) {
  if (!r) return null;
  return (
    <span className="cost">
      {RESOURCE_IDS.map((k) => (
        <span key={k} className="cost-item" title={RESOURCE_LABEL[k]}>
          <ResDot r={k} />
          {fmtFull(r[k] ?? 0)}
        </span>
      ))}
    </span>
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

function ReportBody({ r, go }: { r: Report; go?: Nav }) {
  const d = r.data;
  switch (r.type) {
    case 'scout':
      if (d.wilds) return <WildsReport d={d} />;
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
            {fmtFull(d.nectarPerHour)} Nectar an hour, carried home every {d.deliverEveryHours} hours. Anyone can raid the tenders to take it; call them home
            from the herd's card on the Missions tab.
          </p>
          <h4>Tenders now</h4>
          <Counts counts={d.tenders} />
        </div>
      );
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
                ? <>On the way home, arriving {fmtClock(d.returnsAt)}.{d.found && RESOURCE_IDS.some((k) => d.found[k] > 0) ? ' The food lands in your stores then.' : ''}</>
                : <>Got home {fmtClock(d.returnsAt)}.</>}
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
      return (
        <div className="report-body">
          <p>{d.text}</p>
          {d.found && RESOURCE_IDS.some((k) => d.found[k] > 0) && (
            <p>
              Added to your stores: <ResLine r={d.found} />
            </p>
          )}
        </div>
      );
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
