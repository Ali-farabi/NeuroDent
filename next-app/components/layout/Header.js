"use client";

export default function Header({ user, onLogout, onSearch, onBurger }) {
  const roleLabel = {
    owner: "Владелец",
    admin: "Админ",
    doctor: "Врач",
    patient: "Пациент",
  }[user?.role] || "Гость";

  return (
    <>
      <style>{`
        .burger-btn {
          display: none;
          width: 36px;
          height: 36px;
          border: 1px solid var(--border);
          background: var(--surface);
          border-radius: var(--radius-sm);
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .burger-btn:hover { background: var(--hover); }
        @media (max-width: 640px) {
          .burger-btn { display: inline-flex; }
          .header-search { width: 100% !important; }
        }
      `}</style>

      <header style={{
        height: "var(--header-h)",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexShrink: 0,
      }}>
        {/* Левая часть */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <button className="burger-btn" onClick={onBurger} aria-label="Меню">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
          <input
            className="header-search"
            type="text"
            placeholder="Поиск пациента..."
            onChange={(e) => onSearch?.(e.target.value)}
            style={{
              width: "min(380px, 40vw)",
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
        </div>

        {/* Правая часть */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            color: "rgba(11,18,32,0.75)", fontSize: 13, fontWeight: 500,
            padding: "6px 10px", borderRadius: "var(--radius-sm)",
            background: "var(--surface-2)", border: "1px solid var(--border)",
          }}>
            {roleLabel}
          </div>
          <button
            onClick={onLogout}
            style={{
              padding: "7px 14px", borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--text)", fontWeight: 500, fontSize: 13, cursor: "pointer",
            }}
          >
            Выйти
          </button>
        </div>
      </header>
    </>
  );
}
