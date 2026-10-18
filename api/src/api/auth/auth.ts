import type { InternalTasksEnvironment } from "../config.js";
import { internalTasksPolicy as policy } from "../contracts/policy.js";
import type { NextFunction, Request, Response } from "express";

import {
  authSessionSchema,
  browserSessionSchema,
  loginRequestSchema,
} from "../contracts/auth.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const readToken = (request: Request) => {
  const cookie = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${policy.cookieName}=`));
  return cookie?.slice(policy.cookieName.length + 1);
};

export class AdminAuthentication {
  private readonly attempts = new Map<string, { count: number; reset: number }>();

  constructor(private readonly config: InternalTasksEnvironment) {}

  private request = async (path: string, init: RequestInit) => {
    try {
      return await fetch(`${this.config.apiUrl}/auth/${path}`, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(policy.requestTimeoutMilliseconds),
      });
    } catch {
      throw new HttpError(503, "Amazi authentication is temporarily unavailable.");
    }
  };

  private setCookie = (response: Response, token: string) =>
    response.cookie(policy.cookieName, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: new URL(this.config.publicUrl).protocol === "https:",
      path: policy.apiPath,
      maxAge: token ? policy.cookieMaxAgeMilliseconds : 0,
    });

  verify = async (request: Request) => {
    const token = readToken(request);
    if (!token) throw new HttpError(401, "Sign in with an Amazi administrator account.");
    const result = await this.request("session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (result.status === 401 || result.status === 403)
      throw new HttpError(401, "Your session has expired. Sign in again.");
    if (!result.ok)
      throw new HttpError(503, "Amazi authentication is temporarily unavailable.");
    const session = browserSessionSchema.parse(await result.json());
    if (session.user.role !== "admin")
      throw new HttpError(403, "Administrator access is required.");
    return { id: session.user.id, name: session.user.name, email: session.user.email };
  };

  requireAdmin = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.locals.user = await this.verify(request);
      next();
    } catch (error) {
      next(error);
    }
  };

  login = async (request: Request, response: Response) => {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.reset <= now) this.attempts.delete(key);
    const key = request.ip ?? "unknown";
    const attempt = this.attempts.get(key) ?? {
      count: 0,
      reset: now + policy.loginWindowMilliseconds,
    };
    if (attempt.count >= policy.loginAttempts)
      throw new HttpError(429, "Too many login attempts. Try again later.");
    attempt.count += 1;
    this.attempts.set(key, attempt);
    const input = loginRequestSchema.safeParse(request.body);
    if (!input.success) throw new HttpError(400, "Enter a valid email and password.");
    const result = await this.request("token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.data),
    });
    if (result.status === 401 || result.status === 400)
      throw new HttpError(401, "Invalid email or password.");
    if (!result.ok)
      throw new HttpError(
        result.status === 429 ? 429 : 503,
        "Unable to sign in. Try again later.",
      );
    const session = authSessionSchema.parse(await result.json());
    if (session.user.role !== "admin") {
      await this.request("logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      });
      throw new HttpError(403, "Administrator access is required.");
    }
    this.attempts.delete(key);
    this.setCookie(response, session.token);
    response.json({ id: session.user.id, name: session.user.name, email: session.user.email });
  };

  logout = async (request: Request, response: Response) => {
    const token = readToken(request);
    if (token)
      await this.request("logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    this.setCookie(response, "");
    response.sendStatus(204);
  };
}
