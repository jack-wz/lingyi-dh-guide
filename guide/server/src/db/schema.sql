CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT '',
  description TEXT DEFAULT '',
  cover_url TEXT DEFAULT '',
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','pending','published','offline')),
  dsl_json TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS digital_humans (
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

CREATE TABLE IF NOT EXISTS render_jobs (
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

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON render_jobs(status);
CREATE INDEX IF NOT EXISTS idx_render_jobs_template ON render_jobs(template_id);

CREATE TABLE IF NOT EXISTS render_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  render_job_id TEXT NOT NULL,
  level TEXT DEFAULT 'info' CHECK(level IN ('info','warn','error')),
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (render_job_id) REFERENCES render_jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_render_logs_job ON render_logs(render_job_id);
