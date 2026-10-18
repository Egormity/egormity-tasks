import { expect, it } from "vitest";

import { loginRequestSchema, userSchema } from "./auth.js";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Administrator",
  email: "admin@example",
};

it("uses the local administrator profile and accepts the configured email identifier", () => {
  expect(userSchema.parse(user)).toEqual(user);
  expect(loginRequestSchema.parse({ email: "admin@example", password: "secret" })).toEqual({
    email: "admin@example",
    password: "secret",
  });
});

it("validates local login identifiers and passwords", () => {
  expect(userSchema.safeParse({ ...user, id: "invalid" }).success).toBe(false);
  expect(loginRequestSchema.safeParse({ email: "invalid", password: "secret" }).success).toBe(
    false,
  );
  expect(loginRequestSchema.safeParse({ email: user.email, password: "" }).success).toBe(false);
});
