import pool from './config';

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}
