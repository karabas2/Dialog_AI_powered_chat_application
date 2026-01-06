const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export type Model = {
  id: string;
  label: string;
  context_length?: number;

  // optional capabilities provided by backend
  capabilities?: {
    vision?: boolean;
  };
};

export async function apiDeleteSession(sessionId: string): Promise<void> {
  const r = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
    method: "DELETE",
  });

  // delete returns 204 with no json body
  if (!r.ok) {
    const json = await r.json().catch(() => ({}));
    const msg = json?.error?.message ?? `DELETE /api/sessions failed: ${r.status}`;
    throw new Error(msg);
  }
}

export type Session = {
  id: string;
  title: string | null;
  selected_model: string;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export async function apiGetModels(): Promise<{ models: Model[]; default_model: string | null }> {
  const r = await fetch(`${BASE_URL}/api/models`);
  if (!r.ok) throw new Error(`GET /api/models failed: ${r.status}`);
  return r.json();
}

export async function apiCreateSession(input: { title?: string; selected_model?: string }): Promise<Session> {
  const r = await fetch(`${BASE_URL}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`POST /api/sessions failed: ${r.status}`);
  return r.json();
}

export async function apiListSessions(): Promise<{ sessions: Session[] }> {
  const r = await fetch(`${BASE_URL}/api/sessions`);
  if (!r.ok) throw new Error(`GET /api/sessions failed: ${r.status}`);
  return r.json();
}

export async function apiGetSession(id: string): Promise<Session & { messages: Message[] }> {
  const r = await fetch(`${BASE_URL}/api/sessions/${id}`);
  if (!r.ok) throw new Error(`GET /api/sessions/${id} failed: ${r.status}`);
  return r.json();
}

export async function apiPostMessage(
  sessionId: string,
  input: { content: string; model?: string; images?: string[] }
): Promise<{ assistant_message: Message }> {
  const r = await fetch(`${BASE_URL}/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json?.error?.message ?? `POST /messages failed: ${r.status}`;
    throw new Error(msg);
  }
  return json;
}

export async function apiPostMessageMultipart(
  sessionId: string,
  args: { content: string; model?: string; images?: File[] }
) {
  const fd = new FormData();
  fd.set("content", args.content);
  if (args.model) fd.set("model", args.model);

  for (const file of args.images ?? []) {
    fd.append("images", file, file.name);
  }

  // note: backend must accept multipart on this route
  const r = await fetch(`${BASE_URL}/api/sessions/${sessionId}/messages`, {
    method: "POST",
    body: fd,
  });

  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json?.error?.message ?? `POST multipart /messages failed: ${r.status}`;
    throw new Error(msg);
  }
  return json;
}

export async function apiTelemetryEvent(name: string, payload?: any) {
  try {
    await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      //keepalive can be useful to prevent events from being missed when the page is closed
      keepalive: true,
      body: JSON.stringify({
        name,
        payload: payload ?? {},
        ts: new Date().toISOString(),
      }),
    });
  } catch {
    // ignore telemetry errors 
    }
}

