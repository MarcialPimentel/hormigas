import { CHAMBER_IDS, QUESTS, add, addCounts, nextQuest, type QuestProgressInput, type UnitCounts } from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { now } from '../clock';
import { GameError } from '../errors';
import { advance, getPlayer, lockOwnColony, playerColonies, saveColony } from '../colony';

export async function questInput(q: Q, playerId: number): Promise<QuestProgressInput> {
  const t = now();
  const colonies = (await playerColonies(q, playerId)).map((c) => advance(c, t));
  const chambers: QuestProgressInput['chambers'] = {};
  let units: UnitCounts = {};
  for (const c of colonies) {
    for (const id of CHAMBER_IDS) chambers[id] = Math.max(chambers[id] ?? 0, c.chambers[id] ?? 0);
    units = addCounts(units, c.units);
  }
  const away = await q.query("SELECT units FROM missions WHERE player_id = $1 AND status <> 'done'", [playerId]);
  for (const m of away.rows) units = addCounts(units, m.units);
  const sent = await q.query('SELECT DISTINCT type FROM missions WHERE player_id = $1', [playerId]);
  const wild = await q.query(
    `SELECT count(*)::int AS n FROM raid_log r JOIN colonies c ON c.id = r.colony_id
      WHERE r.attacker_id = $1 AND r.winner = 'attacker' AND c.npc IS NOT NULL AND c.npc->>'kind' IS NULL`,
    [playerId],
  );
  return { chambers, units, missionsSent: sent.rows.map((r: any) => r.type), wildRaidsWon: wild.rows[0].n };
}

export async function questStatus(q: Q, playerId: number) {
  const r = await q.query('SELECT quests_claimed FROM players WHERE id = $1', [playerId]);
  const claimed: string[] = r.rows[0]?.quests_claimed ?? [];
  const quest = nextQuest(claimed);
  if (!quest) return { finished: true, claimed: claimed.length, total: QUESTS.length, quest: null };
  const ready = quest.done(await questInput(q, playerId));
  return {
    finished: false,
    claimed: claimed.length,
    total: QUESTS.length,
    quest: { id: quest.id, title: quest.title, hint: quest.hint, screen: quest.screen, reward: quest.reward, milestone: quest.milestone ?? null, ready },
  };
}

export async function claimQuest(q: Tx, playerId: number, questId: string, colonyId: number) {
  await getPlayer(q, playerId, true); // lock order: player, then colony
  const r = await q.query('SELECT quests_claimed FROM players WHERE id = $1', [playerId]);
  const claimed: string[] = r.rows[0].quests_claimed;
  const quest = nextQuest(claimed);
  if (!quest || quest.id !== questId) throw new GameError('bad_quest', 'That quest is not available.');
  if (!quest.done(await questInput(q, playerId))) throw new GameError('not_done', 'Finish the quest first.');
  let c = await lockOwnColony(q, colonyId, playerId);
  c = advance(c, now());
  c.resources = add(c.resources, quest.reward);
  await saveColony(q, c);
  await q.query('UPDATE players SET quests_claimed = $2 WHERE id = $1', [playerId, JSON.stringify([...claimed, quest.id])]);
  return quest;
}
