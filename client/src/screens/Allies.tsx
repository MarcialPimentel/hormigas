// Allies: truces and supercolonies with the players you've met (docs/23-supercolonies.md).
import { useCallback, useEffect, useState } from 'react';
import { SUPERCOLONY_MAX_MEMBERS, SUPERCOLONY_NAME_LENGTH, scentFadeMs, supercolonyNameProblem, truceNoticeMs, RELATION_NAMES, type RelationInfo } from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtCoords, fmtNum, fmtSpan } from '../format';
import { Countdown, Empty, Panel } from '../components/ui';
import type { Nav } from '../nav';

interface Member {
  playerId: number;
  username: string;
  points: number;
  status: 'member' | 'fading';
  fadeUntil: number | null;
  founder: boolean;
  me: boolean;
  colonies: { id: number; name: string; coords: { region: number; patch: number; spot: number } }[];
}
interface Truce { id: number; status: 'proposed' | 'active' | 'ending'; otherId: number; username: string; proposedByMe: boolean; endsAt: number | null }
interface Contact { playerId: number; username: string; points: number; supercolony: string | null; relation: RelationInfo | null; truce: Truce | null; invited: boolean }
interface View {
  canFound: boolean;
  supercolony: null | { id: number; name: string; founderId: number; myStatus: 'member' | 'fading'; myFadeUntil: number | null; members: Member[]; invited: { playerId: number; username: string }[] };
  invitesForMe: { supercolonyId: number; name: string; from: string; seats: number }[];
  truces: Truce[];
  contacts: Contact[];
}

