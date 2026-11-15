const fs = require('fs');
const path = require('path');

/**
 * SQLite adapter for Node 10 based on sql.js (WebAssembly).
 *
 * Node 10 has no `node:sqlite` and native SQLite bindings need a compiler on
 * every platform, so this adapter keeps the database in memory and writes the
 * exported SQLite file back to disk after each mutation. The file format stays
 * a normal `.db`, so it can be opened by sqlite3 or moved to a newer Node.
 */
async function openSqlite(file) {
  // sql.js can only read the main database file; unmerged WAL contents would be
  // silently lost. Refuse to start instead of overwriting them.
  const walPath = `${file}-wal`;
  if (fs.existsSync(file) && fs.existsSync(walPath) && fs.statSync(walPath).size > 0) {
    throw new Error(
      `检测到未合并的 WAL 文件：${walPath}\n` +
        '请先停止 main 分支的服务，或执行以下命令合并后再启动 v10：\n' +
        `  sqlite3 "${file}" "PRAGMA wal_checkpoint(TRUNCATE);"`,
    );
  }
  let initSqlJs;
  try {
    initSqlJs = require('sql.js');
  } catch (err) {
    throw new Error('SQLite 支持需要安装依赖：npm install sql.js');
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const SQL = await initSqlJs({
    locateFile: (name) => require.resolve(`sql.js/dist/${name}`),
  });

  let data;
  if (fs.existsSync(file) && fs.statSync(file).size > 0) {
    data = new Uint8Array(fs.readFileSync(file));
  }
  const raw = new SQL.Database(data);
  raw.run('PRAGMA foreign_keys = ON');

  const persist = () => {
    // sql.js export() closes and reopens the connection internally, so
    // connection-scoped PRAGMAs must be reapplied afterwards.
    const bytes = Buffer.from(raw.export());
    raw.run('PRAGMA foreign_keys = ON');
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, file);
  };

  const all = async (sql, params = []) => {
    const stmt = raw.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  };

  const get = async (sql, params = []) => {
    const rows = await all(sql, params);
    return rows.length ? rows[0] : null;
  };

  const run = async (sql, params = []) => {
    raw.run(sql, params);
    const changes = raw.getRowsModified();
    persist();
    return { changes: Number(changes || 0) };
  };

  return {
    dialect: 'sqlite',
    info: { driver: 'sqlite', file, label: path.basename(file) },
    all,
    get,
    run,
    exec: async (sql) => {
      raw.exec(sql);
      persist();
    },
    async close() {
      persist();
      raw.close();
    },
  };
}

module.exports = { openSqlite };
