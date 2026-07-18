import { GolfEvent } from '../types/event';
import pool from '../db/config';

/**
 * Search events by name or course name (case-insensitive partial match)
 */
export const searchEvents = async (query: string): Promise<GolfEvent[]> => {
  if (!query.trim()) {
    const [rows] = await pool.query('SELECT EventID as id, EventName AS eventName, EventCourse AS courseName FROM Events ORDER BY EventCourse, EventName');
    return rows as GolfEvent[];
  }

  const searchPattern = `%${query}%`;
  const [rows] = await pool.query(
    'SELECT EventID as id, EventName AS eventName, EventCourse AS courseName FROM Events WHERE EventName LIKE ? OR EventCourse LIKE ? ORDER BY EventCourse, EventName',
    [searchPattern, searchPattern]
  );
  return rows as GolfEvent[];
};

/**
 * Get a single event by ID
 */
export const getEventById = async (id: number): Promise<GolfEvent | undefined> => {
  const [rows] = await pool.query(
    'SELECT EventID as id, EventName AS eventName, EventCourse AS courseName FROM Events WHERE EventID = ?',
    [id]
  );
  return (rows as GolfEvent[])[0];
};

/**
 * Create a new event
 */
export const createEvent = async (event: Omit<GolfEvent, 'id'>): Promise<GolfEvent> => {
  const result = await pool.query(
    'INSERT INTO Events (EventName, EventCourse, LastUpdateUser) VALUES (?, ?, ?)',
    [event.eventName, event.courseName, 'Web']
  );
  
  const insertResult = result as any;
  const newId = typeof insertResult.insertId === 'number' ? insertResult.insertId : (insertResult[0] as any).insertId;

  return {
    id: newId,
    eventName: event.eventName,
    courseName: event.courseName,
  };
};
