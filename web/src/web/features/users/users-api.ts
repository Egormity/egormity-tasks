import { request } from "@/shared/http/api";
import type { User } from "@contracts/auth.js";

export type UserInput = Pick<User, "username" | "role"> & {
  password?: string;
};

export const getUsers = () => request<User[]>("/users");

export const createUser = (input: UserInput & { password: string }) =>
  request<User>("/users", input);

export const updateUser = (id: string, input: UserInput) =>
  request<User>(`/users/${encodeURIComponent(id)}`, input);
