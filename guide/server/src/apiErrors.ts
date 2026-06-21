import type { Response } from 'express';

export const ErrorCodes = {
  VALIDATION: 'G001',
  TEMPLATE_NOT_FOUND: 'G002',
  DH_NOT_FOUND: 'G003',
  DH_NOT_READY: 'G004',
  PIPELINE_INVALID: 'G005',
  INPUT_INVALID: 'G006',
  JOB_NOT_FOUND: 'G007',
  JOB_CONFLICT: 'G008',
  WORKER_UNAVAILABLE: 'G009',
  NOT_FOUND: 'G010',
  INTERNAL: 'G011',
  LIBRARY_NOT_FOUND: 'G012',
  ASSETS_INCOMPLETE: 'G013',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface ApiErrorBody {
  error: string;
  error_code: ErrorCode | string;
  remediation?: string;
  doc_url?: string;
}

type ErrorMeta = { remediation: string; doc_path?: string };

export const ERROR_CATALOG: Record<ErrorCode, ErrorMeta> = {
  [ErrorCodes.VALIDATION]: {
    remediation: '检查请求体必填字段（如 template_id、digital_human_id）。',
    doc_path: 'guide/docs/INTEGRATOR_QUICKSTART.md',
  },
  [ErrorCodes.TEMPLATE_NOT_FOUND]: {
    remediation: '确认 template_id 存在：GET /api/templates；或使用 smoke 模板 ID。',
    doc_path: 'guide/docs/INTEGRATOR_QUICKSTART.md#4-hello-world--提交渲染',
  },
  [ErrorCodes.DH_NOT_FOUND]: {
    remediation: '在数字人列表确认 ID，或先 POST /api/digital-humans 创建。',
    doc_path: 'guide/README.md',
  },
  [ErrorCodes.DH_NOT_READY]: {
    remediation: '等待数字人训练完成（status=ready），或补齐素材后重新训练。',
    doc_path: 'guide/README.md',
  },
  [ErrorCodes.PIPELINE_INVALID]: {
    remediation:
      '使用 GET /api/renders/pipelines 查看可用 pipeline_key；选型见 guide/docs/INTEGRATOR_QUICKSTART.md §9.1。',
    doc_path: 'guide/docs/PIPELINE_CODE_INDEX.md',
  },
  [ErrorCodes.INPUT_INVALID]: {
    remediation: '检查 input_mode 与 topic/script_text 是否匹配。',
  },
  [ErrorCodes.JOB_NOT_FOUND]: {
    remediation: '确认 render job id；任务可能已被删除。',
  },
  [ErrorCodes.JOB_CONFLICT]: {
    remediation: '稍后重试轮询 GET /api/renders/next，或检查 worker 是否在运行。',
  },
  [ErrorCodes.WORKER_UNAVAILABLE]: {
    remediation: '确认 GUIDE_WORKER_ENABLED=true，查看 guide/data/worker.log。',
    doc_path: 'guide/docs/INTEGRATOR_QUICKSTART.md#6-故障排查',
  },
  [ErrorCodes.NOT_FOUND]: {
    remediation: '确认资源 ID 与 API 路径是否正确。',
  },
  [ErrorCodes.INTERNAL]: {
    remediation: '查看服务端日志；若为配置问题先运行 verify_providers.py。',
    doc_path: 'guide/docs/INTEGRATOR_QUICKSTART.md#6-故障排查',
  },
  [ErrorCodes.LIBRARY_NOT_FOUND]: {
    remediation: '在资产库刷新列表，或检查 library item id。',
  },
  [ErrorCodes.ASSETS_INCOMPLETE]: {
    remediation: '补齐数字人必填素材：大头/半身/全身照片与声音样本。',
  },
};

export function apiError(
  res: Response,
  code: ErrorCode,
  message: string,
  status = 400,
  extra?: Partial<Pick<ApiErrorBody, 'remediation' | 'doc_url'>> & Record<string, unknown>,
) {
  const meta = ERROR_CATALOG[code];
  const { remediation, doc_url, ...rest } = extra ?? {};
  const body: ApiErrorBody & Record<string, unknown> = {
    error: message,
    error_code: code,
    remediation: (remediation as string | undefined) ?? meta?.remediation,
    doc_url: (doc_url as string | undefined) ?? (meta?.doc_path ? `/${meta.doc_path}` : undefined),
    ...rest,
  };
  return res.status(status).json(body);
}

export function apiErrorFromMessage(
  res: Response,
  message: string,
  status = 500,
  code: ErrorCode = ErrorCodes.INTERNAL,
) {
  return apiError(res, code, message, status);
}

export function parseStoredError(errorMessage: string): { error_code: string | null; error_message: string } {
  const raw = String(errorMessage || '').trim();
  const match = raw.match(/^\[([A-Z][A-Z0-9_]*)\]\s*(.*)$/s);
  if (match) {
    return { error_code: match[1], error_message: match[2] || raw };
  }
  return { error_code: null, error_message: raw };
}

export function formatStoredError(code: ErrorCode | string, message: string): string {
  return `[${code}] ${message}`;
}

export function listErrorCatalog(): Array<{ code: ErrorCode; remediation: string; doc_path?: string }> {
  return (Object.entries(ERROR_CATALOG) as Array<[ErrorCode, ErrorMeta]>).map(([code, meta]) => ({
    code,
    remediation: meta.remediation,
    doc_path: meta.doc_path,
  }));
}