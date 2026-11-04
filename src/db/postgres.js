/**
 * PostgreSQL adapter. Requires the optional `pg` package:
 *   npm install pg
 */
export async function openPostgres(url) {
  let pg;
  try {
    pg = (await import('pg')).default;
  } catch {
    throw new Error('PostgreSQL 支持需要安装可选依赖：npm install pg');
  }

  const pool = new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 8000 });
  pool.on('error', (err) => console.error('[pg] idle client error:', err.message));
  await pool.query('SELECT 1');

  // Our queries use `?` placeholders; PostgreSQL wants $1..$n.
  const convert = (sql) => {
    let index = 0;
    return String(sql).replace(/\?/g, () => `$${++index}`);
  };

  const all = async (sql, params = []) => (await pool.query(convert(sql), params)).rows;
  const get = async (sql, params = []) => (await pool.query(convert(sql), params)).rows[0] ?? null;
  const run = async (sql, params = []) => {
    const result = await pool.query(convert(sql), params);
    return { changes: result.rowCount ?? 0 };
  };

  return {
    dialect: 'postgres',
    info: { driver: 'postgres', label: 'PostgreSQL' },
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
