import { describe, expect, it } from 'vitest'
import { buildProductCustomerTableRows, joinProductCustomerWeeks, type ProductWeekResult } from './product-customer-rows'
import type { CategoryOverviewResponse } from '@/api/category'

function metric(overrides: Record<string, number> = {}) {
  return {
    gsv: 100,
    users: 2,
    aus: 50,
    old_gsv: 60,
    old_users: 1,
    old_aus: 60,
    old_ratio: 0.6,
    new_gsv: 40,
    new_users: 1,
    new_aus: 40,
    new_ratio: 0.4,
    member_gsv: 0,
    member_users: 0,
    member_aus: 0,
    member_ratio: 0,
    old_users_ratio: 0.5,
    new_users_ratio: 0.5,
    ...overrides,
  }
}

function result(start: string, end: string, productMetric: ReturnType<typeof metric>): ProductWeekResult {
  return {
    range: { start, end, label: `${start}-${end}` },
    ttl: {
      name: '全店',
      display_name: '全店',
      gsv: productMetric.gsv,
      new_gsv: productMetric.new_gsv,
      old_gsv: productMetric.old_gsv,
      users: productMetric.users,
      new_users: productMetric.new_users,
      old_users: productMetric.old_users,
    } as ProductWeekResult['ttl'],
    customer: {
      products: [{
        name: '经典膜',
        display_name: '爆款面膜E',
        spu_classes: ['经典膜', '【妆】经典膜'],
        status: 'OK',
        current: productMetric,
        comparison: metric(),
        yoy: {
          gsv: 0.1,
          users: 0,
          aus: 0.1,
          old_gsv: 0.2,
          old_users: 0,
          old_aus: 0.2,
          new_gsv: 0,
          new_users: 0,
          new_aus: 0,
          old_ratio_ppt: 0,
          new_ratio_ppt: 0,
          old_users_ratio_ppt: 0,
          new_users_ratio_ppt: 0,
        },
      }],
    } as ProductWeekResult['customer'],
  }
}

describe('product customer weekly rows', () => {
  it('keeps backend deduplicated user counts and uses display names', () => {
    const groups = buildProductCustomerTableRows([result('2026-06-29', '2026-07-05', metric())])
    const productGroup = groups.find(group => group.name === '爆款面膜E')
    expect(productGroup?.rows[0]?.users).toBe(2)
    expect(productGroup?.rows[0]?.new_users).toBe(1)
    expect(productGroup?.rows[0]?.old_users).toBe(1)
    expect(groups.some(group => group.name === '经典膜')).toBe(false)
  })

  it('builds week-over-week and year-over-year rows from product endpoint facts', () => {
    const groups = buildProductCustomerTableRows([
      result('2026-06-22', '2026-06-28', metric({ gsv: 80, new_gsv: 30, old_gsv: 50 })),
      result('2026-06-29', '2026-07-05', metric()),
    ])
    const productRows = groups.find(group => group.name === '爆款面膜E')?.rows ?? []
    expect(productRows.at(-2)?.weekLabel).toBe('本周对比上周')
    expect(productRows.at(-2)?.gsv_yoy_pct).toBeCloseTo(0.25)
    expect(productRows.at(-1)?.weekLabel).toBe('本周对比去年同期')
    expect(productRows.at(-1)?.gsv_yoy_pct).toBeCloseTo(0.1)
  })

  it('keeps a zero baseline non-comparable instead of reporting zero growth', () => {
    const groups = buildProductCustomerTableRows([
      result('2026-06-22', '2026-06-28', metric({ gsv: 0, new_gsv: 0, old_gsv: 0 })),
      result('2026-06-29', '2026-07-05', metric()),
    ])
    const productRows = groups.find(group => group.name === '爆款面膜E')?.rows ?? []
    expect(productRows.at(-2)?.gsv_yoy_pct).toBeNull()
  })

  it('keeps the full growth ratio supplied by the product endpoint', () => {
    const week = result('2026-06-29', '2026-07-05', metric())
    week.customer.products[0]!.yoy.gsv = 999
    const groups = buildProductCustomerTableRows([week])
    expect(groups.find(group => group.name === '爆款面膜E')?.rows.at(-1)?.gsv_yoy_pct).toBe(999)
  })
})

function matchingReceipts() {
  const week = result('2025-02-24', '2025-03-02', metric())
  const window = {
    date_start: week.range.start, date_end: week.range.end,
    compare_start_date: '2024-02-24', compare_end_date: '2024-03-02',
    data_version: 'warehouse-revision-a',
  }
  const overview: CategoryOverviewResponse = {
    ...window, level: 'class', channel: null, metric_type: 'GSV', data_cutoff: week.range.end,
    all_rows: [], member_rows: [], all_ttl: week.ttl, member_ttl: week.ttl,
  }
  const customer = { ...week.customer, ...window }
  return { range: week.range, overview, customer }
}

describe('joining product and store receipts', () => {
  it('joins only matching source versions and comparison windows', () => {
    const { range, overview, customer } = matchingReceipts()
    expect(joinProductCustomerWeeks([range], [overview], [customer]))
      .toEqual([{ range, ttl: overview.all_ttl, customer }])
  })

  it.each(['date_start', 'date_end', 'compare_start_date', 'compare_end_date'] as const)(
    'rejects a mismatched %s instead of combining the totals', field => {
      const { range, overview, customer } = matchingReceipts()
      overview[field] = '2024-02-25'
      expect(() => joinProductCustomerWeeks([range], [overview], [customer])).toThrow('对比窗口不一致')
    },
  )

  it('rejects a different source version', () => {
    const { range, overview, customer } = matchingReceipts()
    expect(() => joinProductCustomerWeeks([range], [overview], [{ ...customer, data_version: 'warehouse-revision-b' }]))
      .toThrow('同一数据快照')
  })

  it.each(['unknown', ''])('rejects unverified source version %s without requesting a retry', data_version => {
    const { range, overview, customer } = matchingReceipts()
    expect(() => joinProductCustomerWeeks([range], [overview], [{ ...customer, data_version }]))
      .toThrow('数据来源未验证')
  })

  it('rejects missing comparison metadata and missing windows', () => {
    const { range, overview, customer } = matchingReceipts()
    expect(() => joinProductCustomerWeeks([range], [], [customer])).toThrow('时间窗口不完整')
    expect(() => joinProductCustomerWeeks([range], [{ ...overview, compare_start_date: '' }], [customer]))
      .toThrow('对比窗口不一致')
  })
})
