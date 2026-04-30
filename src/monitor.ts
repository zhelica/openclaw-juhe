/**
 * Juhe 回调监听服务
 *
 * 支持两种方式接收回调：
 * 1. WebSocket 客户端 - 主动连接到服务器，无需公网 IP（推荐）
 * 2. HTTP 回调服务器 - 接收来自 aggregate_chat 的 HTTP 回调
 */

import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { resolveJuheAccount } from "./config.js";
import { createJuheClient } from "./client.js";
import { handleJuheCallback } from "./callback.js";
import type { ResolvedJuheAccount } from "./types.js";

/** 监听器状态 */
interface JuheMonitorState {
  accountId: string;
  running: boolean;
  mode: "websocket";
  server?: any;
  ws?: WebSocket | null;
  abortController?: AbortController;
}

/** 活跃的监听器 */
const activeMonitors = new Map<string, JuheMonitorState>();

/** WebSocket 重连配置 */
const WS_RECONNECT_INTERVAL = 5000; // 5秒重连
const WS_MAX_RECONNECT_ATTEMPTS = 10;

/**
 * 启动 Juhe WebSocket 客户端
 * 主动连接到服务器接收回调，无需公网 IP
 */
async function startWebSocketClient(params: {
  account: ResolvedJuheAccount;
  accountId: string;
  cfg: ClawdbotConfig;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
  abortController: AbortController;
}): Promise<void> {
  const { account, accountId, cfg, runtime, abortSignal, abortController } = params;
  const log = runtime.log ?? console.log;
  const error = runtime.error ?? console.error;

  // 使用解析后的 WebSocket 地址
  const wsUrl = account.wsUrl || account.baseUrl.replace(/^http/, "ws") + "/ws/juhe";

  log(`juhe[${accountId}]: connecting to WebSocket server ${wsUrl}`);

  let reconnectAttempts = 0;
  let ws: WebSocket | null = null;

  const connect = () => {
    return new Promise<void>((resolve, reject) => {
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          log(`juhe[${accountId}]: WebSocket connected`);
          reconnectAttempts = 0;

          // 发送认证消息
          const authMsg = {
            type: "auth",
            app_key: account.appKey,
            app_secret: account.appSecret,
            guid: account.guid,
          };

          ws?.send(JSON.stringify(authMsg));
          log(`juhe[${accountId}]: auth message sent`);

          // 更新状态
          const state = activeMonitors.get(accountId);
          if (state) {
            state.ws = ws;
          }

          resolve();
        };

        ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "auth_success") {
              log(`juhe[${accountId}]: authentication success`);
            } else if (data.type === "callback") {
              // 处理回调事件（服务端包装了 type: callback）
              // 注意：guid 在 data 顶层，不在 data.event 中，需要传递完整 data
              const eventId = data.event_id;
              const result = await handleJuheCallback({
                cfg,
                body: data.event,  // 传递完整 data 以包含 guid
                accountId,
                runtime,
              });

              if (!result.success) {
                error(`juhe[${accountId}]: callback handling failed: ${result.error}`);
              }

              // 发送确认
              if (eventId) {
                ws?.send(JSON.stringify({
                  type: "ack",
                  event_id: eventId,
                  success: result.success,
                }));
              }
            } else if (data.msg_type !== undefined || (data.event && data.event.msg_type !== undefined)) {
              // 服务端直接广播的消息（不带 type: callback 包装）
              // 例如 openai_bot_plugin 发送的消息
              // msg_type 可能在顶层（data.msg_type），也可能在 event 对象内（data.event.msg_type）
              const msgType = data.msg_type ?? data.event?.msg_type;
              log(`juhe[${accountId}]: received broadcast message, msg_type=${msgType}`);
              const result = await handleJuheCallback({
                cfg,
                body: data,
                accountId,
                runtime,
              });

              if (!result.success) {
                error(`juhe[${accountId}]: callback handling failed: ${result.error}`);
              }
            } else if (data.type === "error") {
              error(`juhe[${accountId}]: server error: ${data.message}`);
            } else {
              log(`juhe[${accountId}]: received unknown message type: ${data.type || 'undefined'}`);
            }
          } catch (err) {
            error(`juhe[${accountId}]: message handling failed: ${String(err)}`);
          }
        };

        ws.onerror = (err) => {
          error(`juhe[${accountId}]: WebSocket error: ${String(err)}`);
          reject(err);
        };

        ws.onclose = () => {
          log(`juhe[${accountId}]: WebSocket closed`);

          // 检查是否应该重连
          if (!abortController.signal.aborted && reconnectAttempts < WS_MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            log(`juhe[${accountId}]: reconnecting... (${reconnectAttempts}/${WS_MAX_RECONNECT_ATTEMPTS})`);

            setTimeout(() => {
              if (!abortController.signal.aborted) {
                connect().catch((err) => {
                  error(`juhe[${accountId}]: reconnect failed: ${String(err)}`);
                });
              }
            }, WS_RECONNECT_INTERVAL);
          } else if (reconnectAttempts >= WS_MAX_RECONNECT_ATTEMPTS) {
            error(`juhe[${accountId}]: max reconnection attempts reached, giving up`);
            activeMonitors.delete(accountId);
          }
        };

        // 保存引用
        const state = activeMonitors.get(accountId);
        if (state) {
          state.ws = ws;
        }
      } catch (err) {
        reject(err);
      }
    });
  };

  await connect();

  // 等待中止信号
  await new Promise<void>((resolve) => {
    abortController.signal.addEventListener("abort", () => {
      log(`juhe[${accountId}]: stopping WebSocket client`);
      if (ws) {
        ws.close();
      }
      activeMonitors.delete(accountId);
      resolve();
    });
  });
}

/**
 * 启动 Juhe 回调监听服务
 * 使用 WebSocket 方式（无需公网 IP）
 */
export async function startJuheMonitor(params: {
  cfg: ClawdbotConfig;
  accountId: string;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
}): Promise<void> {
  const { cfg, accountId, runtime, abortSignal } = params;

  const account = resolveJuheAccount({ cfg, accountId });
  const log = runtime.log ?? console.log;
  const error = runtime.error ?? console.error;

  if (!account.configured) {
    throw new Error(`Juhe account ${accountId} not configured`);
  }

  // 检查是否已有运行中的监听器
  const existing = activeMonitors.get(accountId);
  if (existing?.running) {
    log(`juhe[${accountId}]: monitor already running`);
    return;
  }

  // 创建 AbortController
  const abortController = new AbortController();

  // 合并外部 AbortSignal
  abortSignal.addEventListener("abort", () => {
    abortController.abort();
  });

  // 初始化监听器状态
  activeMonitors.set(accountId, {
    accountId,
    running: true,
    mode: "websocket",
    abortController,
  });

  try {
    // 使用 WebSocket 方式（推荐，无需公网 IP）
    log(`juhe[${accountId}]: using WebSocket mode`);
    await startWebSocketClient({ account, accountId, cfg, runtime, abortSignal, abortController });
  } catch (err) {
    error(`juhe[${accountId}]: monitor failed to start: ${String(err)}`);
    activeMonitors.delete(accountId);
    throw err;
  }
}

/**
 * 停止 Juhe 回调监听服务
 */
export function stopJuheMonitor(accountId: string): void {
  const monitor = activeMonitors.get(accountId);
  if (monitor?.abortController) {
    monitor.abortController.abort();
  }
}

/**
 * 获取监听器状态
 */
export function getJuheMonitorState(accountId: string): JuheMonitorState | undefined {
  return activeMonitors.get(accountId);
}
