export interface ApiErrorBody {
  error?: string;
  error_code?: string;
  remediation?: string;
  doc_url?: string;
}

export async function parseApiErrorResponse(res: Response): Promise<ApiErrorBody> {
  try {
    const data = (await res.json()) as ApiErrorBody;
    if (data && typeof data === 'object') return data;
  } catch {
    /* ignore */
  }
  return { error: res.statusText || `HTTP ${res.status}` };
}

export function formatApiErrorMessage(body: ApiErrorBody, fallback = '请求失败'): string {
  const code = body.error_code ? `[${body.error_code}] ` : '';
  const msg = body.error || fallback;
  const hint = body.remediation ? `\n${body.remediation}` : '';
  return `${code}${msg}${hint}`;
}

export async function throwIfNotOk(res: Response, fallback = '请求失败'): Promise<void> {
  if (res.ok) return;
  const body = await parseApiErrorResponse(res);
  throw Object.assign(new Error(formatApiErrorMessage(body, fallback)), { apiError: body });
}