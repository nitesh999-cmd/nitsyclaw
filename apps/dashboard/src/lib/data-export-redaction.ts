import { redactAuditString, sanitizeAuditPayload } from "@nitsyclaw/shared/db";

type JsonRecord = Record<string, unknown>;

export type AuditExportRow = JsonRecord & {
  input?: JsonRecord | null;
  output?: JsonRecord | null;
  error?: string | null;
};

export type ConnectedAccountExportRow = JsonRecord & {
  accessToken?: string | null;
  refreshToken?: string | null;
  metadata?: JsonRecord | null;
};

export function redactAuditExportRows(rows: AuditExportRow[]): AuditExportRow[] {
  return rows.map((row) => ({
    ...row,
    input: sanitizeAuditPayload(row.input),
    output: sanitizeAuditPayload(row.output),
    error: row.error ? redactAuditString(row.error) : row.error ?? null,
  }));
}

export function redactConnectedAccountExportRows(rows: ConnectedAccountExportRow[]): ConnectedAccountExportRow[] {
  return rows.map((row) => ({
    ...row,
    accessToken: "[redacted]",
    refreshToken: row.refreshToken ? "[redacted]" : null,
    metadata: sanitizeAuditPayload(row.metadata),
  }));
}
