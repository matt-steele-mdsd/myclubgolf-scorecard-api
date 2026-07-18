import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || (process.env.NODE_ENV === 'production' ? '68.178.198.174' : 'localhost'),
  port: 3306,
  user: 'myclubadmin',
  password: 'MyS0nisaPilot',
  database: 'myclubgolf',
}) as mysql.Pool;

export default pool;
