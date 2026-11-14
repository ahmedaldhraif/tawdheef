import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantUsageCollector, createAssistantEventReader, sanitizeAssistantUsage } from '../server/assistant-usage.mjs';

test('only terminal CLI usage snapshots supply counters; repeated snapshots are not summed', () => {
  const usage = createAssistantUsageCollector();
  usage.observe({ type: 'assistant', message: { usage: { input_tokens: 999 }, content: [{ type: 'text', text: 'private CV and reasoning' }] } });
  usage.observe({ type: 'user', message: { content: [{ type: 'tool_result', content: '{"type":"turn.completed","usage":{"input_tokens":999}}' }] } });
  assert.equal(usage.snapshot(), null);
  const final = { type: 'turn.completed', usage: { input_tokens: 123, cached_input_tokens: 100, output_tokens: 20, reasoning_output_tokens: 5 } };
  usage.observe(final); usage.observe(final);
  assert.deepEqual(usage.snapshot(), { schemaVersion: 1, source: 'codex.turn.completed', inputTokens: 123, cachedInputTokens: 100, cacheCreationInputTokens: null, outputTokens: 20, reasoningOutputTokens: 5, turns: null, toolCalls: null, clientEstimatedCostUsd: null });
  assert.ok(!JSON.stringify(usage.snapshot()).includes('private'));
});

test('Claude cumulative result keeps input, cache reads/writes and client cost estimate separate', () => {
  const usage = createAssistantUsageCollector();
  const use = { type: 'tool_use', id: 'fixture-tool', name: 'private-name', input: { text: 'private-input' } };
  usage.observe({ type: 'assistant', message: { content: [use] } });
  usage.observe({ type: 'assistant', message: { content: [use, { type: 'server_tool_use', id: 'fixture-search' }] } });
  usage.observe({ type: 'result', usage: { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 20, output_tokens: 30 }, num_turns: 3, total_cost_usd: 0.125, result: 'private-result', session_id: 'private-session' });
  const result = usage.snapshot();
  assert.equal(result.inputTokens, 10); assert.equal(result.cachedInputTokens, 100); assert.equal(result.cacheCreationInputTokens, 20);
  assert.equal(result.outputTokens, 30); assert.equal(result.turns, 3); assert.equal(result.toolCalls, 2); assert.equal(result.clientEstimatedCostUsd, 0.125);
  assert.ok(!JSON.stringify(result).includes('private'));
});

test('missing or malformed counters remain null, while an actual reported zero remains zero', () => {
  const result = sanitizeAssistantUsage({ schemaVersion: 1, source: 'codex.turn.completed', inputTokens: '100', cachedInputTokens: -1, outputTokens: 0, reasoningOutputTokens: Number.MAX_SAFE_INTEGER + 1, turns: NaN, toolCalls: 1.5, clientEstimatedCostUsd: Infinity, secret: 'private' });
  assert.equal(result.inputTokens, null); assert.equal(result.cachedInputTokens, null); assert.equal(result.outputTokens, 0);
  assert.equal(result.reasoningOutputTokens, null); assert.equal(result.turns, null); assert.equal(result.toolCalls, null); assert.equal(result.clientEstimatedCostUsd, null);
  assert.equal(Object.hasOwn(result, 'secret'), false);
  assert.equal(sanitizeAssistantUsage({ schemaVersion: 1, source: 'company.webpage', inputTokens: 99 }), null);
});

test('tool invocations deduplicate IDs and incomplete streams do not report an exact tool count', () => {
  const usage = createAssistantUsageCollector();
  for (let i = 0; i < 2; i++) usage.observe({ type: 'item.completed', item: { type: 'mcp_tool_call', id: 'one-call', arguments: 'private' } });
  usage.observe({ type: 'turn.completed', usage: { input_tokens: 1 } });
  assert.equal(usage.snapshot().toolCalls, 1);
  usage.incomplete(); assert.equal(usage.snapshot().toolCalls, null);
});

test('bounded JSONL framing recovers after oversized lines and processes split UTF-8 and final unterminated events', () => {
  const events = []; let skipped = 0;
  const reader = createAssistantEventReader(e => events.push(e), { maxLineChars: 150, onSkipped: () => skipped++ });
  reader.write(Buffer.from('x'.repeat(200))); reader.write(Buffer.from('\n'));
  const unicode = Buffer.from('{"type":"fixture","text":"مرحبا"}\n');
  for (const byte of unicode) reader.write(Buffer.from([byte]));
  reader.write(Buffer.from('not JSON\n[]\n{"type":"turn.completed","usage":{"input_tokens":7}}'));
  reader.end(); reader.end();
  assert.equal(skipped, 3); assert.equal(events.length, 2); assert.equal(events[0].text, 'مرحبا'); assert.equal(events[1].usage.input_tokens, 7);
});
