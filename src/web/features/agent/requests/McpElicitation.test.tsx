// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CodexRequests } from "./CodexRequests";
import { PreferencesProvider } from "@/shared/i18n/preferences";
import { internalTasksPolicy } from "@contracts/policy.js";
import type { RpcMessage } from "@contracts/agent.js";

const approval: RpcMessage = {
  id: 0,
  method: "mcpServer/elicitation/request",
  params: {
    mode: "form",
    serverName: "playwright",
    message: 'Allow the playwright MCP server to run tool "browser_navigate"?',
    requestedSchema: { type: "object", properties: {} },
    _meta: {
      codex_approval_kind: "mcp_tool_call",
      persist: ["session", "always"],
      tool_description: "Navigate to a URL",
      tool_params_display: [{ name: "url", value: "http://localhost:5176/tasks?task=fixture" }],
    },
  },
};
beforeEach(() => {
  localStorage.setItem(
    internalTasksPolicy.preferencesStorageKey,
    JSON.stringify({ locale: "en", theme: "dark" }),
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
const mount = (event = approval, onRespond = vi.fn().mockResolvedValue(true)) => {
  render(
    <PreferencesProvider>
      <CodexRequests events={[event]} disabled={false} onRespond={onRespond} />
    </PreferencesProvider>,
  );
  return onRespond;
};

it.each([
  ["Approve once", "accept", {}],
  ["Decline", "decline", null],
  ["Cancel", "cancel", null],
])(
  "handles the native empty-schema MCP request with %s and request ID zero",
  async (button, action, content) => {
    const respond = mount();
    expect(screen.getByText(String(approval.params.message))).toBeTruthy();
    expect(screen.getByText("http://localhost:5176/tasks?task=fixture")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(respond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: String(button) }));
    await waitFor(() =>
      expect(respond).toHaveBeenCalledExactlyOnceWith(0, { action, content, _meta: null }),
    );
  },
);

it("renders typed fields, validates required values and preserves answers after failed or cancelled confirmation", async () => {
  const respond = mount(
    {
      ...approval,
      params: {
        mode: "form",
        serverName: "questions",
        message: "Choose implementation details",
        requestedSchema: {
          type: "object",
          required: ["note", "mode", "count", "enabled", "platforms"],
          properties: {
            note: { type: "string", title: "Details", minLength: 3 },
            mode: {
              type: "string",
              title: "Mode",
              oneOf: [
                { const: "safe", title: "Safe mode" },
                { const: "fast", title: "Fast mode" },
              ],
            },
            count: { type: "integer", title: "Retries", minimum: 0, maximum: 2 },
            enabled: { type: "boolean", title: "Enabled" },
            platforms: {
              type: "array",
              title: "Platforms",
              minItems: 1,
              maxItems: 1,
              items: {
                anyOf: [
                  { const: "linux", title: "Linux" },
                  { const: "mac", title: "Mac" },
                ],
              },
            },
            extra: { type: "string", title: "Optional note" },
          },
        },
      },
    },
    vi.fn().mockResolvedValue(false),
  );
  const send = screen.getByRole<HTMLButtonElement>("button", { name: "Send answer" });
  expect(send.disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "Details *" }), {
    target: { value: "Investigate first" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Mode *" }), {
    target: { value: "safe" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Retries *" }), {
    target: { value: "0" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Enabled *" }), {
    target: { value: "false" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Linux" }));
  expect(send.disabled).toBe(false);
  fireEvent.click(screen.getByRole("checkbox", { name: "Mac" }));
  expect(send.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "Mac" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Retries *" }), {
    target: { value: "1.5" },
  });
  expect(send.disabled).toBe(true);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Retries *" }), {
    target: { value: "0" },
  });
  fireEvent.click(send);
  await waitFor(() => expect(send.disabled).toBe(false));
  expect(respond).toHaveBeenCalledExactlyOnceWith(0, {
    action: "accept",
    content: {
      note: "Investigate first",
      mode: "safe",
      count: 0,
      enabled: false,
      platforms: ["linux"],
    },
    _meta: null,
  });
  expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Details *" }).value).toBe(
    "Investigate first",
  );
});

it("offers URL completion explicitly and keeps unsafe URLs out of links", async () => {
  const request = {
    ...approval,
    params: {
      mode: "url",
      serverName: "login",
      message: "Complete the browser step",
      url: "https://example.test/verify",
    },
  };
  const respond = mount(request);
  expect(screen.getByRole<HTMLAnchorElement>("link").href).toBe("https://example.test/verify");
  expect(respond).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() =>
    expect(respond).toHaveBeenCalledWith(0, { action: "accept", content: null, _meta: null }),
  );
  cleanup();
  mount({ ...request, params: { ...request.params, url: "javascript:alert(1)" } });
  expect(screen.queryByRole("link")).toBeNull();
});

it("preserves native request_user_input handling and leaves unknown schemas available as protocol replies", async () => {
  const respond = mount({
    id: "question",
    method: "item/tool/requestUserInput",
    params: {
      questions: [
        {
          id: "target",
          question: "Which platform?",
          options: [{ label: "Linux", description: "Primary" }],
        },
      ],
    },
  });
  fireEvent.click(screen.getByRole("radio", { name: /Linux/ }));
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() =>
    expect(respond).toHaveBeenCalledWith("question", {
      answers: { target: { answers: ["Linux"] } },
    }),
  );
  cleanup();
  mount({
    ...approval,
    params: {
      ...approval.params,
      requestedSchema: { type: "object", properties: { nested: { type: "object" } } },
    },
  });
  expect(screen.getByRole("textbox", { name: "Protocol response (JSON)" })).toBeTruthy();
  expect(screen.getByText(String(approval.params.message))).toBeTruthy();
});
