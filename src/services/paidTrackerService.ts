import pool from '../db/config';

/** One player registered (any status besides Opted-Out) for a tee date, and whether they've paid. */
export interface PaidTrackerRow {
  playerId: number;
  name: string;
  status: string;
  paid: boolean;
}

/**
 * Everyone registered for a tee date (PlayerStatus 'I'/'E'/'L'/'X' — anything but 'O' Out)
 * for Admin -> Paid Tracker, with whether they've paid for that date yet.
 */
export async function getPaidTrackerList(eventId: number, teeDate: string): Promise<PaidTrackerRow[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT ps.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, ps.Status,
            pt.PlayerID IS NOT NULL AS paid
     FROM PlayerStatus ps
     INNER JOIN Player p ON p.PlayerID = ps.PlayerID
     LEFT JOIN PaidTracker pt ON pt.GroupID = ps.GroupID AND pt.TeeDate = ps.TeeDate AND pt.PlayerID = ps.PlayerID
     WHERE ps.GroupID = ? AND ps.TeeDate = ? AND ps.Status != 'O'
     ORDER BY p.LastName, p.FirstName`,
    [eventId, teeDate]
  );
  return rows.map((r) => ({ playerId: r.PlayerID, name: r.name, status: r.Status, paid: !!r.paid }));
}

/** One player who was marked paid for a tee date but has since switched to Out -- flagged so
 * the admin notices to refund them, rather than the money silently sitting uncollected-for.
 * Deliberately narrower than getPaidTrackerList: normally an Out player has no reason to show up
 * anywhere (removed from the visible columns entirely, confirmed with Matt 2026-08-22 as
 * intentional, not a bug) -- this is the one exception, someone who paid and then backed out. */
export interface RefundNeededRow {
  playerId: number;
  name: string;
}

/**
 * Everyone marked Out for this tee date who still has a PaidTracker row -- i.e. paid, then
 * un-committed. Empty in the overwhelmingly common case (nobody paid-then-backed-out), which is
 * exactly why this doesn't reuse getPaidTrackerList's broader "everyone but Out" query -- that
 * one deliberately excludes Out entirely, the opposite of what this needs.
 */
export async function getRefundNeededList(eventId: number, teeDate: string): Promise<RefundNeededRow[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT ps.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name
     FROM PlayerStatus ps
     INNER JOIN Player p ON p.PlayerID = ps.PlayerID
     INNER JOIN PaidTracker pt ON pt.GroupID = ps.GroupID AND pt.TeeDate = ps.TeeDate AND pt.PlayerID = ps.PlayerID
     WHERE ps.GroupID = ? AND ps.TeeDate = ? AND ps.Status = 'O'
     ORDER BY p.LastName, p.FirstName`,
    [eventId, teeDate]
  );
  return rows.map((r) => ({ playerId: r.PlayerID, name: r.name }));
}

/** Mark a player paid (or unpaid) for a specific event/tee date. */
export async function setPaidTracker(eventId: number, teeDate: string, playerId: number, paid: boolean): Promise<void> {
  if (paid) {
    await pool.query(
      `INSERT INTO PaidTracker (GroupID, TeeDate, PlayerID, LastUpdateUser) VALUES (?, ?, ?, 'app')
       ON DUPLICATE KEY UPDATE LastUpdateUser = VALUES(LastUpdateUser), LastUpdateDt = CURRENT_TIMESTAMP`,
      [eventId, teeDate, playerId]
    );
  } else {
    await pool.query('DELETE FROM PaidTracker WHERE GroupID = ? AND TeeDate = ? AND PlayerID = ?', [eventId, teeDate, playerId]);
  }
}
