/** Every pathname in the app. Project pages take the project slug (or id). */
const enc = encodeURIComponent;
const project = (p: string) => `/projects/${enc(p)}`;

export const paths = {
  projects: '/projects',
  project,
  applications: (p: string) => `${project(p)}/applications`,
  /** Operations table. */
  requests: (p: string) => `${project(p)}/requests`,
  /** One operation; pass `{ operationId, method }` as search. */
  operation: (p: string) => `${project(p)}/requests/details`,
  request: (p: string, id: string) => `${project(p)}/requests/${enc(id)}`,
  /** Runtime metrics per application and instance. */
  profiler: (p: string) => `${project(p)}/profiler`,
  /** Queue/job-name table. */
  jobs: (p: string) => `${project(p)}/jobs`,
  /** One job name; pass `{ queue, name }` as search. */
  jobGroup: (p: string) => `${project(p)}/jobs/details`,
  job: (p: string, id: string) => `${project(p)}/jobs/${enc(id)}`,
  /** Users seen in the range (`http.getUserId`). */
  users: (p: string) => `${project(p)}/users`,
  user: (p: string, userId: string) => `${project(p)}/users/${enc(userId)}`,
  /** Self time per class and method ("Where the time goes"). */
  timeBreakdown: (p: string) => `${project(p)}/time-breakdown`,
  errors: (p: string) => `${project(p)}/errors`,
  error: (p: string, id: string) => `${project(p)}/errors/${enc(id)}`,
  logs: (p: string) => `${project(p)}/logs`,
  trace: (p: string, traceId: string) => `${project(p)}/traces/${enc(traceId)}`,
  keys: (p: string) => `${project(p)}/keys`,
  settings: (p: string) => `${project(p)}/settings`,
} as const;
