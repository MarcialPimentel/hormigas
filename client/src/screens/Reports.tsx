import { useCallback, useEffect, useState } from 'react';
import { CASTES, CHAMBERS, DEFENSES, RESEARCH, RESOURCE_IDS } from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtClock, fmtCoords, fmtFull } from '../format';
import { RESOURCE_LABEL } from '../describe';
import { Empty, Panel, ResDot } from '../components/ui';
import { BattleReport } from '../components/BattleReport';

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

function ReportBody({ r }: { r: Report }) {
  const d = r.data;
  switch (r.type) {
    case 'scout':
      return (
        <div className="report-body">
          <p>
            {d.colony} ({fmtCoords(d.coords)}), owned by {d.owner}.{' '}
            {d.caught ? <strong className="warn">Your scouts were caught after reporting back what they saw.</strong> : null}
          </p>
          <h4>Resources</h4>
          <ResLine r={d.resources} />
          {d.protectedEach > 0 && <p className="muted small">About {fmtFull(d.protectedEach)} of each is protected in a Honeypot Gallery.</p>}
          <h4>Units at home</h4>
          {d.units ? <Counts counts={d.units} /> : <p className="muted small">Not seen. Send more Scouts or research Scent Reading.</p>}
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
    case 'relocate':
      return (
        <div className="report-body">
          <p>Arrived at {d.colony}.</p>
          <Counts counts={d.units} />
          <ResLine r={d.cargo} />
        </div>
      );
    case 'battle':
      return <BattleReport data={d} />;
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
          {d.lost && Object.keys(d.lost).length > 0 && (
            <>
              <h4>Lost</h4>
              <Counts counts={d.lost} />
            </>
          )}
        </div>
      );
    default:
      return <pre className="report-body small">{JSON.stringify(d, null, 2)}</pre>;
  }
}

export function Reports() {
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
        <Empty>No reports yet. Scout a neighbor or send a forage party to get your first one.</Empty>
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
                  <ReportBody r={r} />
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
