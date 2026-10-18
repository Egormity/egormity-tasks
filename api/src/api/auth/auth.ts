import { createHash, createHmac, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { InternalTasksEnvironment } from "../config.js";
import { internalTasksPolicy as policy } from "../contracts/policy.js";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { loginRequestSchema, userSchema, type User } from "../contracts/auth.js";

const sessionSchema = userSchema.extend({ expiresAt: z.number().int(), nonce: z.uuid() });

const makeUserId = (email: string) => {
  const hex = createHash("sha256").update(email).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};

export const localAdminUser = (
  config: Pick<InternalTasksEnvironment, "adminEmail" | "adminName">,
): User => ({
  id: makeUserId(config.adminEmail),
  name: config.adminName,
  email: config.adminEmail,
});

export const createSessionToken = (user: User, secret: string, expiresAt: number) => {
  const payload = Buffer.from(
    JSON.stringify({ ...user, expiresAt, nonce: randomUUID() }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

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
  private readonly revoked = new Map<string, number>();
  private readonly user: User;

  constructor(private readonly config: InternalTasksEnvironment) {
    this.user = localAdminUser(config);
  }

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
      if (
        decoded.expiresAt <= Date.now() ||
        decoded.id !== this.user.id ||
        decoded.email !== this.user.email ||
        decoded.name !== this.user.name
      )
        return null;
      return this.user;
    } catch {
      return null;
    }
  };

  verify = (request: Request) => {
    const token = readToken(request);
    const user = token ? this.verifyToken(token) : null;
    if (!user)
      throw new HttpError(401, "Your local administrator session has expired. Sign in again.");
    return user;
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
    if (!input.success) throw new HttpError(400, "Enter a valid email and password.");
    const [saltValue, hashValue] = this.config.adminPasswordHash.split(".");
    const salt = Buffer.from(saltValue!, "base64url");
    const expected = Buffer.from(hashValue!, "base64url");
    const actual = scryptSync(input.data.password, salt, expected.length);
    if (
      input.data.email.toLowerCase() !== this.user.email ||
      !timingSafeEqual(actual, expected)
    )
      throw new HttpError(401, "Invalid email or password.");
    this.attempts.delete(key);
    this.setCookie(
      response,
      createSessionToken(
        this.user,
        this.config.sessionSecret,
        now + policy.cookieMaxAgeMilliseconds,
      ),
    );
    response.json(this.user);
  };

  logout = (request: Request, response: Response) => {
    const token = readToken(request);
    if (token) this.revoked.set(token, Date.now() + policy.cookieMaxAgeMilliseconds);
    if (this.revoked.size > 10_000) this.revoked.delete(this.revoked.keys().next().value!);
    this.setCookie(response, "");
    response.sendStatus(204);
  };
}
