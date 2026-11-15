const { openSqlite } = require('./sqlite');
const { openPostgres } = require('./postgres');
const { openMysql } = require('./mysql');
const { migrate } = require('./schema');
let active = null;

async function openDatabase(desc) {
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
async function initDatabase(desc) {
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
async function testDatabase(desc) {
  const db = await openDatabase(desc);
  try {
    await db.get('SELECT 1 AS ok');
    await migrate(db);
    return true;
  } finally {
    await db.close().catch(() => {});
  }
}

function getDb() {
  if (!active) throw new Error('数据库尚未初始化');
  return active;
}

function currentDbInfo() {
  return active ? active.info : null;
}

async function closeDatabase() {
  const db = active;
  active = null;
  if (db) await db.close().catch(() => {});
}

module.exports = {
  openDatabase,
  initDatabase,
  testDatabase,
  getDb,
  currentDbInfo,
  closeDatabase,
};
