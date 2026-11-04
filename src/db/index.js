import { openSqlite } from './sqlite.js';
import { openPostgres } from './postgres.js';
import { openMysql } from './mysql.js';
import { migrate } from './schema.js';

let active = null;

export async function openDatabase(desc) {
  if (!desc || !desc.driver) throw new Error('缺少数据库配置');
  if (desc.driver === 'sqlite') {
    if (!desc.file) throw new Error('缺少 SQLite 文件路径');
    return openSqlite(desc.file);
  }
  if (desc.driver === 'postgres' || desc.driver === 'postgresql' || desc.driver === 'pg') {
    if (!desc.url) throw new Error('缺少 PostgreSQL 连接串');
    return openPostgres(desc.url);
  }
  if (desc.driver === 'mysql' || desc.driver === 'mariadb') {
    if (!desc.url) throw new Error('缺少 MySQL 连接串');
    return openMysql(desc.url);
  }
  throw new Error(`未知的数据库类型：${desc.driver}`);
}

/** Open + migrate the database, then make it the active connection. */
export async function initDatabase(desc) {
  const next = await openDatabase(desc);
  try {
    await migrate(next);
  } catch (err) {
    await next.close().catch(() => {});
    throw err;
  }
  const previous = active;
  active = next;
  if (previous) await previous.close().catch(() => {});
  return next;
}

/** Open a connection, verify it works, close it again. */
export async function testDatabase(desc) {
  const db = await openDatabase(desc);
  try {
    await db.get('SELECT 1 AS ok');
    await migrate(db);
    return true;
  } finally {
    await db.close().catch(() => {});
  }
}

export function getDb() {
  if (!active) throw new Error('数据库尚未初始化');
  return active;
}

export function currentDbInfo() {
  return active ? active.info : null;
}

export async function closeDatabase() {
  const db = active;
  active = null;
  if (db) await db.close().catch(() => {});
}
