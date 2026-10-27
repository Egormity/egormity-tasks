import { z } from "zod";

export const userRoleSchema = z.enum(["admin", "manager"]);

/** Authenticated workspace identity returned by the internal tasks API. */
export const userSchema = z.object({
  id: z.uuid(),
  username: z.string().min(1).max(80),
  role: userRoleSchema,
});

export type User = z.infer<typeof userSchema>;

const userFieldsSchema = z.object({
  username: z.string().trim().min(1).max(80),
  role: userRoleSchema,
});

export const createUserRequestSchema = userFieldsSchema.extend({
  password: z.string().min(5).max(1024),
});

export const updateUserRequestSchema = userFieldsSchema.extend({
  password: z.string().min(5).max(1024).optional(),
});

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(1024),
});
