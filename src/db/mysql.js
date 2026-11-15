/**
 * MySQL / MariaDB adapter. Requires the optional `mysql2` package:
 *   npm install mysql2
 */
async function openMysql(url) {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch (err) {
    throw new Error('MySQL 支持需要安装可选依赖：npm install mysql2');
  }

  const pool = mysql.createPool({
    uri: url,
    connectionLimit: 5,
    charset: 'utf8mb4',
    timezone: 'Z',
    connectTimeout: 8000,
  });
  await pool.query('SELECT 1');

  const all = async (sql, params = []) => {
    const [rows] = await pool.query(sql, params);
    return Array.isArray(rows) ? rows : [];
  };
  const get = async (sql, params = []) => {
    const [rows] = await pool.query(sql, params);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  };
  const run = async (sql, params = []) => {
    const [result] = await pool.query(sql, params);
    return { changes: (result && result.affectedRows) || 0 };
  };

  return {
    dialect: 'mysql',
    info: { driver: 'mysql', label: 'MySQL' },
    all,
    get,
    run,
    exec: async (sql) => {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  openMysql,
};
