// Usage Meter Worker
// Queries Cloudflare Analytics and writes usage data to KV
// Runs on cron schedule (e.g., every 5 minutes)

interface Env {
  CF_ACCOUNT_ID: string
  CF_API_TOKEN: string
  REALTIME_APP_ID: string
  BUDGET_KV: KVNamespace
}

interface AnalyticsResponse {
  data?: {
    viewer?: {
      accounts?: Array<{
        callsRealtimeAppMetricsAdaptiveGroups?: Array<{
          sum?: {
            bytesOut?: number
            bytesIn?: number
            sessionsCount?: number
          }
        }>
      }>
    }
  }
  errors?: Array<{ message: string }>
}

// GraphQL query for Cloudflare Calls analytics
const ANALYTICS_QUERY = `
  query GetRealtimeUsage($appId: String!, $start: Time!, $end: Time!) {
    viewer {
      accounts {
        callsRealtimeAppMetricsAdaptiveGroups(
          filter: {
            appId: $appId
            datetime_geq: $start
            datetime_leq: $end
          }
          limit: 100
        ) {
          dimensions {
            appId
          }
          sum {
            bytesOut
            bytesIn
            sessionsCount
          }
        }
      }
    }
  }
`

async function queryAnalytics(
  accountId: string,
  appId: string,
  apiToken: string,
  startTime: Date,
  endTime: Date
): Promise<{ bytesOut: number; bytesIn: number; sessionsCount: number }> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/graphql`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: ANALYTICS_QUERY,
      variables: {
        appId,
        start: startTime.toISOString(),
        end: endTime.toISOString(),
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Analytics API error: ${response.status} ${await response.text()}`)
  }

  const result: AnalyticsResponse = await response.json()

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`)
  }

  const groups = result.data?.viewer?.accounts?.[0]?.callsRealtimeAppMetricsAdaptiveGroups
  
  if (!groups || groups.length === 0) {
    return { bytesOut: 0, bytesIn: 0, sessionsCount: 0 }
  }

  // Sum across all groups
  return groups.reduce(
    (acc, group) => ({
      bytesOut: acc.bytesOut + (group.sum?.bytesOut || 0),
      bytesIn: acc.bytesIn + (group.sum?.bytesIn || 0),
      sessionsCount: acc.sessionsCount + (group.sum?.sessionsCount || 0),
    }),
    { bytesOut: 0, bytesIn: 0, sessionsCount: 0 }
  )
}

export default {
  // Handle scheduled cron triggers
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log(`[usage-meter] Running scheduled check at ${new Date().toISOString()}`)

    try {
      // Query last hour of usage
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000) // 1 hour ago

      const usage = await queryAnalytics(
        env.CF_ACCOUNT_ID,
        env.REALTIME_APP_ID,
        env.CF_API_TOKEN,
        startTime,
        endTime
      )

      // Get current month's cumulative usage
      const currentMonth = new Date().toISOString().slice(0, 7) // "2026-03"
      const existingData = await env.BUDGET_KV.get(`usage:${currentMonth}`)
      
      let cumulativeUsage = {
        month: currentMonth,
        totalBytesOut: 0,
        totalBytesIn: 0,
        totalSessions: 0,
        lastUpdated: Date.now(),
      }

      if (existingData) {
        const existing = JSON.parse(existingData)
        // If same month, accumulate
        if (existing.month === currentMonth) {
          cumulativeUsage = existing
        }
      }

      // Add new usage
      cumulativeUsage.totalBytesOut += usage.bytesOut
      cumulativeUsage.totalBytesIn += usage.bytesIn
      cumulativeUsage.totalSessions += usage.sessionsCount
      cumulativeUsage.lastUpdated = Date.now()

      // Write to KV
      await env.BUDGET_KV.put(
        `usage:${currentMonth}`,
        JSON.stringify(cumulativeUsage)
      )

      // Also write a "latest" key for quick access
      await env.BUDGET_KV.put(
        'usage:latest',
        JSON.stringify({
          ...cumulativeUsage,
          lastQuery: {
            bytesOut: usage.bytesOut,
            bytesIn: usage.bytesIn,
            sessionsCount: usage.sessionsCount,
            period: `${startTime.toISOString()} to ${endTime.toISOString()}`,
          },
        })
      )

      // Check if approaching limit and write alert status
      const FREE_TIER_BYTES = 1000 * 1024 * 1024 * 1024 // 1TB
      const usageRatio = cumulativeUsage.totalBytesOut / FREE_TIER_BYTES

      await env.BUDGET_KV.put(
        'budget:status',
        JSON.stringify({
          usedBytes: cumulativeUsage.totalBytesOut,
          freeTierBytes: FREE_TIER_BYTES,
          usedRatio: usageRatio,
          remainingBytes: Math.max(0, FREE_TIER_BYTES - cumulativeUsage.totalBytesOut),
          status: usageRatio > 0.9 ? 'critical' : usageRatio > 0.75 ? 'warning' : 'ok',
          updatedAt: Date.now(),
        })
      )

      console.log(`[usage-meter] Updated usage: ${(usage.bytesOut / 1024 / 1024).toFixed(2)} MB this hour`)
      console.log(`[usage-meter] Monthly total: ${(cumulativeUsage.totalBytesOut / 1024 / 1024 / 1024).toFixed(2)} GB`)
      console.log(`[usage-meter] Budget status: ${(usageRatio * 100).toFixed(1)}%`)

    } catch (error) {
      console.error('[usage-meter] Failed to update usage:', error)
      // Don't throw - let cron retry next interval
    }
  },

  // Optional: HTTP endpoint for manual trigger or querying status
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === '/trigger' && request.method === 'POST') {
      // Manual trigger
      await this.scheduled({ scheduledTime: Date.now() } as ScheduledEvent, env, ctx)
      return new Response('Usage meter triggered', { status: 200 })
    }

    if (path === '/status' && request.method === 'GET') {
      // Get current budget status
      const status = await env.BUDGET_KV.get('budget:status')
      if (!status) {
        return new Response('No budget data available', { status: 404 })
      }

      return new Response(status, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (path === '/usage' && request.method === 'GET') {
      // Get detailed usage
      const latest = await env.BUDGET_KV.get('usage:latest')
      if (!latest) {
        return new Response('No usage data available', { status: 404 })
      }

      return new Response(latest, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not found', { status: 404 })
  },
}
