import { expect, it } from "vitest";

import { authSessionSchema, browserSessionSchema, loginRequestSchema } from "./auth.js";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Administrator",
  email: "admin@example.test",
  role: "admin",
};

it("accepts the external identity without depending on platform-specific session fields", () => {
  expect(
    browserSessionSchema.parse({ user: { ...user, access: { futureFlag: true } } }),
  ).toEqual({
    user,
  });
  expect(authSessionSchema.parse({ user, token: "private-token" })).toEqual({
    user,
    token: "private-token",
  });
  expect(
    browserSessionSchema.parse({ user: { ...user, email: null, role: "manager" } }).user.role,
  ).toBe("manager");
});

it("requires a verifiable identity, explicit role, and nonempty login token", () => {
  expect(browserSessionSchema.safeParse({ user: { ...user, id: "invalid" } }).success).toBe(
    false,
  );
  expect(browserSessionSchema.safeParse({ user: { ...user, role: undefined } }).success).toBe(
    false,
  );
  expect(authSessionSchema.safeParse({ user, token: "" }).success).toBe(false);
  expect(authSessionSchema.safeParse({ user }).success).toBe(false);
  expect(loginRequestSchema.safeParse({ email: "invalid", password: "secret" }).success).toBe(
    false,
  );
  expect(loginRequestSchema.safeParse({ email: user.email, password: "" }).success).toBe(false);
});
