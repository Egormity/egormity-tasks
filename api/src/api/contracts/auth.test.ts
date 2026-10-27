import { expect, it } from "vitest";

import {
  createUserRequestSchema,
  loginRequestSchema,
  updateUserRequestSchema,
  userSchema,
} from "./auth.js";

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

it("accepts five-character passwords for new users and password updates", () => {
  expect(
    createUserRequestSchema.safeParse({ username: "new", role: "manager", password: "12345" })
      .success,
  ).toBe(true);
  expect(
    createUserRequestSchema.safeParse({ username: "new", role: "manager", password: "1234" })
      .success,
  ).toBe(false);
  expect(
    updateUserRequestSchema.safeParse({ username: "new", role: "manager", password: "12345" })
      .success,
  ).toBe(true);
});
