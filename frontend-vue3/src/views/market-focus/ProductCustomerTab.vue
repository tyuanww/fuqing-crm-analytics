<script setup lang="ts">
import { computed, h } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { NAlert, NDataTable } from 'naive-ui'
import type { DataTableColumns, DataTableColumn } from 'naive-ui'
import {
  fetchCategoryOverviewBatch,
  fetchProductCustomerBatch,
} from '@/api/category'
import { fetchProductAssets } from '@/api/marketFocus'
import { useFilterStore } from '@/stores/filterStore'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import EmptyState from '@/components/EmptyState.vue'
import ExportToolbar from '@/components/ExportToolbar.vue'
import type { XlsxColumn } from '@/utils/exportXlsx'
import LineChart from '@/components/LineChart.vue'
import { buildProductCustomerTableRows, joinProductCustomerWeeks, type ProductWeekResult, type TableRow } from './product-customer-rows'

const props = defineProps<{ weeks: number; channel?: string }>()
const filterStore = useFilterStore()

import { LOW_PRICE_CHANNELS } from '@/constants/channels'

const {
  data: productAssetsData,
  isLoading: productAssetsLoading,
  error: productAssetsError,
  refetch: refetchProductAssets,
} = useQuery({
  queryKey: ['product-assets', props.weeks],
  queryFn: () => fetchProductAssets(props.weeks),
  staleTime: 5 * 60 * 1000,
})

function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function getDaysDateRange(days: number, endDate: string): string[] {
  const result: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    result.push(shiftIsoDate(endDate, -i))
  }
  return result
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const weekRanges = computed(() => {
  const weeks = productAssetsData.value?.products[0]?.weeks ?? []
  return weeks
    .filter(week => Boolean(week.week_end_date))
    .map(week => ({
      start: shiftIsoDate(week.week_end_date, -6),
      end: week.week_end_date,
      label: week.week_label,
    }))
})
const latestCoverageDate = computed(() => weekRanges.value.at(-1)?.end ?? null)
const dailyDates = computed(() => latestCoverageDate.value
  ? getDaysDateRange(props.weeks * 7, latestCoverageDate.value)
  : [])
const selectedChannel = computed(() => props.channel === '全店' || !props.channel ? undefined : props.channel)
const excludedChannels = computed(() => filterStore.excludeLowPrice ? LOW_PRICE_CHANNELS : undefined)

const { data: dayResults } = useQuery({
  queryKey: computed(() => ['product-customer-daily', dailyDates.value, selectedChannel.value, filterStore.excludeLowPrice]),
  enabled: computed(() => dailyDates.value.length > 0),
  queryFn: () => {
    const dates = dailyDates.value
    return fetchCategoryOverviewBatch({
      ranges: dates.map(date => ({ start_date: date, end_date: date })),
      level: 'class',
      metric_type: 'GSV',
      channel: selectedChannel.value,
      exclude_channels: excludedChannels.value,
    }).then(res => res.results.map((r, i) => ({
      rows: r.all_rows,
      ttl: r.all_ttl,
      date: dates[i],
    })))
  },
  staleTime: 5 * 60 * 1000,
})

const { data: weekResults, isLoading, error, refetch } = useQuery({
  queryKey: computed(() => [
    'product-customer-weekly',
    weekRanges.value.map(range => [range.start, range.end]),
    selectedChannel.value,
    filterStore.excludeLowPrice,
  ]),
  enabled: computed(() => weekRanges.value.length > 0),
  queryFn: async (): Promise<ProductWeekResult[]> => {
    const ranges = weekRanges.value
    const [overviews, customers] = await Promise.all([
      fetchCategoryOverviewBatch({
        ranges: ranges.map(r => ({ start_date: r.start, end_date: r.end })),
        level: 'class',
        metric_type: 'GSV',
        channel: selectedChannel.value,
        exclude_channels: excludedChannels.value,
      }),
      fetchProductCustomerBatch({
        ranges: ranges.map(range => ({
          start_date: range.start,
          end_date: range.end,
          channel: selectedChannel.value,
          exclude_channels: excludedChannels.value,
        })),
      }),
    ])
    return joinProductCustomerWeeks(ranges, overviews.results, customers.results)
  },
  staleTime: 5 * 60 * 1000,
})

const productMapping = computed(() => {
  const catalog = weekResults.value?.[0]?.customer.products ?? []
  const displayByName = new Map(catalog.map(product => [product.name, product.display_name]))
  return (productAssetsData.value?.products ?? []).map(product => ({
    name: product.name,
    displayName: displayByName.get(product.name) ?? '未映射商品',
    spu_classes: product.spu_classes,
  }))
})

