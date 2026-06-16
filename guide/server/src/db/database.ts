import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | undefined;

export function getDataDir(): string {
  return process.env.DATA_DIR || join(__dirname, '../../../data');
}

export function getDb(): Database.Database {
  if (!db) {
    const dataDir = getDataDir();
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, 'templates.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDb(db);
  }
  return db;
}

function initializeDb(db: Database.Database): void {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  migrateDb(db);
}

function getColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function addColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = getColumns(db, table);
  if (!columns.has(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrateDb(db: Database.Database): void {
  rebuildTablesForStatusChecks(db);

  addColumn(db, 'templates', 'published_at', 'TEXT');

  addColumn(db, 'render_jobs', 'pipeline_key', "TEXT DEFAULT 'standard'");
  addColumn(db, 'render_jobs', 'input_mode', "TEXT DEFAULT 'template'");
  addColumn(db, 'render_jobs', 'topic', "TEXT DEFAULT ''");
  addColumn(db, 'render_jobs', 'script_text', "TEXT DEFAULT ''");
  addColumn(db, 'render_jobs', 'template_dsl_snapshot', "TEXT DEFAULT ''");
  addColumn(db, 'render_jobs', 'provider_config_snapshot', "TEXT DEFAULT '{}'");
  addColumn(db, 'render_jobs', 'retry_count', 'INTEGER DEFAULT 0');
  addColumn(db, 'render_jobs', 'max_retries', 'INTEGER DEFAULT 1');
  addColumn(db, 'render_jobs', 'worker_id', "TEXT DEFAULT ''");
  addColumn(db, 'render_jobs', 'heartbeat_at', 'TEXT');
  addColumn(db, 'render_jobs', 'cancel_requested', 'INTEGER DEFAULT 0');
  addColumn(db, 'render_jobs', 'parent_job_id', 'TEXT');
  addColumn(db, 'render_jobs', 'started_at', 'TEXT');

  addColumn(db, 'digital_humans', 'provider_job_id', "TEXT DEFAULT ''");
  addColumn(db, 'digital_humans', 'training_error', "TEXT DEFAULT ''");
  addColumn(db, 'digital_humans', 'last_trained_at', 'TEXT');

  db.prepare("UPDATE digital_humans SET status = 'pending_assets' WHERE status = 'pending'").run();
  db.exec('CREATE INDEX IF NOT EXISTS idx_render_jobs_pipeline ON render_jobs(pipeline_key)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type)');
}

function tableSql(db: Database.Database, table: string): string {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql?: string } | undefined;
  return row?.sql || '';
}

function rebuildTablesForStatusChecks(db: Database.Database): void {
  const digitalHumansSql = tableSql(db, 'digital_humans');
  const renderJobsSql = tableSql(db, 'render_jobs');
  const needsDigitalHumanRebuild = digitalHumansSql && !digitalHumansSql.includes('pending_assets');
  const needsRenderJobRebuild = renderJobsSql && !renderJobsSql.includes('cancelled');

  if (!needsDigitalHumanRebuild && !needsRenderJobRebuild) return;

  db.pragma('foreign_keys = OFF');
  const rebuild = db.transaction(() => {
    if (needsDigitalHumanRebuild) {
      db.exec(`
        ALTER TABLE digital_humans RENAME TO digital_humans_old;
        CREATE TABLE digital_humans (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          face_photo_url TEXT DEFAULT '',
          half_body_photo_url TEXT DEFAULT '',
          full_body_photo_url TEXT DEFAULT '',
          voice_sample_url TEXT DEFAULT '',
          voice_clone_id TEXT,
          image_model_id TEXT,
          status TEXT DEFAULT 'pending_assets' CHECK(status IN ('pending','pending_assets','training','ready','failed')),
          provider_job_id TEXT DEFAULT '',
          training_error TEXT DEFAULT '',
          last_trained_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO digital_humans (
          id, name, face_photo_url, half_body_photo_url, full_body_photo_url,
          voice_sample_url, voice_clone_id, image_model_id, status, created_at, updated_at
        )
        SELECT
          id, name, face_photo_url, half_body_photo_url, full_body_photo_url,
          voice_sample_url, voice_clone_id, image_model_id,
          CASE WHEN status = 'pending' THEN 'pending_assets' ELSE status END,
          created_at, updated_at
        FROM digital_humans_old;
        DROP TABLE digital_humans_old;
      `);
    }

    if (needsRenderJobRebuild) {
      db.exec(`
        ALTER TABLE render_jobs RENAME TO render_jobs_old;
        CREATE TABLE render_jobs (
          id TEXT PRIMARY KEY,
          template_id TEXT NOT NULL,
          digital_human_id TEXT,
          status TEXT DEFAULT 'queued' CHECK(status IN ('queued','parsing','scene_gen','video_gen','ffmpeg','completed','failed','cancelling','cancelled')),
          pipeline_key TEXT DEFAULT 'standard',
          input_mode TEXT DEFAULT 'template',
          topic TEXT DEFAULT '',
          script_text TEXT DEFAULT '',
          variables_json TEXT DEFAULT '{}',
          template_dsl_snapshot TEXT DEFAULT '',
          provider_config_snapshot TEXT DEFAULT '{}',
          output_url TEXT,
          error_message TEXT,
          progress REAL DEFAULT 0,
          stage TEXT DEFAULT '',
          retry_count INTEGER DEFAULT 0,
          max_retries INTEGER DEFAULT 1,
          worker_id TEXT DEFAULT '',
          heartbeat_at TEXT,
          cancel_requested INTEGER DEFAULT 0,
          parent_job_id TEXT,
          started_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          completed_at TEXT,
          FOREIGN KEY (template_id) REFERENCES templates(id),
          FOREIGN KEY (digital_human_id) REFERENCES digital_humans(id)
        );
        INSERT INTO render_jobs (
          id, template_id, digital_human_id, status, variables_json, output_url,
          error_message, progress, stage, created_at, updated_at, completed_at
        )
        SELECT
          id, template_id, digital_human_id, status, variables_json, output_url,
          error_message, progress, stage, created_at, updated_at, completed_at
        FROM render_jobs_old;
        DROP TABLE render_jobs_old;
        ALTER TABLE render_logs RENAME TO render_logs_old;
        CREATE TABLE render_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          render_job_id TEXT NOT NULL,
          level TEXT DEFAULT 'info' CHECK(level IN ('info','warn','error')),
          message TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (render_job_id) REFERENCES render_jobs(id)
        );
        INSERT INTO render_logs (id, render_job_id, level, message, created_at)
        SELECT id, render_job_id, level, message, created_at FROM render_logs_old;
        DROP TABLE render_logs_old;
      `);
    }
  });
  rebuild();
  db.pragma('foreign_keys = ON');
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined;
  }
}
