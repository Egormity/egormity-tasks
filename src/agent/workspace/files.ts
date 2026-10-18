import type { Attachment, UserInput } from "../../api/contracts/agent.js";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, realpath } from "node:fs/promises";
import { basename, join, relative, isAbsolute } from "node:path";
import { z } from "zod";

export const uploadMaxBytes = 20 * 1024 * 1024;
const metadata = z.object({
  id: z.uuid(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  path: z.string(),
  threadId: z.uuid(),
});
const imageMime = (bytes: Buffer): string => {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())) return "image/gif";
  return "application/octet-stream";
};

/** Upload bytes and small manifests, beside native Codex state; no chat database. */
export class AgentFiles {
  constructor(readonly root: string) {}
  save = async (threadId: string, name: string, bytes: Buffer): Promise<Attachment> => {
    if (!z.uuid().safeParse(threadId).success) throw new Error("Invalid thread ID.");
    if (!bytes.length || bytes.length > uploadMaxBytes)
      throw new Error("Unsupported file size.");
    const id = randomUUID();
    const safeName =
      basename(name)
        .replace(/[^\p{L}\p{N}._ -]/gu, "_")
        .slice(0, 150) || "attachment";
    const directory = join(this.root, id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = {
      id,
      name: safeName,
      mime: imageMime(bytes),
      size: bytes.length,
      path: join(directory, `content-${safeName}`),
      threadId,
    };
    await writeFile(file.path, bytes, { flag: "wx", mode: 0o600 });
    await writeFile(join(directory, "metadata.json"), JSON.stringify(file), {
      flag: "wx",
      mode: 0o600,
    });
    return file;
  };
  get = async (id: string) => {
    if (!z.uuid().safeParse(id).success) throw new Error("Invalid attachment ID.");
    const file = metadata.parse(
      JSON.parse(await readFile(join(this.root, id, "metadata.json"), "utf8")),
    );
    const path = await realpath(file.path);
    const boundary = await realpath(join(this.root, id));
    if (relative(await realpath(this.root), boundary) !== id)
      throw new Error("Invalid attachment directory.");
    const child = relative(boundary, path);
    if (!child || child.startsWith("..") || isAbsolute(child) || file.id !== id)
      throw new Error("Invalid attachment path.");
    return { ...file, path };
  };
  inputs = async (threadId: string, ids: string[]): Promise<UserInput[]> => {
    const files = await Promise.all(ids.map(this.get));
    if (files.some((file) => file.threadId !== threadId))
      throw new Error("Attachment belongs to another thread.");
    if (files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024)
      throw new Error("Attachments exceed 50 MB.");
    return files.flatMap((file) => {
      const input: UserInput[] = [
        {
          type: "text",
          text: `Attached file: [${file.name}](${file.path})`,
          text_elements: [],
        },
      ];
      if (file.mime.startsWith("image/")) input.push({ type: "localImage", path: file.path });
      return input;
    });
  };
}
