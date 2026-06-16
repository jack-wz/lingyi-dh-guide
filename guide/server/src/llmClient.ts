import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getDataDir } from './db/database.js';

export interface LlmConfig {
  base_url: string;
  api_key: string;
  model: string;
}

function readLlmConfig(): LlmConfig | null {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseUrl = process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  if (apiKey) {
    return { base_url: baseUrl.replace(/\/$/, ''), api_key: apiKey, model };
  }

  const configPath = join(getDataDir(), 'config.json');
  if (!existsSync(configPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const llm = raw.models?.llm || raw.llm;
    if (!llm?.api_key) return null;
    return {
      base_url: String(llm.base_url || baseUrl).replace(/\/$/, ''),
      api_key: String(llm.api_key),
      model: String(llm.model || model),
    };
  } catch {
    return null;
  }
}

export async function llmChat(systemPrompt: string, userPrompt: string, temperature = 0.5): Promise<string> {
  const cfg = readLlmConfig();
  if (!cfg?.api_key) {
    throw new Error('LLM API key is not configured');
  }

  const res = await fetch(`${cfg.base_url}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM request failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('LLM returned empty content');
  return content;
}

export function isLlmConfigured(): boolean {
  return readLlmConfig() !== null;
}

export interface LlmDisplayInfo {
  configured: boolean;
  source: 'env' | 'config' | 'none';
  base_url: string;
  model: string;
  api_key_masked: string;
  used_for: string[];
}

export function getLlmDisplayInfo(): LlmDisplayInfo {
  const usedFor = ['润色口播 (/api/ai/polish-script)'];
  const envKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  const defaultBase = 'https://api.openai.com/v1';
  const defaultModel = process.env.LLM_MODEL || 'gpt-4o-mini';

  if (envKey) {
    return {
      configured: true,
      source: 'env',
      base_url: (process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || defaultBase).replace(/\/$/, ''),
      model: defaultModel,
      api_key_masked: `${envKey.slice(0, 6)}***`,
      used_for: usedFor,
    };
  }

  const cfg = readLlmConfig();
  if (!cfg) {
    return {
      configured: false,
      source: 'none',
      base_url: defaultBase,
      model: defaultModel,
      api_key_masked: '',
      used_for: usedFor,
    };
  }

  return {
    configured: true,
    source: 'config',
    base_url: cfg.base_url,
    model: cfg.model,
    api_key_masked: `${cfg.api_key.slice(0, 6)}***`,
    used_for: usedFor,
  };
}