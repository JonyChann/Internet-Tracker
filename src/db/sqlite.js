import fs from 'node:fs';
import path from 'node:path';

/**
 * SQLite adapter built on Node's bundled `node:sqlite` module (Node 22.13+,
 * requires the --experimental-sqlite flag, which `npm start` adds).
 */
export async function openSqlite(file) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch {
    throw new Error(
      '当前 Node.js 无法加载 node:sqlite。请使用 `npm start` 启动（Node 22.13+ 并带 --experimental-sqlite），或在设置中切换到 PostgreSQL / MySQL。',
    );
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA busy_timeout = 5000');

  const all = async (sql, params = []) => raw.prepare(sql).all(...params).map((row) => ({ ...row }));
  const get = async (sql, params = []) => {
    const row = raw.prepare(sql).get(...params);
    return row ? { ...row } : null;
  };
  const run = async (sql, params = []) => {
    const result = raw.prepare(sql).run(...params);
    return { changes: Number(result.changes ?? 0) };
  };

  return {
    dialect: 'sqlite',
    info: { driver: 'sqlite', file, label: path.basename(file) },
    all,
    get,
    run,
    exec: async (sql) => {
      raw.exec(sql);
    },
    async close() {
      raw.close();
    },
  };
}
