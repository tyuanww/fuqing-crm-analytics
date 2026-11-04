import client, { type ApiError } from './index'

// ── 第二入口 CSV / Excel 数据集 ──

/** 一列，dtype 为后端 DuckDB 物理类型。 */
export interface DatasetColumn {
  name: string
  dtype: string
}

/** 数据集元数据（POST /datasets、GET /datasets 返回）。 */
export interface DatasetMeta {
  id: string
  filename: string
  columns: DatasetColumn[]
  row_count: number
  byte_size: number
  created_at: string
  path: string
}

/** 数据集前 N 行预览，形态与查询结果一致。 */
export interface DatasetPreview {
  columns: string[]
  rows: unknown[][]
  truncated: boolean
}

/** GET /datasets/{id}：元数据 + preview。 */
export interface DatasetDetail extends DatasetMeta {
  preview: DatasetPreview
}

/** POST /query：只读查询结果。 */
export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  truncated: boolean
}

/** 后端错误体 detail 的形状：{"detail":{"error":CODE,"message":...}}。 */
interface SecondEntryErrorDetail {
  error?: string
  message?: string
}

/**
 * 从 ApiError 中取出后端的 message 原样展示。
 *
 * 统一错误拦截器把 `detail` 直接塞进 Error.message，但 second-entry 的
 * detail 是对象（会变成 "[object Object]"），所以这里优先读 detail.message，
 * 再退回字符串 detail / 顶层 message。
 */
export function secondEntryErrorMessage(error: unknown, fallback = '请求失败'): string {
  const apiError = error as Partial<ApiError> | null | undefined
  const detail = (apiError?.data as { detail?: unknown } | undefined)?.detail

  if (detail && typeof detail === 'object') {
    const message = (detail as SecondEntryErrorDetail).message
    if (typeof message === 'string' && message.trim()) return message
  }
  if (typeof detail === 'string' && detail.trim()) return detail
  if (typeof apiError?.message === 'string' && apiError.message.trim()) return apiError.message
  return fallback
}

export function uploadSecondEntryDataset(file: File): Promise<DatasetMeta> {
  const form = new FormData()
  form.append('file', file)
  return client.post('/second-entry/datasets', form)
}

export function listSecondEntryDatasets(): Promise<DatasetMeta[]> {
  return client.get('/second-entry/datasets')
}

export function getSecondEntryDataset(id: string): Promise<DatasetDetail> {
  return client.get(`/second-entry/datasets/${encodeURIComponent(id)}`)
}

export function querySecondEntryDataset(id: string, sql: string, limit?: number): Promise<QueryResult> {
  const body: { dataset_id: string; sql: string; limit?: number } = { dataset_id: id, sql }
  if (limit != null) body.limit = limit
  return client.post('/second-entry/query', body)
}
