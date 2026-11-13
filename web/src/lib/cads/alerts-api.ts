
export type ChannelSpec = {
  type: "file" | "log" | "webhook" | "email";
  target: string;
};

export type ApiAlertRule = {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  pc_min: number | null;
  miss_distance_max_m: number | null;
  hours_to_tca_max: number | null;
  object_ids: string[];
  channels: ChannelSpec[];
  created_at: string;
  updated_at: string;
};

export type AlertRuleInput = {
  name: string;
  description?: string | null;
  enabled?: boolean;
  pc_min: number | null;
  miss_distance_max_m: number | null;
  hours_to_tca_max: number | null;
  object_ids: string[];
  channels?: ChannelSpec[];
  actor?: string;
};

export type DeliveryAttempt = {
  attempt_no: number;
  at: string;
  success: boolean;
  error: string | null;
};

export type ApiDelivery = {
  id: number;
  channel_type: string;
  target: string;
  status: "pending" | "sent" | "failed" | "dead";
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  sent_at: string | null;
  attempt_log: DeliveryAttempt[];
};

export type ApiAlert = {
  id: number;
  created_at: string;
  rule: {
    id: number;
    name: string | null;
  };
  event_id: number;
  revision_id: number;
  matched: string[];
  severity: string | null;
  message: Record<string, unknown>;
  deliveries: ApiDelivery[];
};

export type ApiAudit = {
  id: number;
  at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: number;
  details: Record<string, unknown>;
};

export type DispatchResult = {
  attempted: number;
  sent: number;
  failed: number;
  dead: number;
};

export type UiDeliveryStatus =
  | "queued"
  | "sent"
  | "failed"
  | "retried";

const BASE_URL = "/api";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `CADS API ${response.status}: ${message}`
    );
  }

  return (await response.json()) as T;
}

// Backend status -> dashboard status.
// A successful retry remains "sent" in the database.
// The UI can distinguish it using attempts > 1.
export function deliveryStatus(
  delivery: ApiDelivery
): UiDeliveryStatus {
  if (delivery.status === "sent") {
    return delivery.attempts > 1 ? "retried" : "sent";
  }

  if (delivery.status === "failed" ||
      delivery.status === "dead") {
    return "failed";
  }

  return "queued";
}

export function deliveryIsTerminal(
  delivery: ApiDelivery
): boolean {
  return (
    delivery.status === "sent" ||
    delivery.status === "dead"
  );
}

export async function getRules(): Promise<ApiAlertRule[]> {
  return request<ApiAlertRule[]>("/rules");
}

export async function createRule(
  input: AlertRuleInput
): Promise<ApiAlertRule> {
  return request<ApiAlertRule>("/rules", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      channels: input.channels ?? [
        { type: "file", target: "alerts.jsonl" },
      ],
      actor: input.actor ?? "demo-operator",
    }),
  });
}

export async function updateRule(
  id: number,
  input: AlertRuleInput
): Promise<ApiAlertRule> {
  return request<ApiAlertRule>(`/rules/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      ...input,
      channels: input.channels ?? [
        { type: "file", target: "alerts.jsonl" },
      ],
      actor: input.actor ?? "demo-operator",
    }),
  });
}

export async function deleteRule(
  id: number,
  actor = "demo-operator"
): Promise<{ id: number; deleted: boolean }> {
  return request(
    `/rules/${id}?actor=${encodeURIComponent(actor)}`,
    { method: "DELETE" }
  );
}

export async function getAlerts(): Promise<ApiAlert[]> {
  return request<ApiAlert[]>("/alerts");
}

export async function getAudit(
  limit = 200
): Promise<ApiAudit[]> {
  return request<ApiAudit[]>(
    `/audit?limit=${Math.max(1, Math.min(limit, 1000))}`
  );
}

// Processes deliveries that are already due.
// This does not force a retry before next_attempt_at.
export async function dispatchDue(): Promise<DispatchResult> {
  return request<DispatchResult>("/alerts/dispatch", {
    method: "POST",
  });
}

export async function getAlertData() {
  const [rules, alerts, audit] = await Promise.all([
    getRules(),
    getAlerts(),
    getAudit(),
  ]);

  return { rules, alerts, audit };
}
