import "server-only";

// The n8n webhook address (N8N_WEBHOOK_BASE, e.g. "https://<n8n host>/webhook"), set on Vercel per
// environment. There is no default: if it is missing, calls to n8n fail with a clear log line
// instead of going to a guessed address.
export function n8nWebhookBase(): string | null {
  const v = (process.env.N8N_WEBHOOK_BASE || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/\S+$/.test(v)) {
    console.error("N8N_WEBHOOK_BASE is not set (or isn't a web address)");
    return null;
  }
  return v;
}