const groupedData = computed(() => buildProductCustomerTableRows(weekResults.value ?? []))

const tableData = computed((): TableRow[] => {
  return groupedData.value.flatMap(g => g.rows)
})

const chartDayLabels = computed(() => {
  const results = dayResults.value
  if (!results?.length) return []
  return results.map(r => getDayLabel(r!.date))
})

const newRatioSeries = computed(() => {
  const results = dayResults.value
  if (!results?.length) return []
  const mapping = productMapping.value
  const series: { name: string; data: number[] }[] = []
  series.push({
    name: '全店',
    data: results.map(r => {
      const ttl = r!.ttl
      return ttl.gsv > 0 ? +(ttl.new_gsv / ttl.gsv * 100).toFixed(1) : 0
    }),
  })
  for (const product of mapping) {
    series.push({
      name: product.displayName,
      data: results.map(r => {
        const matchingRows = r!.rows.filter(row => product.spu_classes.includes(row.name))
        const gsv = matchingRows.reduce((s, r) => s + r.gsv, 0)
        const new_gsv = matchingRows.reduce((s, r) => s + r.new_gsv, 0)
        return gsv > 0 ? +(new_gsv / gsv * 100).toFixed(1) : 0
      }),
    })
  }
  return series
})

const oldRatioSeries = computed(() => {
  const results = dayResults.value
  if (!results?.length) return []
  const mapping = productMapping.value
  const series: { name: string; data: number[] }[] = []
  series.push({
    name: '全店',
    data: results.map(r => {
      const ttl = r!.ttl
      return ttl.gsv > 0 ? +(ttl.old_gsv / ttl.gsv * 100).toFixed(1) : 0
    }),
  })
  for (const product of mapping) {
    series.push({
      name: product.displayName,
      data: results.map(r => {
        const matchingRows = r!.rows.filter(row => product.spu_classes.includes(row.name))
        const gsv = matchingRows.reduce((s, r) => s + r.gsv, 0)
        const old_gsv = matchingRows.reduce((s, r) => s + r.old_gsv, 0)
        return gsv > 0 ? +(old_gsv / gsv * 100).toFixed(1) : 0
      }),
    })
  }
  return series
})

const rowSpanMap = computed(() => {
  const map = new Map<string, { firstIdx: number; span: number }>()
  let currentIdx = 0
  for (const group of groupedData.value) {
    for (let i = 0; i < group.rows.length; i++) {
      const row = group.rows[i]
      if (i === 0) {
        map.set(row.id, { firstIdx: currentIdx, span: group.rows.length })
      } else {
        map.set(row.id, { firstIdx: currentIdx, span: 0 })
      }
      currentIdx++
    }
  }
  return map
})

// span-method：合并产品列（Naive UI 正确签名）
function spanMethod(rowData: object, rowIndex: number, column: DataTableColumn & { key?: string }) {
  const row = rowData as TableRow
  if (column.key === 'product') {
    const info = rowSpanMap.value.get(row.id)
    if (info) {
      if (rowIndex === info.firstIdx) {
        return { rowspan: info.span, colspan: 1 }
      } else {
        return { rowspan: 0, colspan: 0 }
      }
    }
  }
  return { rowspan: 1, colspan: 1 }
}

function fmtNumber(v: number, opts?: { minFractionDigits?: number; threshold?: number; suffix?: string }): string {
  const threshold = opts?.threshold ?? 10000
  const suffix = opts?.suffix ?? '万'
  const minFrac = opts?.minFractionDigits ?? 0
  const abs = Math.abs(v)
  if (abs >= threshold) {
    const sign = v < 0 ? '-' : ''
    return `${sign}${(abs / threshold).toFixed(1)}${suffix}`
  }
  return v.toLocaleString(undefined, { minimumFractionDigits: minFrac, maximumFractionDigits: minFrac })
}

function fmtMoney(v: number): string {
  return fmtNumber(v, { threshold: 10000, suffix: '万' })
}

function fmtAus(v: number): string {
  return fmtNumber(v, { threshold: 10000, suffix: '万', minFractionDigits: 1 })
}

