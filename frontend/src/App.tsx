// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import {
  apiGetModels,
  apiCreateSession,
  apiListSessions,
  apiGetSession,
  apiPostMessage,
  apiDeleteSession,
  apiTelemetryEvent,
} from "./lib/api";
import type { Model, Session, Message } from "./lib/api";
import "./App.css";
import { Sidebar } from "./components/Sidebar";

type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type RichParsed = { text: string; images?: string[] };

// CHANGED: mesaj objesinden de image topla + base64 ise data: URL yap
function normalizeImageSrc(v: string): string {
  const s = String(v || "").trim();
  if (!s) return s;

  // already a url/data url
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:")) return s;

  // raw base64 (heuristic) -> assume jpeg
  if (/^[A-Za-z0-9+/=\s]+$/.test(s) && s.length > 200) {
    return `data:image/jpeg;base64,${s.replace(/\s/g, "")}`;
  }

  // possible relative path
  if (s.startsWith("/")) return s;

  return s;
}

function pickImagesFromMessage(m: any): string[] {
  const candidates =
    (Array.isArray(m?.images) && m.images) ||
    (Array.isArray(m?.image_urls) && m.image_urls) ||
    (Array.isArray(m?.attachments) && m.attachments) ||
    [];

  // attachments [{url}] gibi ise
  const flat = candidates
    .map((x: any) => (typeof x === "string" ? x : x?.url ?? x?.data ?? ""))
    .filter(Boolean)
    .map(normalizeImageSrc);

  return flat;
}

// parse persisted message envelopes (text + images)
function tryParseRichContent(raw: string): RichParsed {
  try {
    const obj = JSON.parse(raw);
    if (obj && obj.v === 1 && typeof obj.text === "string") {
      return { text: obj.text, images: Array.isArray(obj.images) ? obj.images : undefined };
    }
  } catch {
    // ignore
  }
  return { text: raw };
}

