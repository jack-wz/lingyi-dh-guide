export type AssetHubTab =
  | 'digital_human'
  | 'template'
  | 'brand'
  | 'voice'
  | 'script'
  | 'knowledge'
  | 'media';

export interface LibraryItem {
  id: string;
  category: string;
  name: string;
  description: string;
  status: string;
  tags: string[];
  file_url: string;
  parent_id?: string;
  payload: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  link?: string;
}

export interface LibrarySummary {
  counts: Record<string, number>;
  categories: string[];
}