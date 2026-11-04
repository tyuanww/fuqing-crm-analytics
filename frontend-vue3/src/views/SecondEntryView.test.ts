import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  uploadSecondEntryDataset: vi.fn(),
  listSecondEntryDatasets: vi.fn(),
  getSecondEntryDataset: vi.fn(),
  querySecondEntryDataset: vi.fn(),
}))

// 只替换网络函数，保留 secondEntryErrorMessage 的真实实现（错误 message 原样展示）。
vi.mock('@/api/secondEntry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/secondEntry')>()
  return { ...actual, ...api }
})

vi.mock('@/components/PageHeader.vue', () => ({
  default: {
    props: ['title', 'subtitle'],
    template: '<div data-testid="page-header">{{ title }}</div>',
  },
}))

vi.mock('@/components/LoadingState.vue', () => ({
  default: {
    props: ['description'],
    template: '<div data-testid="loading-state">{{ description }}</div>',
  },
}))

vi.mock('@/components/EmptyState.vue', () => ({
  default: {
    props: ['description'],
    template: '<div data-testid="empty-state">{{ description }}</div>',
  },
}))

vi.mock('@/components/ErrorState.vue', () => ({
  default: {
    props: ['message', 'status'],
    emits: ['retry'],
    template: '<div data-testid="error-state">{{ message }}</div>',
  },
}))

import SecondEntryView from './SecondEntryView.vue'
import type { DatasetDetail, DatasetMeta } from '@/api/secondEntry'

const datasetA: DatasetMeta = {
  id: 'a'.repeat(32),
  filename: 'orders.csv',
  columns: [
    { name: 'order_id', dtype: 'VARCHAR' },
    { name: 'qty', dtype: 'BIGINT' },
  ],
  row_count: 2,
  byte_size: 2048,
  created_at: '2026-11-04T10:00:00Z',
  path: '/tmp/second-entry/a.csv',
}

const detailA: DatasetDetail = {
  ...datasetA,
  preview: {
    columns: ['order_id', 'qty'],
    rows: [
      ['A-1', 2],
      ['A-2', 3],
    ],
    truncated: false,
  },
}

type Wrapper = ReturnType<typeof mount>

async function pickFile(wrapper: Wrapper, file: File) {
  const input = wrapper.find('[data-testid="file-input"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

async function mountAndSelectFirst() {
  const wrapper = mount(SecondEntryView)
  await flushPromises()
  await wrapper.find('[data-testid="dataset-item"]').trigger('click')
  await flushPromises()
  return wrapper
}

describe('SecondEntryView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.listSecondEntryDatasets.mockResolvedValue([datasetA])
    api.getSecondEntryDataset.mockResolvedValue(detailA)
  })

  it('上传成功后刷新列表并选中新数据集', async () => {
    const uploaded: DatasetMeta = {
      ...datasetA,
      id: 'b'.repeat(32),
      filename: 'new.xlsx',
    }
    api.listSecondEntryDatasets
      .mockResolvedValueOnce([datasetA])
      .mockResolvedValueOnce([uploaded, datasetA])
    api.uploadSecondEntryDataset.mockResolvedValue(uploaded)
    api.getSecondEntryDataset.mockResolvedValue({
      ...uploaded,
      preview: { columns: [], rows: [], truncated: false },
    })

    const wrapper = mount(SecondEntryView)
    await flushPromises()
    expect(api.listSecondEntryDatasets).toHaveBeenCalledTimes(1)

    const file = new File(['id,qty\nA-1,2\n'], 'new.xlsx')
    await pickFile(wrapper, file)

    expect(api.uploadSecondEntryDataset).toHaveBeenCalledWith(file)
    expect(api.listSecondEntryDatasets).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('new.xlsx')
    expect(api.getSecondEntryDataset).toHaveBeenCalledWith(uploaded.id)
  })

  it('选中数据集后渲染元数据与前 10 行预览', async () => {
    const wrapper = await mountAndSelectFirst()

    expect(api.getSecondEntryDataset).toHaveBeenCalledWith(datasetA.id)

    const text = wrapper.text()
    expect(text).toContain('orders.csv')
    expect(text).toContain('order_id')
    expect(text).toContain('A-1')
    expect(text).toContain('A-2')
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false)
  })

  it('运行只读 SQL 后渲染结果，truncated 时给出截断提示', async () => {
    api.querySecondEntryDataset.mockResolvedValue({
      columns: ['order_id', 'qty'],
      rows: [['A-1', 2]],
      truncated: true,
    })

    const wrapper = await mountAndSelectFirst()
    await wrapper.find('[data-testid="sql-input"]').setValue('select order_id, qty from dataset')
    await wrapper.find('[data-testid="run-query"]').trigger('click')
    await flushPromises()

    expect(api.querySecondEntryDataset).toHaveBeenCalledWith(
      datasetA.id,
      'select order_id, qty from dataset',
    )
    expect(wrapper.text()).toContain('A-1')
    expect(wrapper.find('[data-testid="truncated-hint"]').text()).toContain('截断')
  })

  it('SQL 错误按后端 message 原样展示', async () => {
    const error = Object.assign(new Error('[object Object]'), {
      status: 400,
      data: { detail: { error: 'SQL_NOT_ALLOWED', message: '仅允许单条 SELECT / WITH 查询' } },
    })
    api.querySecondEntryDataset.mockRejectedValue(error)

    const wrapper = await mountAndSelectFirst()
    await wrapper.find('[data-testid="sql-input"]').setValue('delete from dataset')
    await wrapper.find('[data-testid="run-query"]').trigger('click')
    await flushPromises()

    const alert = wrapper.find('[data-testid="query-error"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toBe('仅允许单条 SELECT / WITH 查询')
  })

  it('拒绝非 CSV/Excel 文件与超过 20 MiB 的文件', async () => {
    const wrapper = mount(SecondEntryView)
    await flushPromises()

    await pickFile(wrapper, new File(['x'], 'notes.txt'))
    expect(wrapper.find('[data-testid="upload-error"]').text()).toContain('.csv')
    expect(api.uploadSecondEntryDataset).not.toHaveBeenCalled()

    const oversized = new File(['x'], 'big.xlsx')
    Object.defineProperty(oversized, 'size', { value: 20 * 1024 * 1024 + 1 })
    await pickFile(wrapper, oversized)

    expect(wrapper.find('[data-testid="upload-error"]').text()).toContain('20 MiB')
    expect(api.uploadSecondEntryDataset).not.toHaveBeenCalled()
  })
})
