import pool from '../db/config';

/**
 * App-wide bug/idea log (Menu -> Feedback) — not scoped to any one event, since it's feedback
 * about the app itself. No auth: anyone with the app can log something, same as the myclubgolf.com
 * page this replaced (moved into the app 2026-07-12 so testers use the app instead of the PHP site).
 */
export interface FeedbackEntry {
  id: number;
  type: 'Bug' | 'Idea';
  title: string;
  description: string;
  submittedBy: string;
  dateEntered: string;
}

export async function submitFeedback(
  type: 'Bug' | 'Idea',
  title: string,
  description: string,
  submittedBy: string
): Promise<void> {
  await pool.query(
    `INSERT INTO Feedback (Type, Title, Description, SubmittedBy) VALUES (?, ?, ?, ?)`,
    [type, title, description, submittedBy]
  );
}

export async function getFeedback(): Promise<FeedbackEntry[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT FeedbackID, Type, Title, Description, SubmittedBy, DateEntered FROM Feedback ORDER BY DateEntered DESC`
  );
  return rows.map((r) => ({
    id: r.FeedbackID,
    type: r.Type,
    title: r.Title,
    description: r.Description || '',
    submittedBy: r.SubmittedBy || '',
    dateEntered: r.DateEntered,
  }));
}

/** Delete one feedback entry (spam/duplicate cleanup) -- Matt, 2026-08-22: the master ("mdsd")
 * event should be able to see and clean up this app-wide log, since it's the one place already
 * used for cross-event admin tools (Master Tools). Feedback itself stays un-scoped to any event
 * (see the interface's own doc comment) -- only the ABILITY to delete is gated to the master
 * event, in app/feedback.tsx, the same way Master Tools itself is gated (EventOptions.hidden_from_search). */
export async function deleteFeedback(feedbackId: number): Promise<void> {
  await pool.query('DELETE FROM Feedback WHERE FeedbackID = ?', [feedbackId]);
}