function fmtInt(v: number): string {
  return v.toLocaleString()
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function fmtYoy(v: number): string {
  const sign = v > 0 ? '+' : ''
  // caller 已 *100 传 percentage 数值, pass-through
  return `${sign}${v.toFixed(1)}%`
}

function fmtPctChange(v: number): string {
  const sign = v > 0 ? '+' : ''
  // caller 已 *100 传 pp 数值, pass-through
  return `${sign}${v.toFixed(1)}pp`
}

function changeClass(v: number | null): string {
  if (v !== null && v > 0) return 'text-rose-500'
  if (v !== null && v < 0) return 'text-emerald-500'
  return 'text-slate-400'
}

type Row = TableRow

type ComparisonKey =
  | 'gsv_yoy_pct'
  | 'new_gsv_yoy_pct'
  | 'old_gsv_yoy_pct'
  | 'users_yoy_pct'
  | 'new_users_yoy_pct'
  | 'old_users_yoy_pct'
  | 'aus_yoy_pct'
  | 'new_aus_yoy_pct'
  | 'old_aus_yoy_pct'
  | 'new_ratio_gsv_yoy_pp'
  | 'old_ratio_gsv_yoy_pp'
  | 'new_ratio_users_yoy_pp'
  | 'old_ratio_users_yoy_pp'

function _cmpVal(row: TableRow, yoyKey: ComparisonKey): number | null {
  if (!row.isChangeRow && !row.isYoyRow) return null
  return row[yoyKey] ?? null
}

function comparisonCell(row: TableRow, key: ComparisonKey, format: (value: number) => string) {
  const value = _cmpVal(row, key)
  return h('span', { class: changeClass(value) }, value === null ? '—' : format(value))
}

const columns: DataTableColumns<Row> = [
  {
    title: '产品',
    key: 'product',
    width: 100,
    fixed: 'left',
    align: 'center',
  },
  {
    title: '时间',
    key: 'weekLabel',
    width: 110,
    align: 'center',
  },
  {
    title: 'GSV\n(本周对比为%)',
    key: 'gsv',
    width: 95,
    align: 'right',
    render: (row) => row.isChangeRow || row.isYoyRow
      ? comparisonCell(row, 'gsv_yoy_pct', value => fmtYoy(value * 100))
      : fmtMoney(row.gsv),
  },
  {
    title: '新客GSV\n(本周对比为%)',
    key: 'new_gsv',
    width: 95,
    align: 'right',
    render: (row) => row.isChangeRow || row.isYoyRow
      ? comparisonCell(row, 'new_gsv_yoy_pct', value => fmtYoy(value * 100))
      : fmtMoney(row.new_gsv),
  },
  {
    title: '老客GSV\n(本周对比为%)',
    key: 'old_gsv',
    width: 95,
    align: 'right',
    render: (row) => row.isChangeRow || row.isYoyRow
      ? comparisonCell(row, 'old_gsv_yoy_pct', value => fmtYoy(value * 100))
      : fmtMoney(row.old_gsv),
  },
  {
    title: '总客户数\n(本周对比为%)',
    key: 'users',
    width: 85,
    align: 'right',
    render: (row) => row.isChangeRow || row.isYoyRow
      ? comparisonCell(row, 'users_yoy_pct', value => fmtYoy(value * 100))
      : fmtInt(row.users),
  },
  {
    title: '新客数\n(本周对比为%)',
    key: 'new_users',
    width: 75,
    align: 'right',
    render: (row) => row.isChangeRow || row.isYoyRow
      ? comparisonCell(row, 'new_users_yoy_pct', value => fmtYoy(value * 100))
      : fmtInt(row.new_users),
  },
  {
    title: '老客数\n(本周对比为%)',
    key: 'old_users',
    width: 75,
    align: 'right',
    render: (row) => row.isChangeRow || row.isYoyRow
      ? comparisonCell(row, 'old_users_yoy_pct', value => fmtYoy(value * 100))
      : fmtInt(row.old_users),
  },
  {
    title: '总客单价\n(本周对比为%)',
    key: 'aus',
    width: 85,
    align: 'right',
    render: (row) => row.isChangeRow || row.isYoyRow
      ? comparisonCell(row, 'aus_yoy_pct', value => fmtYoy(value * 100))
      : fmtAus(row.aus),
  },
  {
    title: '新客客单价\n(本周对比为%)',
    key: 'new_aus',
    width: 90,
    align: 'right',
    render: (row) => row.isChangeRow || row.isYoyRow
      ? comparisonCell(row, 'new_aus_yoy_pct', value => fmtYoy(value * 100))
      : fmtAus(row.new_aus),
  },
  {
    title: '老客客单价\n(本周对比为%)',
    key: 'old_aus',
    width: 90,
    align: 'right',
    render: (row) => row.isChangeRow || row.isYoyRow
      ? comparisonCell(row, 'old_aus_yoy_pct', value => fmtYoy(value * 100))
      : fmtAus(row.old_aus),
  },
  {
    title: '新客成交占比\n(本周对比为pp)',
    key: 'new_ratio_gsv',
    width: 100,
    align: 'right',
    render: (row) => row.isChangeRow || row.isYoyRow
      ? comparisonCell(row, 'new_ratio_gsv_yoy_pp', value => fmtPctChange(value * 100))
      : fmtPct(row.new_ratio_gsv),
  },
  {
    title: '老客成交占比\n(本周对比为pp)',
    key: 'old_ratio_gsv',
    width: 100,
    align: 'right',
    render: (row) => row.isChangeRow || row.isYoyRow
      ? comparisonCell(row, 'old_ratio_gsv_yoy_pp', value => fmtPctChange(value * 100))
      : fmtPct(row.old_ratio_gsv),
  },
  {
    title: '新客人数占比\n(本周对比为pp)',
    key: 'new_ratio_users',
    width: 100,
    align: 'right',
    render: (row) => row.isChangeRow || row.isYoyRow
      ? comparisonCell(row, 'new_ratio_users_yoy_pp', value => fmtPctChange(value * 100))
      : fmtPct(row.new_ratio_users),
  },
  {
    title: '老客人数占比\n(本周对比为pp)',
    key: 'old_ratio_users',
    width: 100,
    align: 'right',
    render: (row) => row.isChangeRow || row.isYoyRow
      ? comparisonCell(row, 'old_ratio_users_yoy_pp', value => fmtPctChange(value * 100))
      : fmtPct(row.old_ratio_users),
  },
]

function rowClassName(row: TableRow): string {
  if (row.isChangeRow) return 'bg-violet-50/50'
  if (row.isYoyRow) return 'bg-amber-50/50'
  return ''
}

const productCustomerXlsxColumns = computed<XlsxColumn[]>(() => [
  { header: '产品', key: 'product', kind: 'text', width: 14 },
  { header: '时间', key: 'weekLabel', kind: 'text', width: 14 },
  {
    header: 'GSV', key: 'gsv', kind: 'number', width: 14, numFmt: '¥#,##0',
    formatValue: (val, row) => {
      if (row?.isChangeRow || row?.isYoyRow) {
        return { val: row.gsv_yoy_pct ?? null, numFmt: '+0.00%;-0.00%;0.00%' }
      }
      return val
    },
  },
  {
    header: '新客GSV', key: 'new_gsv', kind: 'number', width: 14, numFmt: '¥#,##0',
    formatValue: (val, row) => {
      if (row?.isChangeRow || row?.isYoyRow) {
        return { val: row.new_gsv_yoy_pct ?? null, numFmt: '+0.00%;-0.00%;0.00%' }
      }
      return val
    },
  },
  {
    header: '老客GSV', key: 'old_gsv', kind: 'number', width: 14, numFmt: '¥#,##0',
    formatValue: (val, row) => {
      if (row?.isChangeRow || row?.isYoyRow) {
        return { val: row.old_gsv_yoy_pct ?? null, numFmt: '+0.00%;-0.00%;0.00%' }
      }
      return val
    },
  },
  {
    header: '总客户数', key: 'users', kind: 'number', width: 14, numFmt: '#,##0',
    formatValue: (val, row) => {
      if (row?.isChangeRow || row?.isYoyRow) {
        return { val: row.users_yoy_pct ?? null, numFmt: '+0.00%;-0.00%;0.00%' }
      }
      return val
    },
  },
  {
    header: '新客数', key: 'new_users', kind: 'number', width: 12, numFmt: '#,##0',
    formatValue: (val, row) => {
      if (row?.isChangeRow || row?.isYoyRow) {
        return { val: row.new_users_yoy_pct ?? null, numFmt: '+0.00%;-0.00%;0.00%' }
      }
      return val
    },
  },
  {
    header: '老客数', key: 'old_users', kind: 'number', width: 12, numFmt: '#,##0',
    formatValue: (val, row) => {
      if (row?.isChangeRow || row?.isYoyRow) {
        return { val: row.old_users_yoy_pct ?? null, numFmt: '+0.00%;-0.00%;0.00%' }
      }
      return val
    },
  },
  {
    header: '总客单价', key: 'aus', kind: 'number', width: 14, numFmt: '¥#,##0',
    formatValue: (val, row) => {
      if (row?.isChangeRow || row?.isYoyRow) {
        return { val: row.aus_yoy_pct ?? null, numFmt: '+0.00%;-0.00%;0.00%' }
      }
      return val
    },
  },
  {
    header: '新客客单价', key: 'new_aus', kind: 'number', width: 14, numFmt: '¥#,##0',
    formatValue: (val, row) => {
      if (row?.isChangeRow || row?.isYoyRow) {
        return { val: row.new_aus_yoy_pct ?? null, numFmt: '+0.00%;-0.00%;0.00%' }
      }
      return val
    },
  },
  {
    header: '老客客单价', key: 'old_aus', kind: 'number', width: 14, numFmt: '¥#,##0',
    formatValue: (val, row) => {
      if (row?.isChangeRow || row?.isYoyRow) {
        return { val: row.old_aus_yoy_pct ?? null, numFmt: '+0.00%;-0.00%;0.00%' }
      }
      return val
    },
  },
  {
    header: '新客成交占比', key: 'new_ratio_gsv', kind: 'number', width: 14, numFmt: '0.0%',
    formatValue: (val, row) => {
      if (row?.isChangeRow || row?.isYoyRow) {
        return { val: row.new_ratio_gsv_yoy_pp ?? null, numFmt: '+0.00"pp";-0.00"pp";0.00"pp"' }
      }
      return val
    },
  },
  {
    header: '老客成交占比', key: 'old_ratio_gsv', kind: 'number', width: 14, numFmt: '0.0%',
    formatValue: (val, row) => {
      if (row?.isChangeRow || row?.isYoyRow) {
        return { val: row.old_ratio_gsv_yoy_pp ?? null, numFmt: '+0.00"pp";-0.00"pp";0.00"pp"' }
      }
      return val
    },
  },
  {
    header: '新客人数占比', key: 'new_ratio_users', kind: 'number', width: 14, numFmt: '0.0%',
    formatValue: (val, row) => {
      if (row?.isChangeRow || row?.isYoyRow) {
        return { val: row.new_ratio_users_yoy_pp ?? null, numFmt: '+0.00"pp";-0.00"pp";0.00"pp"' }
      }
      return val
    },
  },
  {
    header: '老客人数占比', key: 'old_ratio_users', kind: 'number', width: 14, numFmt: '0.0%',
    formatValue: (val, row) => {
      if (row?.isChangeRow || row?.isYoyRow) {
        return { val: row.old_ratio_users_yoy_pp ?? null, numFmt: '+0.00"pp";-0.00"pp";0.00"pp"' }
      }
      return val
    },
  },
])
</script>

<template>
  <div>
    <!-- 数据来源说明 -->
    <div class="mb-4">
      <NAlert type="info" :bordered="false" class="text-xs">
        核心单品新老客数据来源: 订单表SQL聚合；全店资产/单品资产Tab数据来源: DMP PlatformDMP导出。两套口径的"用户"定义不同。
      </NAlert>
    </div>

    <LoadingState v-if="productAssetsLoading || isLoading" description="正在加载各周品类数据..." />
    <ErrorState v-else-if="productAssetsError" :message="String(productAssetsError)" @retry="refetchProductAssets" />
    <ErrorState v-else-if="error" :message="String(error)" @retry="refetch" />
    <EmptyState v-else-if="!tableData.length" description="暂无品类数据" />

    <div v-else>
      <!-- 折线图：新客/老客成交占比趋势 -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        <div class="bi-card p-4">
          <div class="mb-0.5">
            <h3 class="text-sm font-semibold text-slate-800">新客成交占比趋势</h3>
            <p class="text-[11px] text-slate-500">各产品日度新客GSV占比变化</p>
          </div>
          <LineChart
            :x-axis-data="chartDayLabels"
            :series="newRatioSeries"
            :y-axis="{ name: '占比', formatter: (v: number) => v + '%' }"
            height="260px"
          />
        </div>
        <div class="bi-card p-4">
          <div class="mb-0.5">
            <h3 class="text-sm font-semibold text-slate-800">老客成交占比趋势</h3>
            <p class="text-[11px] text-slate-500">各产品日度老客GSV占比变化</p>
          </div>
          <LineChart
            :x-axis-data="chartDayLabels"
            :series="oldRatioSeries"
            :y-axis="{ name: '占比', formatter: (v: number) => v + '%' }"
            height="260px"
          />
        </div>
      </div>

      <div class="flex items-center justify-end mb-2">
        <ExportToolbar
          :filename="`产品_客群_滚动对比`"
          :columns="productCustomerXlsxColumns"
          :data="tableData"
          sheet-name="产品客群"
        />
      </div>
      <div class="overflow-x-auto rounded-lg border border-slate-200">
        <NDataTable
          :columns="columns"
          :data="tableData"
          :span-method="spanMethod"
          :pagination="false"
          :scroll-x="1800"
          :bordered="false"
          :single-line="false"
          :row-class-name="rowClassName"
          size="small"
        />
      </div>
    </div>
  </div>
</template>
