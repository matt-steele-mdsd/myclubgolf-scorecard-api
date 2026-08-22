import pool from '../db/config';

/**
 * Resolves the "Link Tee Times" partner event(s) for a given event -- one direction only. If Cron
 * links to Tommy Davis (and/or others), Cron's own Tee Times shows all linked events combined, but
 * the linked-to events' screens are completely unaffected -- they have no link of their own
 * configured, so they just show their own event, same as always (corrected with Matt 2026-08-22:
 * originally built symmetric, i.e. both sides would see the merge, which was wrong -- the linked-to
 * event never opted into anything and shouldn't have its screen changed by a decision made
 * unilaterally). Multiple partners supported since 2026-08-22 (Matt: "Cron may want to show tee
 * times for more than one other event") -- link_teetimes_eventid stores a comma-separated list of
 * EventIDs. Returns an empty array if this event hasn't linked to anything.
 */
export async function getLinkedEventIds(eventId: number): Promise<number[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT
       MAX(CASE WHEN OptionName = 'link_teetimes_enabled' THEN OptionValue END) AS enabled,
       MAX(CASE WHEN OptionName = 'link_teetimes_eventid' THEN OptionValue END) AS partnerIds
     FROM EventOptions
     WHERE EventID = ? AND OptionName IN ('link_teetimes_enabled', 'link_teetimes_eventid')`,
    [eventId]
  );
  const row = rows[0];
  if (row?.enabled !== 'T' || !row?.partnerIds) return [];
  return String(row.partnerIds)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Ensures a player who just signed up on one side of a link is also a roster member
 * (EventPlayers row) of the other linked event -- so their name shows up in that event's own
 * player-picker going forward too, without the admin ever adding them twice. Safe to call
 * unconditionally: both linked events share the same course (confirmed with Matt 2026-08-22), so
 * this can never create a duplicate Player row -- Player is deduped by Course+FirstName+LastName,
 * this only ever adds a second EventPlayers membership row for an ID that already exists.
 */
export async function ensurePlayerLinkedToEvent(playerId: number, otherEventId: number): Promise<void> {
  await pool.query(
    `INSERT INTO EventPlayers (EventID, PlayerID, LastUpdateUser)
     VALUES (?, ?, 'App')
     ON DUPLICATE KEY UPDATE LastUpdateUser = 'App'`,
    [otherEventId, playerId]
  );
}
