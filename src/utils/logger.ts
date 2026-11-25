export type AuditStatus = "success" | "error";

export function writeAuditLog(
  toolName: string,
  durationMs: number,
  status: AuditStatus,
): void {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      tool_name: toolName,
      duration_ms: durationMs,
      status,
    })}\n`,
  );
}
