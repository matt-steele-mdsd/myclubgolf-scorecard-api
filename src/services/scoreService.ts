import pool from '../db/config';

export interface ScoreData {
  eventId: number;
  playerId: number;
  holeNumber: number;
  grossScore: number;
}

/**
 * Save a player's score for a specific hole in an event
 */
export async function savePlayerHoleScore(scoreData: ScoreData): Promise<boolean> {
  try {
    const sql = `
      INSERT INTO player_hole_scores (event_id, player_id, hole_number, gross_score)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE gross_score = VALUES(gross_score)
    `;
    
    await pool.query(sql, [
      scoreData.eventId,
      scoreData.playerId,
      scoreData.holeNumber,
      scoreData.grossScore
    ]);
    
    return true;
  } catch (error: any) {
    console.error('Error saving player hole score:', error.message);
    return false;
  }
}

/**
 * Save multiple scores for a single player across all holes in an event.
 * Expects `scores` to be an array of pre-calculated entries from the frontend:
 *   [{ gameId, playerId, holeNumber, grossScore, netScore, skinsScore }, ...]
 */
export async function savePlayerScores(gameId: number, playerId: number, scores: any[]): Promise<boolean> {
  try {
    console.log('[SCORES] savePlayerScores called with:', gameId, playerId, scores.length);
    const sql = `
      INSERT INTO Score (GameID, PlayerID, CourseID, TeeID, HoleID, Score, NetScore, SkinsScore, LastUpdateUser, LastUpdateDt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'game.tsx', NOW())
      ON DUPLICATE KEY UPDATE 
        Score = VALUES(Score),
        NetScore = VALUES(NetScore),
        SkinsScore = VALUES(SkinsScore),
        LastUpdateUser = VALUES(LastUpdateUser),
        LastUpdateDt = VALUES(LastUpdateDt)
    `;

    // Prepare all score entries for this player (courseId comes from frontend)
    const values: any[][] = [];
    for (const entry of scores) {
      values.push([entry.gameId, entry.playerId, entry.courseId, 0, entry.holeNumber, entry.grossScore, entry.netScore, entry.skinsScore]);
    }

    console.log('Saving scores:', JSON.stringify({ gameId, playerId, courseId: values[0]?.[2], holeCount: values.length }));
    console.log('[SCORES] SQL values prepared:', JSON.stringify(values));
    
    // Execute batch insert/update
    await pool.query(sql, values);
    console.log('[SCORES] Query executed successfully');
    
    return true;
  } catch (error: any) {
    console.error('Error saving player scores:', error.message, error.sqlState, error.code);
    return false;
  }
}

/**
 * Get all scores for a specific event and player
 */
export async function getPlayerScores(eventId: number, playerId: number): Promise<Record<number, number>> {
  try {
    const sql = `
      SELECT hole_number, gross_score 
      FROM player_hole_scores 
      WHERE event_id = ? AND player_id = ?
    `;

    const [rows] = await pool.query(sql, [eventId, playerId]);
    
    // Convert to record format: { 1: 4, 2: 3, ... }
    const scores: Record<number, number> = {};
    for (const row of rows as any[]) {
      scores[row.hole_number] = row.gross_score;
    }

    return scores;
  } catch (error: any) {
    console.error('Error getting player scores:', error.message);
    return {};
  }
}
