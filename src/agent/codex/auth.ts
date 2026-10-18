import type { RpcMessage } from "../../api/contracts/agent.js";
import type { CodexRpc } from "./rpc.js";

/** Account operations use the same app-server as the sessions, avoiding stale auth caches. */
export class CodexAuthentication {
  private output = "";
  private running = false;
  constructor(private readonly rpc: CodexRpc) {
    rpc.on("notification", (event: RpcMessage) => {
      if (event.method === "account/login/completed") {
        this.running = false;
        this.output = event.params.success
          ? ""
          : typeof event.params.error === "string"
            ? event.params.error
            : "Codex sign-in failed.";
      }
      if (event.method === "bridge/disconnected") this.running = false;
    });
  }
  get loginRunning() {
    return this.running;
  }
  check = async () => {
    const result = await this.rpc.call<{ account: object | null; requiresOpenaiAuth: boolean }>(
      "account/read",
      { refreshToken: false },
    );
    return Boolean(result.account) || result.requiresOpenaiAuth === false;
  };
  status = async () => ({
    authenticated: await this.check(),
    loginRunning: this.running,
    loginOutput: this.output,
  });
  start = async () => {
    if (this.running) return;
    this.running = true;
    this.output = "";
    try {
      const result = await this.rpc.call<{ verificationUrl: string; userCode: string }>(
        "account/login/start",
        { type: "chatgptDeviceCode" },
      );
      this.output = `${result.verificationUrl}\n${result.userCode}`;
    } catch (error) {
      this.running = false;
      throw error;
    }
  };
}
