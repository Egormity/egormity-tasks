import { z } from "zod";

/** Local administrator identity returned by the internal tasks API. */
export const userSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  email: z.string().min(3),
});

export type User = z.infer<typeof userSchema>;

export const loginRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(3)
    .max(254)
    .regex(/^[^\s@]+@[^\s@]+$/u),
  password: z.string().min(1).max(1024),
});
