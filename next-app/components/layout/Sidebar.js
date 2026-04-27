"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const menuItems = [
  {
    route: "ai",
    href: "/ai",
    label: "Core AI Layer",
    roles: ["owner", "doctor", "assistant"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    route: "report",
    href: "/report",
    label: "Business Analytics",
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
    label: "Call-центр и CRM",
    roles: ["owner", "admin", "doctor", "assistant"],
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
    roles: ["owner", "admin", "doctor", "assistant"],
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
    roles: ["owner", "admin", "doctor", "assistant", "patient"],
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

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export default function Sidebar({ role = "owner", isOpen, onClose }) {
  const pathname = usePathname();
  const visibleItems = menuItems.filter((item) => item.roles.includes(role));

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
            left: ${isOpen ? "0" : "-260px"} !important;
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
          width: "var(--sidebar-w)",
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div style={{ borderBottom: "1px solid var(--border)" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: 11,
            background: "linear-gradient(180deg,rgba(37,99,235,0.08),rgba(37,99,235,0.03))",
            border: "1px solid rgba(37,99,235,0.18)",
          }}>
            <Image src="/images/Medimetricslogotype.png" alt="NeuroDent" width={32} height={32} />
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>
              Neurodent
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", padding: "10px 12px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Поддержка: +7 771 163 2030</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {visibleItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.route}
                href={item.href}
                onClick={onClose}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px",
                  color: isActive ? "var(--primary)" : "rgba(11,18,32,0.82)",
                  fontSize: 14, fontWeight: 500,
                  background: isActive ? "var(--active)" : "transparent",
                  transition: "background 0.15s ease, color 0.15s ease",
                  textDecoration: "none",
                }}
              >
                <span style={{ color: isActive ? "var(--primary)" : "rgba(91,107,131,0.9)", flexShrink: 0 }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1 }}>{item.label}</span>
                <span style={{ color: isActive ? "var(--primary)" : "rgba(91,107,131,0.75)", opacity: isActive ? 1 : 0, flexShrink: 0 }}>
                  <ArrowIcon />
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
