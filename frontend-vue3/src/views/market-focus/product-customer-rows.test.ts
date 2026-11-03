import { describe, expect, it } from 'vitest'
import { buildProductCustomerTableRows, type ProductWeekResult } from './product-customer-rows'

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
})
