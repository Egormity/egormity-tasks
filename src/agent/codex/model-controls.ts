import type { ChatControls, ModelSettings } from "../../api/contracts/commands.js";
import type { Model } from "../../api/contracts/codex/v2/Model.js";
import type { ReasoningEffort } from "../../api/contracts/codex/ReasoningEffort.js";
import type { CodexRpc } from "./rpc.js";

export const listModels = async (rpc: CodexRpc) => {
  const data: Model[] = [];
  let cursor: string | null = null;
  do {
    const page: { data: Model[]; nextCursor: string | null } = await rpc.call("model/list", {
      cursor,
      limit: 100,
    });
    data.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return data.filter((model) => !model.hidden);
};

export const supportsSettings = async (rpc: CodexRpc, input: ModelSettings) => {
  const model = (await listModels(rpc)).find((value) => value.model === input.model);
  return (
    !!model &&
    model.supportedReasoningEfforts.some((value) => value.reasoningEffort === input.effort) &&
    (input.serviceTier === null ||
      model.serviceTiers.some((value) => value.id === input.serviceTier))
  );
};

// Read native effective defaults without allocating a thread. Only these public settings
// leave Gateway; config/read also contains private configuration which is never relayed.
export const defaultControls = async (
  rpc: CodexRpc,
  cwd: string,
  modelOverride?: string,
): Promise<ChatControls> => {
  const [models, { config }] = await Promise.all([
    listModels(rpc),
    rpc.call<{
      config: {
        model: string | null;
        model_reasoning_effort: ReasoningEffort | null;
        service_tier: string | null;
      };
    }>("config/read", { cwd, includeLayers: false }),
  ]);
  const model =
    modelOverride ||
    config.model ||
    models.find((value) => value.isDefault)?.model ||
    models[0]?.model;
  if (!model) throw Error("Codex did not return a default model.");
  const catalog = models.find((value) => value.model === model);
  return {
    models,
    model,
    effort: config.model_reasoning_effort ?? catalog?.defaultReasoningEffort ?? null,
    serviceTier: catalog?.serviceTiers.some((tier) => tier.id === config.service_tier)
      ? config.service_tier
      : (catalog?.defaultServiceTier ?? null),
  };
};
