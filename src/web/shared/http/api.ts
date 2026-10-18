import { internalTasksPolicy as policy } from "@contracts/policy.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const request = async <T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> => {
  const response = await fetch(`${policy.apiPath}${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, result.error ?? "The request could not be completed.");
  }
  if (response.headers.get("content-type")?.includes("application/json"))
    return (await response.json()) as T;
  return undefined as T;
};
