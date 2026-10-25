// In-game battle preview: runs the same combat code as the server against your latest scout report.
import { useEffect, useMemo, useState } from 'react';
import { groupCargo, presentUnits, previewBattle, type Coords, type UnitCounts } from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtDuration, fmtNum } from '../format';

export function BattlePreview({ target, units }: { target: Coords; units: UnitCounts }) {
  const { state, now } = useGame();
  const [intel, setIntel] = useState<any>(undefined);

  useEffect(() => {
    let live = true;
    setIntel(undefined);
    const t = setTimeout(() => {
      api
        .get(`/api/intel?region=${target.region}&patch=${target.patch}&spot=${target.spot}`)
        .then((r) => live && setIntel(r.intel))
        .catch(() => live && setIntel(null));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [target.region, target.patch, target.spot]);

  const unitsKey = JSON.stringify(units);
  const preview = useMemo(() => {
    if (!intel || !state || presentUnits(units).length === 0) return null;
    const d = intel.data;
    return previewBattle(
      { units, research: state.player.research },
      { units: d.units ?? {}, defenses: d.defenses ?? {}, research: d.research ?? {} },
      { defenderResources: d.resources, protectedEach: d.protectedEach ?? 0, cargoOf: (u) => groupCargo(u) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intel, unitsKey, state?.player.research]);

  if (intel === undefined) return <div className="preview muted small">Checking your scout reports…</div>;
  if (intel === null)
    return (
      <div className="preview">
        <strong>No scout report on this colony.</strong>
        <p className="muted small">Scout it first to see your odds before you commit an army.</p>
      </div>
    );

  const d = intel.data;
  const unknown: string[] = [];
  if (!d.units) unknown.push('units');
  if (!d.defenses) unknown.push('defenses');
  if (!d.research) unknown.push('research bonuses');
  const age = now - intel.at;

  return (
    <div className="preview">
      <div className="preview-head">
        <strong>Battle preview</strong>
        <span className="muted small">from a scout report {fmtDuration(age)} old</span>
      </div>
      {!preview ? (
        <p className="muted small">Choose units to see your odds.</p>
      ) : (
        <>
          <div className="odds" role="img" aria-label={`Win ${Math.round(preview.winRate * 100)}%, draw ${Math.round(preview.drawRate * 100)}%, lose ${Math.round(preview.lossRate * 100)}%`}>
            <span className="win" style={{ flexGrow: preview.winRate }} />
            <span className="draw" style={{ flexGrow: preview.drawRate }} />
            <span className="loss" style={{ flexGrow: preview.lossRate }} />
          </div>
          <dl className="summary tight">
            <div><dt>Win</dt><dd>{Math.round(preview.winRate * 100)}%</dd></div>
            <div><dt>Draw</dt><dd>{Math.round(preview.drawRate * 100)}%</dd></div>
            <div><dt>Lose</dt><dd>{Math.round(preview.lossRate * 100)}%</dd></div>
            <div><dt>Your losses</dt><dd>~{fmtNum(preview.avgAttackerLossValue)}</dd></div>
            <div><dt>Their losses</dt><dd>~{fmtNum(preview.avgDefenderLossValue)}</dd></div>
            <div><dt>Loot if you win</dt><dd>~{fmtNum(preview.avgLootOnWin)}</dd></div>
          </dl>
          <p className="muted small">
            Based on {preview.runs} simulated battles.
            {unknown.length > 0 && ` Your scouts didn't see their ${unknown.join(', ')} — the real fight may be harder.`}
            {age > 3600_000 && ' This report is over an hour old; things may have changed.'}
          </p>
        </>
      )}
    </div>
  );
}
