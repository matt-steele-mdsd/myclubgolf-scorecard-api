import { GolfEvent } from '../types/event';
import pool from '../db/config';

/**
 * Get the most recent game ID for an event (mirrors showleaderboard.php query).
 */
export async function getLatestGameId(eventId: number): Promise<{ gameId: number; courseName: string; gameDate: string } | null> {
  const [rows] = await pool.query<any[]>(
    `SELECT DISTINCT g.GameID, c.CourseName, g.GameDate
     FROM Game g
     INNER JOIN Score s ON s.GameID = g.GameID
     INNER JOIN Course c ON c.CourseID = g.CourseID
     WHERE g.GroupID = ?
     ORDER BY g.GameDate DESC
     LIMIT 1`,
    [eventId]
  );

  if (rows.length === 0) return null;
  const row = rows[0];
  return { gameId: row.GameID, courseName: row.CourseName, gameDate: row.GameDate };
}

/**
 * Get leaderboard data for a game (mirrors leaderboard.php query).
 */
export interface LeaderboardRow {
  name: string;
  thru: number;
  score: string; // "Even", "+3", "-2" etc.
}

export async function getLeaderboard(gameId: number, scoreType: 'G' | 'N'): Promise<LeaderboardRow[]> {
  const orderClause = scoreType === 'G'
    ? '(SUM(sc.Score) - SUM(cd.Par)) ASC'
    : '(SUM(sc.NetScore) - SUM(cd.Par)) ASC';

  const [rows] = await pool.query<any[]>(
    `SELECT CONCAT(p.LastName, ', ', p.FirstName) AS Name,
            MAX(sc.HoleID) AS Thru,
            CASE
              WHEN (SUM(${scoreType === 'G' ? 'sc.Score' : 'sc.NetScore'}) - SUM(cd.Par)) = 0 THEN 'Even'
              WHEN (SUM(${scoreType === 'G' ? 'sc.Score' : 'sc.NetScore'}) - SUM(cd.Par)) > 0 THEN CONCAT('+', (SUM(${scoreType === 'G' ? 'sc.Score' : 'sc.NetScore'}) - SUM(cd.Par)))
              WHEN (SUM(${scoreType === 'G' ? 'sc.Score' : 'sc.NetScore'}) - SUM(cd.Par)) < 0 THEN CONCAT('-', ABS(SUM(${scoreType === 'G' ? 'sc.Score' : 'sc.NetScore'}) - SUM(cd.Par)))
            END AS Standing
     FROM Score sc
     INNER JOIN CourseDetails cd ON cd.CourseID = sc.CourseID AND cd.HoleNum = sc.HoleID
     INNER JOIN Player p ON p.PlayerID = sc.PlayerID
     WHERE sc.GameID = ? AND sc.Score > 0
     GROUP BY sc.PlayerID
     ORDER BY ${orderClause}, p.LastName, p.FirstName`,
    [gameId]
  );

  return rows.map((r) => ({ name: r.Name, thru: r.Thru, score: r.Standing }));
}
