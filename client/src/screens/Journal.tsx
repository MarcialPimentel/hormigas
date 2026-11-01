// The Field Journal: a naturalist's notebook of what the colony has done and met (docs/26-come-back.md).
import { useEffect, useState } from 'react';
import { JOURNAL, JOURNAL_SECTIONS, stageName, type JournalEntryDef, type JournalSection } from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { Panel, Pic } from '../components/ui';
import type { PicKind } from '../art/icons';

interface EntryState {
  id: string;
  tier: number;
  value: number;
  next: number | null;
  fresh: boolean;
}

/** A picture for each page, from the game's own pictures. */
const PIC: Record<string, [PicKind, string]> = {
  pavement: ['unit', 'minor_soldier'], fire: ['unit', 'acid_sprayer'], carpenter: ['unit', 'major_soldier'], honeypot: ['chamber', 'honeypot_gallery'],
  trapjaw: ['unit', 'trap_jaw'], termite: ['unit', 'termite_soldier'], spider: ['unit', 'trapdoor_spider'],
  grasshopper: ['research', 'group_hunting'], fig: ['chamber', 'nectar_cellar'], branch: ['research', 'fungus_farming'], roster: ['unit', 'worker'],
  gardener: ['chamber', 'leaf_garden'], huntress: ['chamber', 'hunting_grounds'], shepherd: ['chamber', 'aphid_pasture'], excavator: ['chamber', 'excavation_works'],
  nurse: ['chamber', 'nursery'], naturalist: ['chamber', 'pheromone_chamber'], forager: ['unit', 'desert_ant'], provider: ['chamber', 'granary'],
  undertaker: ['unit', 'hauler'], pathfinder: ['unit', 'scout'], raider: ['unit', 'major_soldier'], swarmbreaker: ['unit', 'supermajor'],
  gatekeeper: ['defense', 'soil_wall'], claimer: ['unit', 'media_worker'], herder: ['research', 'aphid_husbandry'], founder: ['unit', 'winged_queen'],
  dutiful: ['chamber', 'queen_chamber'], fortunate: ['research', 'repletes'], peacemaker: ['research', 'chemical_mimicry'], supercolonist: ['research', 'supercolony'],
  boot: ['defense', 'pit_trap'], ambush: ['unit', 'spiderling'], rain: ['research', 'tandem_running'], shortcut: ['research', 'pheromone_trails'],
  lost: ['research', 'scent_reading'], lizard: ['unit', 'rhino_beetle'],
};

const STAGE_CLASS = ['blank', 'sketch', 'entry', 'plate'];

function Page({ e, s }: { e: JournalEntryDef; s: EntryState }) {
  const unwritten = e.hidden && s.tier === 0;
  // a one-stage page is complete once earned: it shows as a coloured plate
  const look = s.tier === 0 ? 0 : e.tiers.length === 1 ? 3 : s.tier;
  const pic = PIC[e.id];
  return (
    <li className={`page ${STAGE_CLASS[look]}${s.fresh ? ' fresh' : ''}`}>
      <div className="page-pic">{unwritten ? <span className="pic page-unknown">?</span> : pic ? <Pic kind={pic[0]} id={pic[1]} /> : <span className="pic" />}</div>
      <div className="page-text">
        <h3>
          {unwritten ? 'An unwritten page' : e.name}
          {s.fresh && <span className="badge-new">New</span>}
        </h3>
        {!unwritten && e.latin && <p className="latin">{e.latin}</p>}
        <p className="page-note">{unwritten ? 'Something odd has yet to happen to your ants.' : e.text}</p>
        <p className="page-meta small">
          {unwritten ? null : (
            <>
              <span className="stage">{stageName(e, s.tier)}</span>
              {e.tiers.length > 1 && s.next != null && (
                <span className="muted">
                  {' '}· {s.value.toLocaleString('en-US')} / {s.next.toLocaleString('en-US')} to the {['sketch', 'full entry', 'coloured plate'][s.tier]}
                </span>
              )}
              {s.tier > 0 && <span className="muted"> · title: “{e.title}”</span>}
            </>
          )}
        </p>
      </div>
    </li>
  );
}

export function Journal() {
  const { state, act, refresh } = useGame();
  const [data, setData] = useState<{ title: string | null; entries: EntryState[] } | null>(null);
  const load = () => api.get('/api/journal').then(setData).catch(() => {});

  useEffect(() => {
    // opening the journal marks its new pages as seen (they stay marked on this visit)
    load().then(() => api.post('/api/journal/seen').then(() => refresh()).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <p className="muted">Opening the journal…</p>;
  const byId = new Map(data.entries.map((e) => [e.id, e]));
  const earned = JOURNAL.filter((e) => (byId.get(e.id)?.tier ?? 0) >= 1);
  const visible = JOURNAL.filter((e) => !e.hidden || (byId.get(e.id)?.tier ?? 0) > 0);
  const written = earned.length;
  const current = JOURNAL.find((e) => e.title === (data.title ?? state?.journal?.title));

  return (
    <div className="stack journal">
      <Panel title="Field Journal">
        <p className="muted">
          A naturalist's notebook of your colony. Pages fill in as your ants work: a sketch first, then the full entry, then the coloured plate. Counts are across all your colonies.
        </p>
        <div className="journal-title">
          <label htmlFor="title-pick">Title shown beside your name</label>
          <select
            id="title-pick"
            value={current?.id ?? ''}
            onChange={(ev) =>
              act(async () => {
                const r = await api.post('/api/journal/title', { entryId: ev.target.value || null });
                await load();
                return r;
              }, ev.target.value ? 'Title chosen.' : 'Title removed.')
            }
          >
            <option value="">No title</option>
            {earned.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <span className="muted small">
            {written} of {JOURNAL.length} pages started{visible.length < JOURNAL.length ? `, ${JOURNAL.length - visible.length} still hidden` : ''}
          </span>
        </div>
      </Panel>
      {(Object.keys(JOURNAL_SECTIONS) as JournalSection[]).map((section) => (
        <Panel key={section} title={JOURNAL_SECTIONS[section]}>
          <ul className="pages">
            {JOURNAL.filter((e) => e.section === section).map((e) => (
              <Page key={e.id} e={e} s={byId.get(e.id) ?? { id: e.id, tier: 0, value: 0, next: e.tiers[0], fresh: false }} />
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
