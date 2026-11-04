<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  getSecondEntryDataset,
  listSecondEntryDatasets,
  querySecondEntryDataset,
  secondEntryErrorMessage,
  uploadSecondEntryDataset,
} from '@/api/secondEntry'
import type { DatasetDetail, DatasetMeta, QueryResult } from '@/api/secondEntry'

const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx']
const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_FILE_LABEL = '20 MiB'

// ── 数据集列表 ──
const datasets = ref<DatasetMeta[]>([])
const listLoading = ref(false)
const listError = ref('')

// ── 选中数据集 + 预览 ──
const selectedId = ref('')
const detail = ref<DatasetDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')

// ── 上传 ──
const uploading = ref(false)
const uploadError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

// ── 只读 SQL ──
const sql = ref('')
const querying = ref(false)
const queryResult = ref<QueryResult | null>(null)
const queryError = ref('')

const canRunQuery = computed(
  () => detail.value !== null && !querying.value && sql.value.trim().length > 0,
)

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function formatCell(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function resetFileInput() {
  if (fileInput.value) fileInput.value.value = ''
}

async function loadDatasets() {
  listLoading.value = true
  listError.value = ''
  try {
    datasets.value = await listSecondEntryDatasets()
    if (selectedId.value && !datasets.value.some((item) => item.id === selectedId.value)) {
      selectedId.value = ''
      detail.value = null
      queryResult.value = null
    }
  } catch (error) {
    listError.value = secondEntryErrorMessage(error, '数据集列表加载失败')
  } finally {
    listLoading.value = false
  }
}

async function selectDataset(dataset: DatasetMeta) {
  selectedId.value = dataset.id
  detail.value = null
  detailError.value = ''
  queryResult.value = null
  queryError.value = ''
  detailLoading.value = true
  try {
    detail.value = await getSecondEntryDataset(dataset.id)
  } catch (error) {
    detailError.value = secondEntryErrorMessage(error, '数据集详情加载失败')
  } finally {
    detailLoading.value = false
  }
}

function retrySelected() {
  const dataset = datasets.value.find((item) => item.id === selectedId.value)
  if (dataset) void selectDataset(dataset)
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  uploadError.value = ''
  const lowerName = file.name.toLowerCase()

  // 前端先拦一层：后端也会校验，但这里给即时反馈，避免白传 20 MiB。
  if (!ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
    uploadError.value = '仅支持 .csv 或 .xlsx 文件'
    resetFileInput()
    return
  }
  if (file.size > MAX_FILE_BYTES) {
    uploadError.value = `文件大小不能超过 ${MAX_FILE_LABEL}`
    resetFileInput()
    return
  }

  uploading.value = true
  try {
    const uploaded = await uploadSecondEntryDataset(file)
    await loadDatasets()
    await selectDataset(uploaded)
  } catch (error) {
    uploadError.value = secondEntryErrorMessage(error, '上传失败')
  } finally {
    uploading.value = false
    resetFileInput()
  }
}

async function runQuery() {
  if (!detail.value || !canRunQuery.value) return
  querying.value = true
  queryError.value = ''
  queryResult.value = null
  try {
    queryResult.value = await querySecondEntryDataset(detail.value.id, sql.value.trim())
  } catch (error) {
    queryError.value = secondEntryErrorMessage(error, '查询失败')
  } finally {
    querying.value = false
  }
}

onMounted(() => {
  void loadDatasets()
})
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="第二入口" subtitle="上传 CSV / Excel，用只读 SQL 自助取数" />

    <!-- 上传区 -->
    <section class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center gap-3">
        <label
          class="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors"
          :class="uploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-slate-700'"
        >
          <span>{{ uploading ? '上传中…' : '选择文件' }}</span>
          <input
            ref="fileInput"
            data-testid="file-input"
            type="file"
            accept=".csv,.xlsx"
            class="hidden"
            :disabled="uploading"
            @change="handleFileChange"
          />
        </label>
        <p class="text-xs text-slate-500">支持 .csv / .xlsx，单个文件不超过 20 MiB。</p>
      </div>
      <p
        v-if="uploadError"
        role="alert"
        data-testid="upload-error"
        class="mt-2 text-xs text-red-600"
      >
        {{ uploadError }}
      </p>
    </section>

    <div class="grid gap-5 lg:grid-cols-3">
      <!-- 数据集列表 -->
      <section class="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-1">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-slate-900">数据集</h3>
          <button
            type="button"
            class="text-xs text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-50"
            :disabled="listLoading"
            @click="loadDatasets"
          >
            刷新
          </button>
        </div>

        <LoadingState v-if="listLoading" description="正在加载数据集…" />
        <ErrorState
          v-else-if="listError"
          :message="listError"
          @retry="loadDatasets"
        />
        <EmptyState
          v-else-if="datasets.length === 0"
          description="还没有数据集，先上传一个 CSV / Excel 文件"
        />
        <ul v-else class="divide-y divide-slate-100">
          <li v-for="dataset in datasets" :key="dataset.id">
            <button
              type="button"
              data-testid="dataset-item"
              class="w-full rounded-md px-3 py-2 text-left transition-colors"
              :class="selectedId === dataset.id ? 'bg-slate-100' : 'hover:bg-slate-50'"
              :aria-pressed="selectedId === dataset.id"
              @click="selectDataset(dataset)"
            >
              <span class="block truncate text-xs font-medium text-slate-900" :title="dataset.filename">
                {{ dataset.filename }}
              </span>
              <span class="mt-1 block text-xs text-slate-500">
                {{ dataset.row_count }} 行 · {{ dataset.columns.length }} 列 ·
                {{ formatDateTime(dataset.created_at) }}
              </span>
            </button>
          </li>
        </ul>
      </section>

      <div class="space-y-5 lg:col-span-2">
        <!-- 元数据 + 预览 -->
        <section class="rounded-lg border border-slate-200 bg-white p-4">
          <LoadingState v-if="detailLoading" description="正在加载数据集详情…" />
          <ErrorState
            v-else-if="detailError"
            :message="detailError"
            @retry="retrySelected"
          />
          <EmptyState v-else-if="!detail" description="从左侧选择一个数据集查看元数据与预览" />

          <template v-else>
            <div class="mb-4">
              <h3 class="text-sm font-semibold text-slate-900">{{ detail.filename }}</h3>
              <p class="mt-1 text-xs text-slate-500">
                {{ detail.row_count }} 行 · {{ detail.columns.length }} 列 ·
                {{ formatBytes(detail.byte_size) }} · 创建于 {{ formatDateTime(detail.created_at) }}
              </p>
            </div>

            <p class="mb-2 text-xs font-medium text-slate-600">前 10 行预览</p>
            <div class="overflow-x-auto rounded-md border border-slate-100">
              <table class="min-w-full text-left text-xs">
                <thead class="bg-slate-50 text-slate-500">
                  <tr>
                    <th
                      v-for="column in detail.preview.columns"
                      :key="column"
                      class="whitespace-nowrap px-3 py-2 font-medium"
                    >
                      {{ column }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <tr v-for="(row, rowIndex) in detail.preview.rows" :key="rowIndex">
                    <td
                      v-for="(cell, cellIndex) in row"
                      :key="cellIndex"
                      class="whitespace-nowrap px-3 py-2 text-slate-700"
                    >
                      {{ formatCell(cell) }}
                    </td>
                  </tr>
                  <tr v-if="detail.preview.rows.length === 0">
                    <td
                      :colspan="detail.preview.columns.length || 1"
                      class="px-3 py-4 text-center text-slate-400"
                    >
                      暂无预览数据
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="detail.preview.truncated" class="mt-2 text-xs text-amber-600">
              预览已截断，仅展示前 {{ detail.preview.rows.length }} 行
            </p>
          </template>
        </section>

        <!-- 只读 SQL -->
        <section class="rounded-lg border border-slate-200 bg-white p-4">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-slate-900">只读 SQL</h3>
            <span class="text-xs text-slate-400">仅支持单条 SELECT / WITH，最多返回 5000 行</span>
          </div>

          <textarea
            v-model="sql"
            data-testid="sql-input"
            rows="4"
            class="w-full rounded-md border border-slate-200 p-3 font-mono text-xs text-slate-800 outline-none transition-colors focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
            placeholder="SELECT * FROM dataset LIMIT 100"
            :disabled="!detail || querying"
          />

          <div class="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="run-query"
              class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!canRunQuery"
              @click="runQuery"
            >
              {{ querying ? '查询中…' : '运行' }}
            </button>
            <span class="text-xs text-slate-400">
              {{ detail ? '只读查询，不会修改数据集' : '请先选择数据集' }}
            </span>
          </div>

          <p
            v-if="queryError"
            role="alert"
            data-testid="query-error"
            class="mt-2 text-xs text-red-600"
          >
            {{ queryError }}
          </p>

          <template v-if="queryResult">
            <div class="mt-3 overflow-x-auto rounded-md border border-slate-100">
              <table class="min-w-full text-left text-xs">
                <thead class="bg-slate-50 text-slate-500">
                  <tr>
                    <th
                      v-for="column in queryResult.columns"
                      :key="column"
                      class="whitespace-nowrap px-3 py-2 font-medium"
                    >
                      {{ column }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <tr v-for="(row, rowIndex) in queryResult.rows" :key="rowIndex">
                    <td
                      v-for="(cell, cellIndex) in row"
                      :key="cellIndex"
                      class="whitespace-nowrap px-3 py-2 text-slate-700"
                    >
                      {{ formatCell(cell) }}
                    </td>
                  </tr>
                  <tr v-if="queryResult.rows.length === 0">
                    <td
                      :colspan="queryResult.columns.length || 1"
                      class="px-3 py-4 text-center text-slate-400"
                    >
                      查询结果为空
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p
              v-if="queryResult.truncated"
              data-testid="truncated-hint"
              class="mt-2 text-xs text-amber-600"
            >
              结果已截断，仅返回前 {{ queryResult.rows.length }} 行
            </p>
          </template>
        </section>
      </div>
    </div>
  </div>
</template>
