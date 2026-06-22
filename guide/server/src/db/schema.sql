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

CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('brand','look_preset','voice','script','knowledge','knowledge_doc')),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK(status IN ('active','archived')),
  tags TEXT DEFAULT '[]',
  file_url TEXT DEFAULT '',
  parent_id TEXT DEFAULT '',
  payload_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_library_items_category ON library_items(category);
CREATE INDEX IF NOT EXISTS idx_library_items_parent ON library_items(parent_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','editing','proposing','generating','reviewing','completed','archived')),
  template_snapshot_json TEXT DEFAULT '{}',
  brand_pack_id TEXT DEFAULT '',
  brand_pack_version INTEGER DEFAULT 0,
  brief_json TEXT DEFAULT '{}',
  current_dsl_json TEXT DEFAULT '{}',
  current_version_id TEXT DEFAULT '',
  actor_id TEXT DEFAULT 'local-user',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (template_id) REFERENCES templates(id)
);

CREATE INDEX IF NOT EXISTS idx_projects_template ON projects(template_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

CREATE TABLE IF NOT EXISTS project_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  dsl_json TEXT NOT NULL DEFAULT '{}',
  change_summary TEXT DEFAULT '',
  actor_id TEXT DEFAULT 'local-user',
  parent_version_id TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project ON project_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_versions_number ON project_versions(project_id, version_number);

CREATE TABLE IF NOT EXISTS library_item_versions (
  id TEXT PRIMARY KEY,
  library_item_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  change_summary TEXT DEFAULT '',
  actor_id TEXT DEFAULT 'local-user',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (library_item_id) REFERENCES library_items(id)
);

CREATE INDEX IF NOT EXISTS idx_library_item_versions_item ON library_item_versions(library_item_id);

CREATE TABLE IF NOT EXISTS generation_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','adopted','expired','rejected')),
  proposal_json TEXT NOT NULL DEFAULT '{}',
  brief_json TEXT DEFAULT '{}',
  actor_id TEXT DEFAULT 'local-user',
  adopted_version_id TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  adopted_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_generation_proposals_project ON generation_proposals(project_id);

CREATE TABLE IF NOT EXISTS reference_sets (
  id TEXT PRIMARY KEY,
  project_id TEXT DEFAULT '',
  category TEXT NOT NULL CHECK(category IN ('product','person','store','visual_style')),
  name TEXT NOT NULL,
  asset_ids TEXT DEFAULT '[]',
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reference_sets_project ON reference_sets(project_id);
CREATE INDEX IF NOT EXISTS idx_reference_sets_category ON reference_sets(category);

CREATE TABLE IF NOT EXISTS asset_relations (
  id TEXT PRIMARY KEY,
  source_asset_id TEXT NOT NULL,
  generated_asset_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK(relation_type IN ('generated_from','derived_from','variant_of','composed_with')),
  recipe_id TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (source_asset_id) REFERENCES assets(id),
  FOREIGN KEY (generated_asset_id) REFERENCES assets(id)
);

CREATE INDEX IF NOT EXISTS idx_asset_relations_source ON asset_relations(source_asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_relations_generated ON asset_relations(generated_asset_id);

CREATE TABLE IF NOT EXISTS generation_artifacts (
  id TEXT PRIMARY KEY,
  segment_id TEXT DEFAULT '',
  render_job_id TEXT,
  recipe_id TEXT DEFAULT '',
  recipe_version TEXT DEFAULT '1',
  provider TEXT DEFAULT '',
  input_fingerprint TEXT DEFAULT '',
  source_asset_ids TEXT DEFAULT '[]',
  generated_asset_ids TEXT DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','completed','failed')),
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_generation_artifacts_segment ON generation_artifacts(segment_id);
CREATE INDEX IF NOT EXISTS idx_generation_artifacts_job ON generation_artifacts(render_job_id);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  shot_type TEXT DEFAULT '',
  brand_id TEXT DEFAULT '',
  platform TEXT DEFAULT '',
  mood TEXT DEFAULT '',
  reference_set_id TEXT DEFAULT '',
  prompt_template TEXT NOT NULL DEFAULT '',
  version TEXT DEFAULT '1',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recipes_shot_type ON recipes(shot_type);