export default function App() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [draftSessionId, setDraftSessionId] = useState<string | null>(null);

  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);

  const isDraftId = (id: string | null) => !!id && id.startsWith("draft_");
  const clearDraft = () => setDraftSessionId(null);

  const isFirstRunEmpty =
    sessions.length === 0 && !activeSessionId && messages.length === 0;

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  const sessionsView = useMemo(() => {
    if (!draftSessionId) return sessions;
    const draft: Session = {
      id: draftSessionId,
      title: "Yeni Sohbet",
    } as Session;
    return [draft, ...sessions];
  }, [sessions, draftSessionId]);

  const selectedModelObj = useMemo(
    () => models.find((m) => m.id === selectedModel) ?? null,
    [models, selectedModel]
  );

  const modelSupportsVision = !!selectedModelObj?.capabilities?.vision;

  const canSend = useMemo(() => {
    const hasText = input.trim().length > 0;
    const hasImages = pendingImages.length > 0 && modelSupportsVision;
    return !loading && (hasText || hasImages);
  }, [loading, input, pendingImages.length, modelSupportsVision]);

  async function loadModels() {
    const { models, default_model } = await apiGetModels();
    setModels(models);
    setSelectedModel((prev) => prev || default_model || models[0]?.id || "");
  }

  async function refreshSessions() {
    const { sessions } = await apiListSessions();
    setSessions(sessions);
  }

  async function openSession(id: string) {
    apiTelemetryEvent("ui.open_session", { id });
    if (id === draftSessionId || isDraftId(id)) {
      setActiveSessionId(id);
      setMessages([]);
      return;
    }

    if (draftSessionId) clearDraft();

    const s = await apiGetSession(id);
    setActiveSessionId(id);
    setMessages(s.messages);

    if (s.selected_model && models.some((m) => m.id === s.selected_model)) {
      setSelectedModel(s.selected_model);
    }
  }

  // avoid fetching messages here; we only need the id
  async function ensureSession(firstText?: string) {
    if (
      activeSessionId &&
      !isDraftId(activeSessionId) &&
      !draftSessionId
    ) {
      return activeSessionId;
    }

    const created = await apiCreateSession({
      title: (firstText || "Yeni Sohbet").slice(0, 40),
      selected_model: selectedModel,
    });

    clearDraft();
    setActiveSessionId(created.id);
    // refresh is sufficient for the sessions list
    await refreshSessions();

    return created.id;
  }

  function onPickImages(files: FileList | null) {
    if (!modelSupportsVision) return;
    if (!files || files.length === 0) return;

    const next: PendingImage[] = Array.from(files).map((file) => ({
      id: `img_${crypto.randomUUID()}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setPendingImages((prev) => [...prev, ...next]);
  }

  function removePendingImage(id: string) {
    setPendingImages((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  useEffect(() => {
    return () => {
      pendingImages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fileToDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("file read failed"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
  }

  async function send() {
    apiTelemetryEvent("ui.send_clicked", { hasText: input.trim().length > 0, hasImages: pendingImages.length > 0 });
    // optimistic render first; reconcile after apiGetSession()
    const text = input.trim();
    if (!canSend) return;

    setLoading(true);

    const imagesToSend = pendingImages; // sakla
    setInput("");

    const optimistic: any = {
      id: `tmp_${crypto.randomUUID()}`,
      role: "user",
      content: text || (imagesToSend.length > 0 ? "[Görsel]" : ""),
      created_at: new Date().toISOString(),
      _images: imagesToSend.map((p) => ({
        id: p.id,
        previewUrl: p.previewUrl,
        name: p.file.name,
      })),
    };
    setMessages((m) => [...m, optimistic]);

    try {
      const sid = await ensureSession(text || "Görsel");

      let imageDataUrls: string[] | undefined;
      if (imagesToSend.length > 0 && modelSupportsVision) {
        imageDataUrls = await Promise.all(imagesToSend.map((p) => fileToDataUrl(p.file)));
      }

      await apiPostMessage(sid, {
        content: text || "",
        model: selectedModel,
        images: imageDataUrls,
      });

      // on success, pending images are cleared and chat is reloaded
      setPendingImages([]);

      const s = await apiGetSession(sid);
      setMessages(s.messages);

      await refreshSessions();
    } catch (e: any) {
      // on failure, restore draft + attachments for retry
      setPendingImages(imagesToSend);
      setInput(text);

      setMessages((m) => [
        ...m,
        {
          id: `tmp_err_${crypto.randomUUID()}`,
          role: "assistant",
          content: `Gönderim başarısız: ${e?.message ?? "Bilinmeyen hata"}`,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function newChat() {
    if (draftSessionId) {
      setActiveSessionId(draftSessionId);
      setMessages([]);
      setInput("");
      return;
    }

    const draftId = `draft_${crypto.randomUUID()}`;
    setDraftSessionId(draftId);
    setActiveSessionId(draftId);
    setMessages([]);
    setInput("");
  }

  async function deleteChat(id: string) {
    if (id === draftSessionId || isDraftId(id)) {
      clearDraft();
      if (id === activeSessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }
      return;
    }

    await apiDeleteSession(id);
    if (id === activeSessionId) {
      setActiveSessionId(null);
      setMessages([]);
    }
    await refreshSessions();
  }

  useEffect(() => {
    loadModels();
    refreshSessions();
  }, []);

  useEffect(() => {
    if (isFirstRunEmpty) document.body.classList.add("empty-mode");
    else document.body.classList.remove("empty-mode");

    return () => document.body.classList.remove("empty-mode");
  }, [isFirstRunEmpty]);

  if (isFirstRunEmpty) {
    return (
      <div className="emptyRoot">
        <div className="emptyHero">
          <div className="emptyBrandWrap" aria-label="Dialog">
            <img src="/logo-dialog.svg" alt="Dialog" className="emptyBrand" />
          </div>
          <p className="emptySub">Bir mesaj yazın; sohbeti otomatik başlatacağım.</p>

          <div className="emptyInputWrap">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onPickImages(e.target.files)}
              style={{ display: "none" }}
              id="empty-image-picker"
            />

            <button
              className="btn"
              type="button"
              disabled={!modelSupportsVision}
              title={modelSupportsVision ? "Görsel ekle" : "Seçili model görsel desteklemiyor"}
              onClick={() => document.getElementById("empty-image-picker")?.click()}
            >
              Görsel
            </button>

            <textarea
              className="emptyInput"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Mesajınızı yazın..."
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />

            <button
              className="emptySend"
              onClick={send}
              disabled={!canSend}
              aria-label="Gönder"
              title="Gönder"
            >
              →
            </button>
          </div>

          {modelSupportsVision && pendingImages.length > 0 && (
            <div style={{ width: "100%", maxWidth: 780, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {pendingImages.map((p) => (
                <div key={p.id} style={{ position: "relative" }}>
                  <img
                    src={p.previewUrl}
                    alt={p.file.name}
                    style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 14, border: "1px solid rgba(30,41,59,0.12)" }}
                  />
                  <button
                    className="btn"
                    type="button"
                    onClick={() => removePendingImage(p.id)}
                    style={{ position: "absolute", right: 6, top: 6, padding: "6px 8px", borderRadius: 10 }}
                  >
                    Kaldır
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="emptyModelRow">
            <span>Model:</span>
            <select
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                apiTelemetryEvent("ui.model_changed", { model: e.target.value });
              }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar
        models={models}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
        sessions={sessionsView}
        activeSessionId={activeSessionId}
        onNewChat={newChat}
        onOpenSession={openSession}
        onDeleteChat={deleteChat}
      />

      <main className="main">
        <header className="topbar">
          <div>
            <div className="topbarTitle">
              {activeSession?.title || "Yeni sohbet"}
            </div>
            <div className="topbarSub">{selectedModel ? "Model seçildi" : "Model seç"}</div>
          </div>
        </header>

        <section className="chat">
          {messages.length === 0 ? (
            <div className="muted">
              Soldan bir sohbet seç veya mesaj yazarak yeni sohbet başlat.
            </div>
          ) : (
            <div className="messages">
              {messages.map((m: any) => {
                const rich = tryParseRichContent(String(m.content ?? ""));
                const msgImages = pickImagesFromMessage(m);
                const richImages = (Array.isArray(rich.images) ? rich.images : []).map(normalizeImageSrc);
                const imagesToRender = richImages.length > 0 ? richImages : msgImages;

                return (
                  <div key={m.id} className={`row ${m.role}`}>
                    <div className="bubble">
                      {rich.text}

                      {Array.isArray(imagesToRender) && imagesToRender.length > 0 && (
                        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {imagesToRender.map((url: string, idx: number) => (
                            <img
                              key={`${m.id}_img_${idx}`}
                              src={url}
                              alt={`image_${idx}`}
                              style={{
                                width: 140,
                                height: 140,
                                objectFit: "cover",
                                borderRadius: 14,
                                border: "1px solid rgba(30,41,59,0.12)",
                              }}
                              onError={(e) => {
                                // debug için: bozuk src'yi konsola bas
                                // eslint-disable-next-line no-console
                                console.warn("image load failed", { messageId: m.id, url });
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* ...existing optimistic _images block stays as-is... */}
                      {Array.isArray(m._images) && m._images.length > 0 && (
                        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {m._images.map((img: any) => (
                            <img
                              key={img.id}
                              src={img.previewUrl}
                              alt={img.name}
                              style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 14, border: "1px solid rgba(30,41,59,0.12)" }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {loading && <div className="muted">Yanıt hazırlanıyor…</div>}
            </div>
          )}
        </section>

        <footer className="composer">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => onPickImages(e.target.files)}
            style={{ display: "none" }}
            id="composer-image-picker"
          />

          <button
            className="btn"
            type="button"
            disabled={!modelSupportsVision}
            title={modelSupportsVision ? "Görsel ekle" : "Seçili model görsel desteklemiyor"}
            onClick={() => document.getElementById("composer-image-picker")?.click()}
          >
            Görsel
          </button>

          <textarea
            className="textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Mesaj yazın..."
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />

          <button className="btn primary" onClick={send} disabled={!canSend}>
            Gönder
          </button>
        </footer>

        {modelSupportsVision && pendingImages.length > 0 && (
          <div style={{ padding: "0 16px 14px", display: "flex", gap: 10, flexWrap: "wrap" }}>
            {pendingImages.map((p) => (
              <div key={p.id} style={{ position: "relative" }}>
                <img
                  src={p.previewUrl}
                  alt={p.file.name}
                  style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 14, border: "1px solid rgba(30,41,59,0.12)" }}
                />
                <button
                  className="btn"
                  type="button"
                  onClick={() => removePendingImage(p.id)}
                  style={{ position: "absolute", right: 6, top: 6, padding: "6px 8px", borderRadius: 10 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
