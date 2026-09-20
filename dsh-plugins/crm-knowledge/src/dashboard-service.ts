import type { createDashboardAccess } from './dashboard-access.mjs';

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Deliberately exposes only queries/status, never login or raw credentials. */
    crmDashboard: ReturnType<typeof createDashboardAccess>['service'];
  }
}
