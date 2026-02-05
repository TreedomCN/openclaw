import { redbookPlugin, redbookActions } from "./channel";

export * from "./channel";

const plugin = {
  id: "redbooknote",
  name: "RedBook Note",
  description: "Xiaohongshu automation for posting and interaction",
  register: (api: any) => {
    api.registerChannel(redbookPlugin);

    // Register custom tools/actions if supported by the plugin API directly
    // This assumes `api.registerTool` or similar exists for exposing actions globally
    if (redbookActions) {
      const actions = redbookActions.listActions();
      for (const action of actions) {
        api.registerTool({
          name: `redbook_${action.name}`,
          description: action.description,
          parameters: action.parameters,
          execute: async (toolCallId: string, args: any) => {
            api.logger.info(`[RedBook] Executing tool ${action.name}`);
            const result = await redbookActions.handleAction({
              action: action.name,
              parameters: args,
              runtime: api.runtime,
              logger: api.logger,
            } as any);
            return {
              content: [{ type: "text", text: JSON.stringify(result) }],
            };
          },
        });
      }
    }
  },
};

export default plugin;