export function Allies({ go }: { go: Nav }) {
  const { state, act } = useGame();
  const [view, setView] = useState<View | null>(null);
  const load = useCallback(() => api.get<View>('/api/diplomacy').then(setView).catch(() => {}), []);
  // reload whenever the game state changes (a report or answer arrived)
  useEffect(() => {
    load();
  }, [load, state?.serverNow]);
  if (!state || !view) return <Panel title="Allies"><p className="muted">Loading…</p></Panel>;

  const speed = state.world.speed;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (await act(fn, ok)) await load();
  };
  const sc = view.supercolony;
  const member = sc?.myStatus === 'member';
  const seatsLeft = sc ? SUPERCOLONY_MAX_MEMBERS - sc.members.length : 0;

  return (
    <div className="stack allies">
      <Panel title="How it works">
        <ol className="ladder small">
          <li><strong>Meet.</strong> Scout one of a player's colonies, or be scouted by them. Then you can deal with each other.</li>
          <li><strong>Truce.</strong> Neither of you raids the other. Either side can end it with {fmtSpan(truceNoticeMs(speed))} notice; raids stay off until it runs out.</li>
          <li><strong>Supercolony.</strong> Up to {SUPERCOLONY_MAX_MEMBERS} players share one scent: no raiding each other, and soldiers can hold position at a mate's nest. Leaving takes {fmtSpan(scentFadeMs(speed))} for the scent to fade, so nobody can turn on their friends overnight.</li>
        </ol>
      </Panel>

      {sc ? (
        <Panel title={<>Supercolony: {sc.name}</>} actions={<span className="muted small">{sc.members.length}/{SUPERCOLONY_MAX_MEMBERS} players</span>}>
          {!member && (
            <p className="warn small">
              You left. The {sc.name} scent fades from your colonies in <Countdown endAt={sc.myFadeUntil!} />. Until then, raids between you and its members stay off.
            </p>
          )}
          <ul className="members">
            {sc.members.map((m) => (
              <li key={m.playerId} className={m.status}>
                <div>
                  <strong>{m.username}</strong> {m.founder && <span className="sc-tag">Founder</span>} {m.me && <span className="muted small">(you)</span>}
                  <span className="muted small"> · {fmtNum(m.points)} pts</span>
                  {m.status === 'fading' && (
                    <span className="pact-tag fading">
                      Leaving · scent fades in <Countdown endAt={m.fadeUntil!} />
                    </span>
                  )}
                  <div className="member-colonies small">
                    {m.colonies.map((c) => (
                      <button
                        key={c.id}
                        className="linkish"
                        onClick={() => go('missions', { target: c.coords, type: !m.me && member && m.status === 'member' ? 'hold' : undefined })}
                      >
                        {c.name} ({fmtCoords(c.coords)})
                      </button>
                    ))}
                  </div>
                </div>
                <div className="row-actions">
                  {member && sc.founderId === state.player.id && !m.me && m.status === 'member' && (
                    <button
                      className="btn ghost small"
                      onClick={() =>
                        confirm(`Remove ${m.username}? Their scent fades over ${fmtSpan(scentFadeMs(speed))}; raids between you stay off until then.`) &&
                        run(() => api.post('/api/supercolony/remove', { playerId: m.playerId }), `${m.username} is leaving ${sc.name}.`)
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {sc.invited.length > 0 && (
            <>
              <h4>Invited</h4>
              <ul className="members">
                {sc.invited.map((i) => (
                  <li key={i.playerId}>
                    <span>{i.username}</span>
                    {member && (
                      <button className="btn ghost small" onClick={() => run(() => api.post('/api/supercolony/invite/withdraw', { playerId: i.playerId }), 'Invitation withdrawn.')}>
                        Withdraw
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {member && (
            <>
              <p className="muted small">
                Tap a mate's colony to send soldiers to hold position there. Invite players you've met from the list below{seatsLeft > 0 ? '' : ' once a seat is free'}.
              </p>
              <button
                className="btn ghost small"
                onClick={() =>
                  confirm(`Leave ${sc.name}? The shared scent fades over ${fmtSpan(scentFadeMs(speed))}. Your soldiers holding position, and theirs at your nests, come home now.`) &&
                  run(() => api.post('/api/supercolony/leave'), `You are leaving ${sc.name}.`)
                }
              >
                Leave supercolony
              </button>
            </>
          )}
        </Panel>
      ) : (
        <FoundPanel canFound={view.canFound} onFound={(name) => run(() => api.post('/api/supercolony', { name }), `${name} founded.`)} goResearch={() => go('research')} />
      )}

      {view.invitesForMe.length > 0 && (
        <Panel title="Invitations">
          <ul className="members">
            {view.invitesForMe.map((i) => (
              <li key={i.supercolonyId}>
                <div>
                  <strong>{i.name}</strong>
                  <span className="muted small"> · invited by {i.from} · {i.seats}/{SUPERCOLONY_MAX_MEMBERS} players</span>
                  {!view.canFound && <p className="why small">Joining needs the Supercolony research (Nest branch).</p>}
                </div>
                <div className="row-actions">
                  <button className="btn small primary" disabled={!view.canFound || !!sc} onClick={() => run(() => api.post(`/api/supercolony/${i.supercolonyId}/accept`), `You joined ${i.name}.`)}>
                    Join
                  </button>
                  <button className="btn ghost small" onClick={() => run(() => api.post(`/api/supercolony/${i.supercolonyId}/decline`), 'Invitation declined.')}>
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Truces">
        {view.truces.length === 0 ? (
          <Empty>No truces. Offer one to a player you've met, below.</Empty>
        ) : (
          <ul className="members">
            {view.truces.map((t) => (
              <li key={t.id}>
                <div>
                  <strong>{t.username}</strong>{' '}
                  <span className="muted small">
                    {t.status === 'active' ? '· truce' : t.status === 'ending' ? '· truce ending, raids stay off for ' : t.proposedByMe ? '· your offer, waiting for an answer' : '· offers you a truce'}
                  </span>
                  {t.status === 'ending' && t.endsAt && <Countdown endAt={t.endsAt} />}
                </div>
                <div className="row-actions">
                  {t.status === 'proposed' && !t.proposedByMe && (
                    <>
                      <button className="btn small primary" onClick={() => run(() => api.post(`/api/truces/${t.id}/accept`), `Truce with ${t.username}.`)}>Accept</button>
                      <button className="btn ghost small" onClick={() => run(() => api.post(`/api/truces/${t.id}/decline`), 'Truce declined.')}>Decline</button>
                    </>
                  )}
                  {t.status === 'proposed' && t.proposedByMe && (
                    <button className="btn ghost small" onClick={() => run(() => api.post(`/api/truces/${t.id}/withdraw`), 'Offer withdrawn.')}>Withdraw</button>
                  )}
                  {t.status === 'active' && (
                    <button
                      className="btn ghost small"
                      onClick={() =>
                        confirm(`End the truce with ${t.username}? Raids stay off for ${fmtSpan(truceNoticeMs(speed))} after you give notice.`) &&
                        run(() => api.post(`/api/truces/${t.id}/end`), 'Notice given.')
                      }
                    >
                      End truce
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Players you've met">
        {view.contacts.length === 0 ? (
          <Empty>Nobody yet. Scout a scent on the Missions screen: once you've seen inside one of a player's colonies, you can talk to them here.</Empty>
        ) : (
          <ul className="members">
            {view.contacts.map((c) => {
              const ally = c.relation?.relation === 'ally' || c.relation?.relation === 'fading';
              const canInvite = member && !ally && !c.invited && seatsLeft > 0;
              return (
                <li key={c.playerId}>
                  <div>
                    <strong>{c.username}</strong>
                    <span className="muted small"> · {fmtNum(c.points)} pts</span>
                    {c.supercolony && <span className="sc-tag">{c.supercolony}</span>}
                    {c.relation && <span className={`pact-tag ${c.relation.relation}`}>{RELATION_NAMES[c.relation.relation]}</span>}
                    {c.invited && <span className="muted small"> · invited</span>}
                  </div>
                  <div className="row-actions">
                    {!c.truce && !ally && (
                      <button className="btn ghost small" onClick={() => run(() => api.post('/api/truces', { playerId: c.playerId }), `Truce offered to ${c.username}.`)}>
                        Offer truce
                      </button>
                    )}
                    {canInvite && (
                      <button className="btn small" onClick={() => run(() => api.post('/api/supercolony/invite', { playerId: c.playerId }), `${c.username} invited to ${sc!.name}.`)}>
                        Invite
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}


function FoundPanel({ canFound, onFound, goResearch }: { canFound: boolean; onFound: (name: string) => void; goResearch: () => void }) {
  const [name, setName] = useState('');
  const problem = name ? supercolonyNameProblem(name) : null;
  return (
    <Panel title="Supercolony">
      {canFound ? (
        <>
          <p className="small">Found one and invite the players you trust. Or wait for an invitation from someone you've met.</p>
          <div className="found-row">
            <input
              aria-label="Supercolony name"
              placeholder="Name your supercolony"
              maxLength={SUPERCOLONY_NAME_LENGTH[1]}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="btn primary" disabled={!name || !!problem} onClick={() => onFound(name.trim())}>
              Found
            </button>
          </div>
          {problem && <p className="why small">{problem}</p>}
        </>
      ) : (
        <>
          <p className="small">
            Founding or joining a supercolony needs the <strong>Supercolony</strong> research (Nest branch). It opens with a Pheromone Chamber at level 3, Nuptial Flight 1 and Colony Mind 1:
            about when you're ready for a second colony. Truces need nothing but having met.
          </p>
          <button className="btn ghost small" onClick={goResearch}>Open research</button>
        </>
      )}
    </Panel>
  );
}
