/**
 * Portable schema. Every value is stored as TEXT/INTEGER so the same queries
 * work on SQLite, PostgreSQL and MySQL. JSON documents live in TEXT columns.
 */
const TYPES = {
  sqlite: { id: 'TEXT', text: 'TEXT', short: 'TEXT', int: 'INTEGER' },
  postgres: { id: 'TEXT', text: 'TEXT', short: 'TEXT', int: 'INTEGER' },
  mysql: { id: 'VARCHAR(64)', text: 'LONGTEXT', short: 'VARCHAR(191)', int: 'INT' },
};

function types(dialect) {
  const t = TYPES[dialect];
  if (!t) throw new Error(`不支持的数据库类型：${dialect}`);
  return t;
}

// MySQL does not allow defaults on TEXT/BLOB columns, so text defaults are
// only emitted for the other dialects. Every insert provides all columns.
function textDefault(dialect, literal) {
  return dialect === 'mysql' ? '' : ` DEFAULT ${literal}`;
}

export function schemaStatements(dialect) {
  const t = types(dialect);
  const d = (literal) => textDefault(dialect, literal);
  const stmts = [
    `CREATE TABLE IF NOT EXISTS datasets (
      id ${t.id} PRIMARY KEY,
      name ${t.text} NOT NULL,
      icon ${t.short} NOT NULL DEFAULT '📊',
      description ${t.text} NOT NULL${d("''")},
      url_template ${t.text} NOT NULL${d("''")},
      variables ${t.text} NOT NULL${d("'[]'")},
      settings ${t.text} NOT NULL${d("'{}'")},
      sort_order ${t.int} NOT NULL DEFAULT 0,
      last_auto_at ${t.text} NULL,
      created_at ${t.text} NOT NULL,
      updated_at ${t.text} NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS fields (
      id ${t.id} PRIMARY KEY,
      dataset_id ${t.id} NOT NULL,
      name ${t.text} NOT NULL,
      data_type ${t.short} NOT NULL DEFAULT 'text',
      template ${t.text} NOT NULL${d("'{}'")},
      sort_order ${t.int} NOT NULL DEFAULT 0,
      created_at ${t.text} NOT NULL,
      updated_at ${t.text} NOT NULL,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS entries (
      id ${t.id} PRIMARY KEY,
      dataset_id ${t.id} NOT NULL,
      vars ${t.text} NOT NULL${d("'{}'")},
      note ${t.text} NOT NULL${d("''")},
      status ${t.short} NOT NULL DEFAULT 'idle',
      error ${t.text} NULL,
      latest_values ${t.text} NOT NULL${d("'{}'")},
      latest_status ${t.short} NOT NULL DEFAULT 'idle',
      last_run_at ${t.text} NULL,
      created_at ${t.text} NOT NULL,
      updated_at ${t.text} NOT NULL,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS snapshots (
      id ${t.id} PRIMARY KEY,
      entry_id ${t.id} NOT NULL,
      dataset_id ${t.id} NOT NULL,
      values_json ${t.text} NOT NULL${d("'{}'")},
      errors_json ${t.text} NOT NULL${d("'{}'")},
      status ${t.short} NOT NULL,
      error ${t.text} NULL,
      source ${t.short} NOT NULL,
      duration_ms ${t.int} NULL,
      captured_at ${t.text} NOT NULL,
      FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS runs (
      id ${t.id} PRIMARY KEY,
      dataset_id ${t.id} NULL,
      source ${t.short} NOT NULL,
      status ${t.short} NOT NULL,
      total ${t.int} NOT NULL DEFAULT 0,
      done_count ${t.int} NOT NULL DEFAULT 0,
      failed_count ${t.int} NOT NULL DEFAULT 0,
      started_at ${t.text} NOT NULL,
      finished_at ${t.text} NULL,
      error ${t.text} NULL
    )`,

    `CREATE TABLE IF NOT EXISTS app_settings (
      k ${t.short} PRIMARY KEY,
      v ${t.text} NOT NULL
    )`,
  ];

  const indexes = [
    ['idx_fields_dataset', 'fields', '(dataset_id)'],
    ['idx_entries_dataset', 'entries', '(dataset_id)'],
    ['idx_snapshots_entry', 'snapshots', '(entry_id, captured_at)'],
    ['idx_snapshots_dataset', 'snapshots', '(dataset_id, captured_at)'],
    ['idx_runs_started', 'runs', '(started_at)'],
  ];

  for (const [name, table, cols] of indexes) {
    // MySQL has no CREATE INDEX IF NOT EXISTS; duplicates are tolerated by migrate().
    stmts.push(
      dialect === 'mysql'
        ? `CREATE INDEX ${name} ON ${table} ${cols}`
        : `CREATE INDEX IF NOT EXISTS ${name} ON ${table} ${cols}`,
    );
  }
  return stmts;
}

export async function migrate(db) {
  for (const sql of schemaStatements(db.dialect)) {
    try {
      await db.exec(sql);
    } catch (err) {
      const message = String(err?.message || err);
      if (/Duplicate key name|already exists|relation .* already exists/i.test(message)) continue;
      throw new Error(`数据库初始化失败：${message}\nSQL: ${sql}`);
    }
  }
}
