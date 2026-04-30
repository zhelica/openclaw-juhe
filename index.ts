/**
 * openclaw-juhe - OpenClaw Channel Plugin for aggregate_chat
 *
 * 主入口文件
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { setJuheRuntime } from "./src/runtime.js";
import { juhePlugin } from "./src/channel.js";

export {
  sendMessageJuhe,
  sendImageJuhe,
  sendFileJuhe,
} from "./src/send.js";
export {
  handleJuheCallback,
  parseJuheCallbackEvent,
  createJuheCallbackHandler,
} from "./src/callback.js";
export {
  startJuheMonitor,
  stopJuheMonitor,
  getJuheMonitorState,
} from "./src/monitor.js";
export {
  resolveJuheAccount,
  listJuheAccountIds,
  isContact,
  isRoomAvailable,
  doesRoomRequireMention,
} from "./src/config.js";
export {
  looksLikeJuheId,
  formatJuheTarget,
  normalizeJuheTarget,
  parseJuheTarget,
} from "./src/targets.js";
export { juhePlugin } from "./src/channel.js";

/**
 * Plugin definition for OpenClaw
 */
const plugin = {
  id: "juhe",
  name: "Juhe (聚合聊天)",
  description: "建立微信和企业微信聊天通道",
  version: "2026.3.26",
  register(api: OpenClawPluginApi) {
    // 设置 Runtime
    setJuheRuntime(api.runtime);

    // 注册 Channel Plugin
    api.registerChannel({ plugin: juhePlugin });

    api.logger.info("Juhe channel plugin registered");
  },
};

export default plugin;
