import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtFull } from '../format';
import { Panel } from '../components/ui';

const KINDS = [
  { id: 'total', label: 'Overall' },
  { id: 'economy', label: 'Economy' },
  { id: 'research', label: 'Research' },
  { id: 'military', label: 'Military' },
];

export function Rankings() {
  const [kind, setKind] = useState('total');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let live = true;
    api.get(`/api/rankings?kind=${kind}&page=${page}`).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [kind, page]);

  return (
    <Panel title="Rankings" actions={data?.myRank ? <span className="muted">You are #{fmtFull(data.myRank)}</span> : undefined}>
      <div className="seg" role="radiogroup" aria-label="Ranking">
        {KINDS.map((k) => (
          <button key={k.id} role="radio" aria-checked={kind === k.id} className={kind === k.id ? 'on' : ''} onClick={() => { setKind(k.id); setPage(1); }}>
            {k.label}
          </button>
        ))}
      </div>
      {!data ? (
        <p className="muted">Counting ants…</p>
      ) : (
        <>
          <table className="table ranks">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Colonies</th>
                <th scope="col">Points</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.playerId} className={r.me ? 'me' : ''}>
                  <td>{r.rank}</td>
                  <td>
                    {r.username}
                    {r.inactive && <span className="muted small"> · inactive</span>}
                  </td>
                  <td>{r.colonies}</td>
                  <td>{fmtFull(r.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.pages > 1 && (
            <div className="pager">
              <button className="btn ghost small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="muted small">Page {page} of {data.pages}</span>
              <button className="btn ghost small" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
          <p className="muted small">1 point for every 1,000 resources spent on chambers, research, castes and defenses. Updated every minute.</p>
        </>
      )}
    </Panel>
  );
}
