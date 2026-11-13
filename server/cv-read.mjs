import { randomUUID } from "node:crypto";
import { renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const unavailableStates = new Set([
  "pending",
  "pending_approval",
  "approval_required",
  "requires_approval",
  "needs_approval",
  "awaiting_approval",
  "waiting",
  "waiting_for_approval",
  "waiting_for_user",
  "awaiting_user",
  "needs_user",
  "requires_action",
  "action_required",
  "authorization_required",
  "auth_required",
  "authentication_required",
  "not_authenticated",
  "unauthorized",
  "queued",
  "processing",
  "in_progress",
  "error",
  "failed",
  "failure",
  "rejected",
  "denied",
  "blocked",
]);

const meaningful = (value) => {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(meaningful);
  return Boolean(
    value && typeof value === "object" && Object.keys(value).length,
  );
};
const normalizedState = (value) =>
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
    : "";

function assertAvailableEnvelope(value, depth = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 6)
    return;
  if (
    value.isError === true ||
    value.ok === false ||
    value.success === false ||
    meaningful(value.error)
  ) {
    throw new Error(
      "Tabbio could not return a usable response. Check the connection and readCV tool mapping, then try again.",
    );
  }
  if (
    ["status", "state", "approvalStatus"].some((key) =>
      unavailableStates.has(normalizedState(value[key])),
    ) ||
    [
      "requiresApproval",
      "approvalRequired",
      "needsApproval",
      "pendingApproval",
      "pending",
    ].some((key) => value[key] === true) ||
    value.approval?.required === true
  ) {
    throw new Error(
      "Tabbio is waiting for approval or a completed request. Complete that step in Tabbio, then read again.",
    );
  }
  // Inspect tool envelopes, never a person's CV history or arbitrary nested CV fields.
  for (const key of ["data", "result", "response", "approval"]) {
    if (Object.hasOwn(value, key)) {
      if (
        ["data", "result", "response"].includes(key) &&
        !meaningful(value[key])
      ) {
        throw new Error(
          "Tabbio returned an empty response. Check the readCV tool mapping and try again.",
        );
      }
      assertAvailableEnvelope(value[key], depth + 1);
    }
  }
}

/** Validate the returned tool response without claiming a provider-specific CV schema. */
export function validateCvResponse(result) {
  if (!result || typeof result !== "object" || result.isError === true) {
    throw new Error(
      "Tabbio could not return the response. Check the connection and readCV tool mapping.",
    );
  }
  assertAvailableEnvelope(result);
  const hasStructuredContent = Object.hasOwn(result, "structuredContent");
  if (hasStructuredContent) {
    if (!meaningful(result.structuredContent))
      throw new Error(
        "Tabbio returned an empty response. Check the readCV tool mapping and try again.",
      );
    assertAvailableEnvelope(result.structuredContent);
  }
  if (
    !hasStructuredContent &&
    (!Array.isArray(result.content) || result.content.length === 0)
  ) {
    throw new Error(
      "Tabbio returned an empty response. Check the readCV tool mapping and try again.",
    );
  }
  let hasContent = false;
  for (const block of Array.isArray(result.content) ? result.content : []) {
    if (block.type === "text") {
      if (!meaningful(block.text)) continue;
      hasContent = true;
      let parsed;
      try {
        parsed = JSON.parse(block.text);
      } catch {
        continue;
      }
      if (!meaningful(parsed))
        throw new Error(
          "Tabbio returned an empty response. Check the readCV tool mapping and try again.",
        );
      assertAvailableEnvelope(parsed);
    } else if (block.type === "resource") {
      hasContent ||=
        meaningful(block.resource?.text) || meaningful(block.resource?.blob);
    } else if (block.type === "resource_link") {
      hasContent ||= typeof block.uri === "string" && block.uri.length > 0;
    } else if (block.type === "image" || block.type === "audio") {
      hasContent ||= typeof block.data === "string" && block.data.length > 0;
    }
  }
  if (!hasStructuredContent && !hasContent)
    throw new Error(
      "Tabbio returned an empty response. Check the readCV tool mapping and try again.",
    );
  return result;
}

export async function readConnectedCv({
  store,
  connections,
  clock = () => new Date(),
  signal,
}) {
  signal?.throwIfAborted();
  const result = validateCvResponse(
    await connections.callMapped("tabbio", "readCV", {}),
  );
  // A bounded setup check may have returned while the provider was still reading.
  // Do not replace the last good cache with a late response from that check.
  signal?.throwIfAborted();
  const target = resolve(store.dataDir, "cv-cache.json");
  const temporary = resolve(store.dataDir, `.cv-cache-${randomUUID()}.tmp`);
  try {
    writeFileSync(
      temporary,
      JSON.stringify({ fetchedAt: new Date(clock()).toISOString(), result }),
      { mode: 0o600, flag: "wx" },
    );
    renameSync(temporary, target);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      /* The existing cache stays untouched. */
    }
    throw error;
  }
  return result;
}
