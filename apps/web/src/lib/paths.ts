/** Every dashboard pathname, so links don't hand-build URLs. */
export const paths = {
  overview: '/',
  operations: '/requests',
  requests: '/requests/list',
  request: (id: string) => `/requests/${encodeURIComponent(id)}`,
  jobQueues: '/jobs',
  jobs: '/jobs/list',
  job: (id: string) => `/jobs/${encodeURIComponent(id)}`,
  errors: '/errors',
  error: (id: string) => `/errors/${encodeURIComponent(id)}`,
  logs: '/logs',
  trace: (traceId: string) => `/traces/${encodeURIComponent(traceId)}`,
  metrics: '/metrics',
} as const;
