"use client";

import type { InvestigationCommand } from "../contracts/investigation-command";
import { asInvestigationId, type InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { InvestigationListItem } from "../contracts/investigation-snapshot";
import type { SourceSelection } from "../contracts/source-operation";
import type { InvestigationManagementAuthorityPort, InvestigationRefreshStarted } from "../ports/investigation-authority-port";
import type { InvestigationListOptions } from "../ports/investigation-repository";

export class InvestigationAuthorityError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function read<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new InvestigationAuthorityError(response.status, value?.message ?? "Investigation authority request failed.");
  return value as T;
}

export class HttpInvestigationAuthority implements InvestigationManagementAuthorityPort {
  constructor(private readonly baseUrl = "/api/lattice/investigations") {}

  async create(subjectLabel: string, query: string, selections: readonly SourceSelection[]): Promise<InvestigationSnapshot> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjectLabel, query, selections }),
      cache: "no-store",
    });
    return read<InvestigationSnapshot>(response);
  }

  async list(options: InvestigationListOptions = {}): Promise<readonly InvestigationListItem[]> {
    const query = new URLSearchParams({
      includeArchived: String(options.includeArchived ?? false),
      limit: String(options.limit ?? 20),
    });
    const response = await fetch(`${this.baseUrl}?${query.toString()}`, { cache: "no-store" });
    return read<readonly InvestigationListItem[]>(response);
  }

  archive(id: InvestigationId): Promise<InvestigationSnapshot> {
    return this.dispatch({ type: "archive", investigationId: id, occurredAt: new Date().toISOString() });
  }

  restore(id: InvestigationId): Promise<InvestigationSnapshot> {
    return this.dispatch({ type: "restore", investigationId: id, occurredAt: new Date().toISOString() });
  }

  async beginRefresh(id: InvestigationId, expectedRevision: number): Promise<InvestigationRefreshStarted> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(id)}/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision }),
      cache: "no-store",
    });
    return read<InvestigationRefreshStarted>(response);
  }

  async dispatch(command: InvestigationCommand): Promise<InvestigationSnapshot> {
    if (command.type === "create") throw new Error("Creation must be requested from the server-owned create endpoint.");
    const id = investigationIdOf(command);
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command }),
      cache: "no-store",
    });
    return read<InvestigationSnapshot>(response);
  }

  async load(id: InvestigationId): Promise<InvestigationSnapshot | undefined> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (response.status === 404) return undefined;
    return read<InvestigationSnapshot>(response);
  }
}

function investigationIdOf(command: Exclude<InvestigationCommand, { type: "create" }>): InvestigationId {
  if (command.type === "source-requested" || command.type === "source-started") return command.identity.investigationId;
  if (command.type === "source-completed") return command.result.identity.investigationId;
  return asInvestigationId(command.investigationId);
}
