import { z } from "zod";

export const userRoleSchema = z.enum(["admin", "manager"]);

/** Authenticated workspace identity returned by the internal tasks API. */
export const userSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  email: z.string().min(3).max(254),
  role: userRoleSchema,
});

export type User = z.infer<typeof userSchema>;

const userFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .min(3)
    .max(254)
    .regex(/^[^\s@]+@[^\s@]+$/u)
    .transform((value) => value.toLowerCase()),
  role: userRoleSchema,
});

export const createUserRequestSchema = userFieldsSchema.extend({
  password: z.string().min(12).max(1024),
});

export const updateUserRequestSchema = userFieldsSchema.extend({
  password: z.string().min(12).max(1024).optional(),
});

export const loginRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(3)
    .max(254)
    .regex(/^[^\s@]+@[^\s@]+$/u),
  password: z.string().min(1).max(1024),
});
