export const internalTasksPolicy = {
  requestBodyLimit: "64kb",
  basePath: "/",
  apiPath: "/api",
  cookieName: "amazi_operations_session",
  cookieMaxAgeMilliseconds: 7 * 24 * 60 * 60 * 1_000,
  loginAttempts: 5,
  loginWindowMilliseconds: 15 * 60 * 1_000,
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
