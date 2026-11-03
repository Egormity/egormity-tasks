import { afterEach, expect, it, vi } from "vitest";
import { updateTrackerTags } from "./tracker-api";

afterEach(() => vi.unstubAllGlobals());

it("posts all tag updates in a single request", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response("[]", {
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const tags = [
    { id: "first", name: "Renamed" },
    { id: "second", tone: "#aabbcc" },
  ];
  await updateTrackerTags(tags);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/board/tags/batch",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ tags }),
    }),
  );
});
