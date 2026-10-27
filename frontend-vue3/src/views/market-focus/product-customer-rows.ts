import type {
  CategoryOverviewItem,
  CategoryOverviewResponse,
  ProductCustomerMetrics,
  ProductCustomerResponse,
} from '@/api/category'

export interface ProductWeekResult {
  range: { start: string; end: string; label: string }
  ttl: CategoryOverviewItem
  customer: ProductCustomerResponse
}

export function joinProductCustomerWeeks(
  ranges: ProductWeekResult['range'][],
  overviews: CategoryOverviewResponse[],
  customers: ProductCustomerResponse[],
): ProductWeekResult[] {
  if (customers.length !== ranges.length || overviews.length !== ranges.length) {
    throw new Error('商品周表返回的时间窗口不完整，请重试')
  }
  const versions = new Set([...overviews, ...customers].map(result => result.data_version))
  if ([...versions].some(version => !version || version === 'unknown')) {
    throw new Error('数据来源未验证，无法生成同一快照周表')
  }
  if (versions.size !== 1) {
    throw new Error('订单数据在查询期间发生变化，请重试以获取同一数据快照')
  }
  return ranges.map((range, index) => {
    const overview = overviews[index]!
    const customer = customers[index]!
    if (overview.date_start !== range.start || customer.date_start !== range.start
      || overview.date_end !== range.end || customer.date_end !== range.end
      || !overview.compare_start_date || !overview.compare_end_date
      || overview.compare_start_date !== customer.compare_start_date
      || overview.compare_end_date !== customer.compare_end_date) {
      throw new Error('商品与全店的对比窗口不一致，请重试')
    }
    if (!overview.all_ttl) throw new Error(`全店汇总缺失：${range.label}`)
    return { range, ttl: overview.all_ttl, customer }
  })
}

export interface TableRow {
  id: string
  product: string
  weekLabel: string
  weekIdx: number
  isChangeRow: boolean
  isYoyRow: boolean
  gsv: number
  new_gsv: number
  old_gsv: number
  users: number
  new_users: number
  old_users: number
  aus: number
  new_aus: number
  old_aus: number
  new_ratio_gsv: number
  old_ratio_gsv: number
  new_ratio_users: number
  old_ratio_users: number
  gsv_yoy_pct?: number | null
  new_gsv_yoy_pct?: number | null
  old_gsv_yoy_pct?: number | null
  users_yoy_pct?: number | null
  new_users_yoy_pct?: number | null
  old_users_yoy_pct?: number | null
  aus_yoy_pct?: number | null
  new_aus_yoy_pct?: number | null
  old_aus_yoy_pct?: number | null
  new_ratio_gsv_yoy_pp?: number | null
  old_ratio_gsv_yoy_pp?: number | null
  new_ratio_users_yoy_pp?: number | null
  old_ratio_users_yoy_pp?: number | null
}

function weekLabel(range: ProductWeekResult['range']): string {
  const start = new Date(`${range.start}T00:00:00Z`)
  const end = new Date(`${range.end}T00:00:00Z`)
  return `${start.getUTCMonth() + 1}/${start.getUTCDate()}-${end.getUTCMonth() + 1}/${end.getUTCDate()}`
}

function ratioChange(latest: number, previous: number): number | null {
  return previous > 0 ? (latest - previous) / previous : null
}

