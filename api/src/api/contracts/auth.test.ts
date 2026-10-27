import { expect, it } from "vitest";

import { loginRequestSchema, userSchema } from "./auth.js";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "admin",
  role: "admin",
};

it("uses a username-based workspace identity and login request", () => {
  expect(userSchema.parse(user)).toEqual(user);
  expect(loginRequestSchema.parse({ username: "admin", password: "secret" })).toEqual({
    username: "admin",
    password: "secret",
  });
});

it("validates local login identifiers and passwords", () => {
  expect(userSchema.safeParse({ ...user, id: "invalid" }).success).toBe(false);
  expect(loginRequestSchema.safeParse({ username: "", password: "secret" }).success).toBe(
    false,
  );
  expect(loginRequestSchema.safeParse({ username: user.username, password: "" }).success).toBe(
    false,
  );
});
