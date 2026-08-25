"use client";
import { LATTICE_HANDOFF_PREFIX, validateHandoff, type HandoffReadResult, type LatticeHandoff } from "../contracts/handoff";

export function writeHandoff(value: LatticeHandoff): HandoffReadResult {
  const valid = validateHandoff(value);
  if (!valid.ok) return valid;
  try {
    const key = `${LATTICE_HANDOFF_PREFIX}${value.handoffId}`;
    sessionStorage.setItem(key, JSON.stringify(value));
    return readHandoff(value.handoffId);
  } catch {
    return { ok: false, code: "storage-unavailable", message: "The browser could not preserve the Lattice handoff." };
  }
}

export function readHandoff(id: string): HandoffReadResult {
  try {
    const raw = sessionStorage.getItem(`${LATTICE_HANDOFF_PREFIX}${id}`);
    if (!raw) return { ok: false, code: "not-found", message: "The Lattice handoff could not be found." };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { ok: false, code: "serialization-failed", message: "The stored handoff could not be read." }; }
    const result = validateHandoff(parsed);
    if (!result.ok && result.code === "expired") sessionStorage.removeItem(`${LATTICE_HANDOFF_PREFIX}${id}`);
    return result;
  } catch {
    return { ok: false, code: "storage-unavailable", message: "Browser session storage is unavailable." };
  }
}
