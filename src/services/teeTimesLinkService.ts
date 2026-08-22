import pool from '../db/config';

/**
 * Resolves the "Link Tee Times" partner event for a given event, checking BOTH directions --
 * either this event has linked TO another (link_teetimes_enabled + link_teetimes_eventid on its
 * own EventOptions), or another event has linked TO this one. Symmetric on purpose: only the
 * initiating event (e.g. "Cron") needs to turn the option on and search for the other event
 * (e.g. "Tommy Davis") -- the linked event's own Tee Times screen picks up the merged view
 * automatically, without needing its own separate setup (confirmed with Matt 2026-08-22). Returns
 * null if no link exists in either direction.
 */
export async function getLinkedEventId(eventId: number): Promise<number | null> {
  const [forwardRows] = await pool.query<any[]>(
    `SELECT
       MAX(CASE WHEN OptionName = 'link_teetimes_enabled' THEN OptionValue END) AS enabled,
       MAX(CASE WHEN OptionName = 'link_teetimes_eventid' THEN OptionValue END) AS partnerId
     FROM EventOptions
     WHERE EventID = ? AND OptionName IN ('link_teetimes_enabled', 'link_teetimes_eventid')`,
    [eventId]
  );
  const forward = forwardRows[0];
  const forwardPartnerId = Number(forward?.partnerId);
  if (forward?.enabled === 'T' && Number.isFinite(forwardPartnerId) && forwardPartnerId > 0) {
    return forwardPartnerId;
  }

  const [reverseRows] = await pool.query<any[]>(
    `SELECT eo1.EventID AS partnerId
     FROM EventOptions eo1
     INNER JOIN EventOptions eo2
       ON eo2.EventID = eo1.EventID AND eo2.OptionName = 'link_teetimes_enabled' AND eo2.OptionValue = 'T'
     WHERE eo1.OptionName = 'link_teetimes_eventid' AND eo1.OptionValue = ?
     LIMIT 1`,
    [String(eventId)]
  );
  return reverseRows.length > 0 ? reverseRows[0].partnerId : null;
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
