/** Shared bounds for the Tasks API and the Tasks backend wire protocol. */
export const internalTasksProtocolPolicy = {
  messageMaxLength: 32_000,
  eventMaxLength: 32_000,
  requestBodyLimit: "64kb",
} as const;

/** Retain existing local state when the two applications start independently. */
export const internalTasksStatePolicy = {
  stateDirectory: ".runtime/operations-agent",
  tokenFile: "worker-token",
} as const;

export const internalTasksPolicy = {
  ...internalTasksProtocolPolicy,
  basePath: "/",
  apiPath: "/api",
  cookieName: "amazi_operations_session",
  cookieMaxAgeMilliseconds: 7 * 24 * 60 * 60 * 1_000,
  requestTimeoutMilliseconds: 15_000,
  maxEventsPerRun: 500,
  loginAttempts: 5,
  loginWindowMilliseconds: 15 * 60 * 1_000,
  titleMaxLength: 80,
  port: 3010,
  attachmentMaxBytes: 20 * 1024 * 1024,
  defaultLocale: "ru",
  defaultTaskStatus: "backlog",
  defaultTaskPriority: "medium",
  defaultTagTone: "green",
  preferencesStorageKey: "amazi-operations-preferences",
} as const;

export const internalTasksDevelopmentPolicy = {
  frontendPort: 5176,
  frontendHost: "localhost",
} as const;
