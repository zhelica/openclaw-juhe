/**
 * Juhe 回调处理
 */

import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { resolveJuheAccount } from "./config.js";
import { handleJuheMessage, handleJuheEvent } from "./bot.js";
import type { JuheCallbackEvent, JuheCallbackEventType } from "./types.js";

/**
 * 解析回调事件
 */
export function parseJuheCallbackEvent(body: unknown): JuheCallbackEvent | null {
  try {
    if (typeof body === "string") {
      return JSON.parse(body) as JuheCallbackEvent;
    }
    return body as JuheCallbackEvent;
  } catch {
    return null;
  }
}

/**
 * 处理 Juhe 回调
 */
export async function handleJuheCallback(params: {
  cfg: ClawdbotConfig;
  body: unknown;
  accountId?: string;
  runtime?: RuntimeEnv;
}): Promise<{ success: boolean; error?: string }> {
  const { cfg, body, accountId, runtime } = params;

  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  const event = parseJuheCallbackEvent(body);
  if (!event) {
    error("juhe: failed to parse callback event");
    return { success: false, error: "Invalid callback body" };
  }

  // 获取 GUID：
  // - 回调消息：guid 在 data.event.guid
  // - 广播消息：guid 在 data.event.guid（data 是 WebSocket 消息顶层）
  // - 直接传入内层事件：guid 在 data.guid（顶层）
  const bodyObj = body as Record<string, unknown> | null;
  const eventData = bodyObj && "event" in bodyObj ? bodyObj.event as Record<string, unknown> : bodyObj;
  const guid = (eventData?.guid as string) || (bodyObj && "guid" in bodyObj ? bodyObj.guid as string : "");

  // 兼容两种格式：如果有 event 属性，把 event 里的字段提升到外层
  const normalizedEvent = bodyObj && "event" in bodyObj
    ? { ...eventData, guid }
    : { ...(bodyObj || {}), guid };

  log(`juhe: received callback event type=${normalizedEvent.notify_type || normalizedEvent.msg_type}, guid=${guid}`);

  // 验证 GUID 是否匹配配置
  const account = resolveJuheAccount({ cfg, accountId });
  if (guid && account.guid && guid !== account.guid) {
    error(`juhe: GUID mismatch (expected ${account.guid}, got ${guid})`);
    return { success: false, error: "GUID mismatch" };
  }

  try {
    // 处理新消息事件
    // 企微: 11010 (单条消息), 11013 (批量消息)
    // 个微: 1010 (单条消息), 1011 (批量消息)
    const isNewMsg = normalizedEvent.notify_type === 11010 || normalizedEvent.notify_type === 11013 ||
                      normalizedEvent.notify_type === 1010 || normalizedEvent.notify_type === 1011 ||
                      normalizedEvent.msg_type === 1;

    if (isNewMsg) {
      await handleJuheMessage({ cfg, event: normalizedEvent, accountId, runtime });
      return { success: true };
    }

    // 处理其他事件
    await handleJuheEvent({ cfg, event: normalizedEvent, runtime });
    return { success: true };
  } catch (err) {
    error(`juhe: callback handling failed: ${String(err)}`);
    return { success: false, error: String(err) };
  }
}

/**
 * HTTP 回调处理器（用于 OpenClaw webhook）
 */
export function createJuheCallbackHandler(params: {
  cfg: ClawdbotConfig;
  runtime?: RuntimeEnv;
}): (body: unknown) => Promise<{ success: boolean; error?: string }> {
  return async (body: unknown) => {
    return handleJuheCallback({ cfg: params.cfg, body, runtime: params.runtime });
  };
}
