import { StringDecoder } from 'node:string_decoder';

const SOURCES = new Set(['codex.turn.completed', 'claude.result']);
const COUNTERS = ['inputTokens', 'cachedInputTokens', 'cacheCreationInputTokens', 'outputTokens', 'reasoningOutputTokens', 'turns', 'toolCalls'];
const counter = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const estimate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Persist only this numeric allowlist, never a CLI message, model output or session ID. */
export function sanitizeAssistantUsage(value) {
  if (!value || value.schemaVersion !== 1 || !SOURCES.has(value.source)) return null;
  return {
    schemaVersion: 1,
    source: value.source,
    ...Object.fromEntries(COUNTERS.map(key => [key, counter(value[key])])),
    clientEstimatedCostUsd: estimate(value.clientEstimatedCostUsd),
  };
}

/** Terminal usage is a cumulative snapshot: never add it to intermediate deltas. */
export function createAssistantUsageCollector() {
  let latest = null;
  const tools = new Set();
  let toolCountComplete = true;
  function tool(id) {
    if (typeof id !== 'string' || !id || id.length > 256) return;
    if (tools.size >= 10000 && !tools.has(id)) { toolCountComplete = false; return; }
    tools.add(id);
  }
  return {
    observe(event) {
      if (!event || typeof event !== 'object' || Array.isArray(event)) return;
      if (event.type === 'item.completed' && ['mcp_tool_call', 'web_search', 'command_execution'].includes(event.item?.type)) tool(event.item.id);
      if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
        for (const block of event.message.content) if (['tool_use', 'server_tool_use'].includes(block?.type)) tool(block.id);
      }
      if (event.type === 'turn.completed' && event.usage && typeof event.usage === 'object' && !Array.isArray(event.usage)) {
        latest = sanitizeAssistantUsage({ schemaVersion: 1, source: 'codex.turn.completed', inputTokens: event.usage.input_tokens, cachedInputTokens: event.usage.cached_input_tokens, outputTokens: event.usage.output_tokens, reasoningOutputTokens: event.usage.reasoning_output_tokens });
      } else if (event.type === 'result' && event.usage && typeof event.usage === 'object' && !Array.isArray(event.usage)) {
        latest = sanitizeAssistantUsage({ schemaVersion: 1, source: 'claude.result', inputTokens: event.usage.input_tokens, cachedInputTokens: event.usage.cache_read_input_tokens, cacheCreationInputTokens: event.usage.cache_creation_input_tokens, outputTokens: event.usage.output_tokens, turns: event.num_turns, clientEstimatedCostUsd: event.total_cost_usd });
      }
    },
    incomplete() { toolCountComplete = false; },
    snapshot() {
      return latest ? { ...latest, toolCalls: toolCountComplete && tools.size ? tools.size : null } : null;
    },
  };
}

/** Bounded JSONL framing, including split UTF-8, oversized lines and a final line without LF. */
export function createAssistantEventReader(onEvent, { maxLineChars = 256000, onSkipped = () => {} } = {}) {
  const decoder = new StringDecoder('utf8');
  let pending = '', skipping = false, ended = false;
  function emit() {
    if (!skipping && pending.trim()) {
      try {
        const event = JSON.parse(pending);
        if (event && typeof event === 'object' && !Array.isArray(event)) onEvent(event);
        else onSkipped();
      } catch { onSkipped(); /* Non-JSON progress is not telemetry or evidence. */ }
    }
    pending = ''; skipping = false;
  }
  function append(part) {
    if (skipping) return;
    if (pending.length + part.length > maxLineChars) { pending = ''; skipping = true; onSkipped(); }
    else pending += part;
  }
  function consume(text) {
    let offset = 0, newline;
    while ((newline = text.indexOf('\n', offset)) !== -1) { append(text.slice(offset, newline)); emit(); offset = newline + 1; }
    append(text.slice(offset));
  }
  return {
    write(chunk) { if (!ended) consume(decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))); },
    end() { if (ended) return; ended = true; consume(decoder.end()); emit(); },
  };
}