export function buildProductCustomerTableRows(
  results: ProductWeekResult[],
): { name: string; rows: TableRow[] }[] {
  if (!results.length) return []

  const groups: Record<string, TableRow[]> = {}
  const latestGsv = new Map<string, number>()
  const addWeekly = (
    metric: ProductCustomerMetrics | CategoryOverviewItem,
    product: string,
    weekIdx: number,
    range: ProductWeekResult['range'],
  ) => {
    const newUsers = metric.new_users || 0
    const oldUsers = metric.old_users || 0
    const row: TableRow = {
      id: `${product}-${weekIdx}`,
      product,
      weekLabel: weekLabel(range),
      weekIdx,
      isChangeRow: false,
      isYoyRow: false,
      gsv: metric.gsv,
      new_gsv: metric.new_gsv,
      old_gsv: metric.old_gsv,
      users: metric.users,
      new_users: newUsers,
      old_users: oldUsers,
      aus: metric.users > 0 ? metric.gsv / metric.users : 0,
      new_aus: newUsers > 0 ? metric.new_gsv / newUsers : 0,
      old_aus: oldUsers > 0 ? metric.old_gsv / oldUsers : 0,
      new_ratio_gsv: metric.gsv > 0 ? metric.new_gsv / metric.gsv : 0,
      old_ratio_gsv: metric.gsv > 0 ? metric.old_gsv / metric.gsv : 0,
      new_ratio_users: metric.users > 0 ? newUsers / metric.users : 0,
      old_ratio_users: metric.users > 0 ? oldUsers / metric.users : 0,
    }
    if (!groups[product]) groups[product] = []
    groups[product]!.push(row)
    latestGsv.set(product, metric.gsv)
  }

  results.forEach((result, weekIdx) => {
    addWeekly(result.ttl, '全店', weekIdx, result.range)
    result.customer.products.forEach(product => {
      addWeekly(product.current, product.display_name, weekIdx, result.range)
    })
  })

  for (const [name, rows] of Object.entries(groups)) {
    if (rows.length >= 2) {
      const latest = rows.at(-1)!
      const previous = rows.at(-2)!
      rows.push({
        id: `change-${name}`,
        product: name,
        weekLabel: '本周对比上周',
        weekIdx: -1,
        isChangeRow: true,
        isYoyRow: false,
        gsv: 0, new_gsv: 0, old_gsv: 0, users: 0, new_users: 0, old_users: 0,
        aus: 0, new_aus: 0, old_aus: 0,
        new_ratio_gsv: 0, old_ratio_gsv: 0, new_ratio_users: 0, old_ratio_users: 0,
        gsv_yoy_pct: ratioChange(latest.gsv, previous.gsv),
        new_gsv_yoy_pct: ratioChange(latest.new_gsv, previous.new_gsv),
        old_gsv_yoy_pct: ratioChange(latest.old_gsv, previous.old_gsv),
        users_yoy_pct: ratioChange(latest.users, previous.users),
        new_users_yoy_pct: ratioChange(latest.new_users, previous.new_users),
        old_users_yoy_pct: ratioChange(latest.old_users, previous.old_users),
        aus_yoy_pct: ratioChange(latest.aus, previous.aus),
        new_aus_yoy_pct: ratioChange(latest.new_aus, previous.new_aus),
        old_aus_yoy_pct: ratioChange(latest.old_aus, previous.old_aus),
        new_ratio_gsv_yoy_pp: latest.new_ratio_gsv - previous.new_ratio_gsv,
        old_ratio_gsv_yoy_pp: latest.old_ratio_gsv - previous.old_ratio_gsv,
        new_ratio_users_yoy_pp: latest.new_ratio_users - previous.new_ratio_users,
        old_ratio_users_yoy_pp: latest.old_ratio_users - previous.old_ratio_users,
      })
    }

    const latestResult = results.at(-1)!
    const storeTtl = name === '全店' ? latestResult.ttl : null
    const product = name === '全店'
      ? null
      : latestResult.customer.products.find(item => item.display_name === name)
    const yoy = product?.yoy
    rows.push({
      id: `yoy-${name}`,
      product: name,
      weekLabel: '本周对比去年同期',
      weekIdx: -2,
      isChangeRow: false,
      isYoyRow: true,
      gsv: 0, new_gsv: 0, old_gsv: 0, users: 0, new_users: 0, old_users: 0,
      aus: 0, new_aus: 0, old_aus: 0,
      new_ratio_gsv: 0, old_ratio_gsv: 0, new_ratio_users: 0, old_ratio_users: 0,
      gsv_yoy_pct: storeTtl?.gsv_yoy ?? yoy?.gsv ?? null,
      new_gsv_yoy_pct: storeTtl?.new_gsv_yoy ?? yoy?.new_gsv ?? null,
      old_gsv_yoy_pct: storeTtl?.old_gsv_yoy ?? yoy?.old_gsv ?? null,
      users_yoy_pct: storeTtl?.users_yoy ?? yoy?.users ?? null,
      new_users_yoy_pct: storeTtl?.new_users_yoy ?? yoy?.new_users ?? null,
      old_users_yoy_pct: storeTtl?.old_users_yoy ?? yoy?.old_users ?? null,
      aus_yoy_pct: storeTtl?.aus_yoy ?? yoy?.aus ?? null,
      new_aus_yoy_pct: storeTtl?.new_aus_yoy ?? yoy?.new_aus ?? null,
      old_aus_yoy_pct: storeTtl?.old_aus_yoy ?? yoy?.old_aus ?? null,
      new_ratio_gsv_yoy_pp: storeTtl?.new_ratio_yoy ?? yoy?.new_ratio_ppt ?? null,
      old_ratio_gsv_yoy_pp: storeTtl?.old_ratio_yoy ?? yoy?.old_ratio_ppt ?? null,
      new_ratio_users_yoy_pp: storeTtl?.new_users_ratio_yoy ?? yoy?.new_users_ratio_ppt ?? null,
      old_ratio_users_yoy_pp: storeTtl?.old_users_ratio_yoy ?? yoy?.old_users_ratio_ppt ?? null,
    })
  }

  return Object.keys(groups)
    .sort((left, right) => {
      if (left === '全店') return -1
      if (right === '全店') return 1
      return (latestGsv.get(right) ?? 0) - (latestGsv.get(left) ?? 0)
    })
    .map(name => ({ name, rows: groups[name]! }))
}
