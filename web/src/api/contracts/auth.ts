import { z } from "zod";

// Only fields consumed by this application's external authentication adapter belong here.
export const browserSessionSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string().min(1),
    email: z.email().nullable(),
    role: z.string().min(1),
  }),
});

export const authSessionSchema = browserSessionSchema.extend({ token: z.string().min(1) });

/** Administrator identity returned by the internal tasks API, independent of native chat roles. */
export type User = Pick<z.infer<typeof browserSessionSchema>["user"], "id" | "name" | "email">;

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
