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

export function assetHubHref(editorId: string, tab?: string): string {
  const params = new URLSearchParams();
  if (tab) params.set('tab', tab);
  params.set('from', `/editor/${editorId}`);
  const q = params.toString();
  return `/assets?${q}`;
}