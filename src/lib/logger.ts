// Structured Audit Logger for Iranian Restaurant Operations

export interface AuditLogEntry {
  timestamp?: string;
  restaurant_id?: string;
  actor_id?: string;
  order_id?: string;
  action: string;
  latency_ms?: number;
  error_code?: string;
  metadata?: Record<string, unknown>;
}

export function logAuditEvent(entry: AuditLogEntry): void {
  const payload = {
    timestamp: entry.timestamp || new Date().toISOString(),
    restaurant_id: entry.restaurant_id || "unspecified",
    actor_id: entry.actor_id || "anonymous",
    order_id: entry.order_id || null,
    action: entry.action,
    latency_ms: entry.latency_ms ?? 0,
    error_code: entry.error_code || null,
    metadata: entry.metadata || {},
  };

  // Structured JSON output for CloudWatch / Vercel Logs / Console
  if (entry.error_code) {
    console.error(`[AUDIT_LOG_ERROR] ${JSON.stringify(payload)}`);
  } else {
    console.log(`[AUDIT_LOG] ${JSON.stringify(payload)}`);
  }
}

