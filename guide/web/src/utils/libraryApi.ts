import type { LibraryItem } from '../types/library';
import { parseApiErrorResponse, formatApiErrorMessage } from './apiError';

export type LibraryCategory = 'script' | 'media' | 'voice' | 'digital_human' | 'brand' | 'look_preset';

export interface FetchLibraryOptions {
  category?: LibraryCategory;
  limit?: number;
  q?: string;
  subType?: string;
  signal?: AbortSignal;
}

export async function fetchLibraryItems(options: FetchLibraryOptions = {}): Promise<LibraryItem[]> {
  const params = new URLSearchParams();
  if (options.category) params.set('category', options.category);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.q?.trim()) params.set('q', options.q.trim());
  if (options.subType) params.set('sub_type', options.subType);
  const res = await fetch(`/api/library?${params}`, { signal: options.signal });
  if (!res.ok) {
    const body = await parseApiErrorResponse(res);
    throw new Error(formatApiErrorMessage(body, '加载资产库失败'));
  }
  const data = await res.json() as { items?: LibraryItem[] };
  return data.items || [];
}

export function libraryBgmItems(items: LibraryItem[]): LibraryItem[] {
  return items.filter((item) => String(item.payload?.kind) === 'bgm' && item.file_url);
}

export function libraryTtsItems(items: LibraryItem[]): LibraryItem[] {
  return items.filter((item) => item.payload?.voice_id && String(item.payload?.kind) !== 'bgm');
}

export function libraryMediaItems(items: LibraryItem[]): LibraryItem[] {
  return items.filter((item) => Boolean(item.file_url));
}

export async function fetchLibraryItem(id: string, signal?: AbortSignal): Promise<LibraryItem | null> {
  const res = await fetch(`/api/library/${id}`, { signal });
  if (!res.ok) return null;
  return res.json() as Promise<LibraryItem>;
}

export function assetHubHref(editorId: string, tab?: string, opts?: { segmentId?: string; slot?: string }): string {
  const params = new URLSearchParams();
  if (tab) params.set('tab', tab);
  params.set('from', `/editor/${editorId}`);
  if (opts?.segmentId) params.set('segment_id', opts.segmentId);
  if (opts?.slot) params.set('slot', opts.slot);
  const q = params.toString();
  return `/assets?${q}`;
}

export interface WorkbenchFilters {
  group?: string;
  scope?: 'enterprise' | 'project' | 'all';
  category?: string;
  search?: string;
  kind?: string;
  usage_status?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export async function fetchWorkbenchAssets(opts: WorkbenchFilters = {}): Promise<{
  items: any[]; total: number; limit: number; offset: number;
  categories: Record<string, number>; available_categories: string[];
  available_groups: { id: string; categories: string[] }[];
}> {
  const params = new URLSearchParams();
  if (opts.group) params.set('group', opts.group);
  if (opts.scope) params.set('scope', opts.scope);
  if (opts.category) params.set('category', opts.category);
  if (opts.search) params.set('search', opts.search);
  if (opts.kind) params.set('kind', opts.kind);
  if (opts.usage_status) params.set('usage_status', opts.usage_status);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const res = await fetch(`/api/assets/workbench?${params}`, { signal: opts.signal });
  if (!res.ok) {
    const body = await parseApiErrorResponse(res);
    throw new Error(formatApiErrorMessage(body, '加载工作台资产失败'));
  }
  return res.json();
}