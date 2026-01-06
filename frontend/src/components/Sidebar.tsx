import type { Model, Session } from "../lib/api";

type Props = {
  models: Model[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;

  sessions: Session[];
  activeSessionId: string | null;

  onNewChat: () => void;
  onOpenSession: (id: string) => void;
  onDeleteChat: (id: string) => void;
};

export function Sidebar({
  models,
  selectedModel,
  onSelectModel,
  sessions,
  activeSessionId,
  onNewChat,
  onOpenSession,
  onDeleteChat,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebarHeader">
        <div className="brandMiniWrap" title="Dialog">
          <img src="/logo-dialog.svg" alt="Dialog" className="brandMiniImg" />
        </div>

        <button className="btn" onClick={onNewChat}>
          Yeni
        </button>
      </div>

      <div className="field">
        <div className="label">Model</div>
        <select
          className="select"
          value={selectedModel}
          onChange={(e) => onSelectModel(e.target.value)}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.capabilities?.vision ? " (Görsel)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="sessionList">
        {sessions.length === 0 ? (
          <div className="muted">Henüz sohbet yok.</div>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="sessionRow">
              <button
                className={`sessionItem ${s.id === activeSessionId ? "active" : ""}`}
                onClick={() => onOpenSession(s.id)}
              >
                <div className="sessionTitle">{s.title || "Untitled"}</div>
              </button>

              <button className="btn" onClick={() => onDeleteChat(s.id)}>
                Sil
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}