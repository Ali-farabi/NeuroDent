"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const menuItems = [
  {
    route: "ai",
    href: "/ai",
    label: "AI Protocol",
    roles: ["owner", "doctor"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    route: "report",
    href: "/report",
    label: "Analytics",
    roles: ["owner"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    route: "schedule",
    href: "/schedule",
    label: "CRM",
    roles: ["owner", "admin", "doctor"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    route: "visits",
    href: "/visits",
    label: "История визитов",
    roles: ["owner", "admin", "doctor"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    ),
  },
  {
    route: "payments",
    href: "/payments",
    label: "Финансы и Склад",
    roles: ["owner", "admin"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    route: "patients",
    href: "/patients",
    label: "Пациентский модуль",
    roles: ["owner", "admin", "doctor", "patient"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    route: "users",
    href: "/users",
    label: "Пользователи",
    roles: ["owner"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export default function Sidebar({ role = "owner", isOpen, onClose, onLogout }) {
  const pathname = usePathname();
  const visibleItems = menuItems.filter((item) => item.roles.includes(role));
  const isPatient = role === "patient";

  // ESC менен жабу
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            display: "none",
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            zIndex: 900,
          }}
          className="sidebar-backdrop-overlay"
        />
      )}

      <style>{`
        @media (max-width: 640px) {
          .sidebar-el {
            position: fixed !important;
            left: ${isOpen ? "0" : isPatient ? "-270px" : "-220px"} !important;
            top: 0;
            height: 100vh;
            z-index: 1000;
            transition: left 0.3s ease;
            box-shadow: ${isOpen ? "4px 0 12px rgba(0,0,0,0.15)" : "none"};
          }
          .sidebar-backdrop-overlay {
            display: block !important;
          }
        }
      `}</style>

      <aside
        className="sidebar-el"
        style={{
          width: isPatient ? 270 : "var(--sidebar-w)",
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: isPatient ? "22px 18px 0" : "24px 14px 0",
          }}>
            <Image src="/images/Medimetricslogotype.png" alt="NeuroDent" width={isPatient ? 34 : 32} height={isPatient ? 34 : 32} />
            <span style={{ fontSize: isPatient ? 18 : 20, fontWeight: 700, color: "var(--primary)", letterSpacing: "-0.3px" }}>
              Neurodent
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 8, padding: isPatient ? "36px 16px 0" : "34px 10px 0" }}>
          {visibleItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const label = isPatient && item.route === "patients" ? "Моя медкарта" : item.label;
            return (
              <Link
                key={item.route}
                href={item.href}
                onClick={onClose}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: isPatient ? "10px 14px" : "9px 10px",
                  borderRadius: 10,
                  color: isActive ? "rgba(11,18,32,0.82)" : "rgba(11,18,32,0.72)",
                  fontSize: isPatient ? 13 : 13, fontWeight: isPatient ? 500 : 600,
                  background: isActive ? "#e9e9e9" : "transparent",
                  transition: "background 0.15s ease, color 0.15s ease",
                  textDecoration: "none",
                }}
              >
                <span style={{ color: "rgba(11,18,32,0.45)", flexShrink: 0, display: "inline-flex" }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto", padding: isPatient ? "0 14px 34px" : "0 14px 30px", display: "grid", gap: 18 }}>
          <button
            type="button"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              border: "none", background: "transparent", padding: 0,
              color: "var(--text)", fontSize: isPatient ? 15 : 14, fontWeight: isPatient ? 500 : 600, cursor: "pointer",
              textAlign: "left",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.1 9a3 3 0 1 1 5.8 1c-.5 1.3-2.1 1.8-2.6 3" />
              <path d="M12 17h.01" />
            </svg>
            <span>Центр Помощи</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              border: "none", background: "transparent", padding: 0,
              color: "var(--text)", fontSize: isPatient ? 15 : 14, fontWeight: isPatient ? 500 : 600, cursor: "pointer",
              textAlign: "left",
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Выйти</span>
          </button>
        </div>
      </aside>
    </>
  );
}
