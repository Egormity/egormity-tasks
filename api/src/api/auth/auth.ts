import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { InternalTasksEnvironment } from "../config.js";
import { internalTasksPolicy as policy } from "../contracts/policy.js";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { loginRequestSchema, userSchema, type User } from "../contracts/auth.js";
import { HttpError } from "../http-error.js";
import { UserStore, verifyPassword, type UserCredentials } from "./user-store.js";

export { HttpError } from "../http-error.js";

const sessionSchema = userSchema.extend({
  expiresAt: z.number().int(),
  nonce: z.uuid(),
  sessionVersion: z.number().int().nonnegative().default(0),
});

const bootstrapAdminId = "00000000-0000-5000-8000-000000000001";

export const localAdminUser = (
  config: Pick<InternalTasksEnvironment, "adminEmail" | "adminName">,
): User => ({
  id: bootstrapAdminId,
  username: config.adminEmail,
  role: "admin",
});

export const createSessionToken = (
  user: User,
  secret: string,
  expiresAt: number,
  sessionVersion = 0,
) => {
  const payload = Buffer.from(
    JSON.stringify({ ...user, expiresAt, nonce: randomUUID(), sessionVersion }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

export const readToken = (request: Request) => {
  const cookie = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${policy.cookieName}=`));
  return cookie?.slice(policy.cookieName.length + 1);
};

const publicUser = ({ id, username, role }: UserCredentials): User => ({
  id,
  username,
  role,
});

export class UserAuthentication {
  private readonly attempts = new Map<string, { count: number; reset: number }>();
  private readonly revoked = new Map<string, number>();

  constructor(
    private readonly config: InternalTasksEnvironment,
    private readonly users: UserStore,
  ) {}

  private setCookie = (response: Response, token: string) =>
    response.cookie(policy.cookieName, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: new URL(this.config.publicUrl).protocol === "https:",
      path: policy.apiPath,
      maxAge: token ? policy.cookieMaxAgeMilliseconds : 0,
    });

  private verifyToken = (token: string) => {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra !== undefined || this.revoked.has(token)) return null;
    const expected = createHmac("sha256", this.config.sessionSecret)
      .update(payload)
      .digest("base64url");
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (
      actualBytes.length !== expectedBytes.length ||
      !timingSafeEqual(actualBytes, expectedBytes)
    )
      return null;
    try {
      const decoded = sessionSchema.parse(
        JSON.parse(Buffer.from(payload, "base64url").toString()),
      );
      if (decoded.expiresAt <= Date.now()) return null;
      const user = this.users.findById(decoded.id);
      if (!user || user.sessionVersion !== decoded.sessionVersion) return null;
      return publicUser(user);
    } catch {
      return null;
    }
  };

  verify = (request: Request) => {
    const token = readToken(request);
    const user = token ? this.verifyToken(token) : null;
    if (!user) throw new HttpError(401, "Your session has expired. Sign in again.");
    return user;
  };

  requireAuthenticated = (request: Request, response: Response, next: NextFunction) => {
    try {
      response.locals.user = this.verify(request);
      next();
    } catch (error) {
      next(error);
    }
  };

  requireAdmin = (request: Request, response: Response, next: NextFunction) => {
    try {
      const user = this.verify(request);
      if (user.role !== "admin") throw new HttpError(403, "Admin access is required.");
      response.locals.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };

  login = (request: Request, response: Response) => {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.reset <= now) this.attempts.delete(key);
    for (const [key, expiry] of this.revoked) if (expiry <= now) this.revoked.delete(key);
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
    if (!input.success) throw new HttpError(400, "Enter a username and password.");
    const user = this.users.findByUsername(input.data.username);
    const passwordMatches = verifyPassword(
      input.data.password,
      user?.passwordHash ?? this.config.adminPasswordHash,
    );
    if (!user || !passwordMatches) throw new HttpError(401, "Invalid username or password.");
    this.attempts.delete(key);
    const identity = publicUser(user);
    this.setCookie(
      response,
      createSessionToken(
        identity,
        this.config.sessionSecret,
        now + policy.cookieMaxAgeMilliseconds,
        user.sessionVersion,
      ),
    );
    response.json(identity);
  };

  logout = (request: Request, response: Response) => {
    const token = readToken(request);
    if (token) this.revoked.set(token, Date.now() + policy.cookieMaxAgeMilliseconds);
    if (this.revoked.size > 10_000) this.revoked.delete(this.revoked.keys().next().value!);
    this.setCookie(response, "");
    response.sendStatus(204);
  };
}
