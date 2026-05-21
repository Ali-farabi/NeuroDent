"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

// Role-based access matrix
const PAGE_ROLES = {
  "/report":   ["owner"],
  "/payments": ["owner", "admin"],
  "/users":    ["owner"],
  "/ai":       ["owner", "doctor", "assistant"],
  "/schedule": ["owner", "admin", "doctor", "assistant"],
  "/visits":   ["owner", "admin", "doctor", "assistant"],
  "/patients": ["owner", "admin", "doctor", "assistant", "patient"],
  "/price-items": ["owner", "admin", "doctor", "assistant"],
  "/notifications": ["owner", "admin", "doctor", "assistant", "patient"],
  "/audit-logs": ["owner"],
  "/admin-system": ["owner"],
};

function getAllowedRoles(path) {
  for (const [prefix, roles] of Object.entries(PAGE_ROLES)) {
    if (path.startsWith(prefix)) return roles;
  }
  return null;
}

export default function DashboardLayout({ children }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAiPage = pathname.startsWith("/ai");
  const isReportPage = pathname.startsWith("/report");
  const isSchedulePage = pathname.startsWith("/schedule");
  const isVisitsPage = pathname.startsWith("/visits");
  const isPaymentsPage = pathname.startsWith("/payments");
  const isPatientsPage = pathname.startsWith("/patients");
  const isUsersPage = pathname.startsWith("/users");
  const isNewModulePage = [
    "/price-items",
    "/notifications",
    "/audit-logs",
    "/admin-system",
  ].some((prefix) => pathname.startsWith(prefix));

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }

    const allowed = getAllowedRoles(pathname);
    if (allowed && !allowed.includes(user.role)) {
      // Redirect to the best default page for this role
      router.replace(user.role === "patient" ? "/patients" : "/schedule");
    }
  }, [user, loading, pathname, router]);

  if (loading || !user) return null;

  const mobileTitle = (() => {
    if (pathname.startsWith("/ai")) return "AI Protocol";
    if (pathname.startsWith("/report")) return "Analytics";
    if (pathname.startsWith("/schedule")) return "CRM";
    if (pathname.startsWith("/visits")) return "История визитов";
    if (pathname.startsWith("/payments")) return "Финансы и Склад";
    if (pathname.startsWith("/patients")) return user.role === "patient" ? "Моя медкарта" : "Пациентский модуль";
    if (pathname.startsWith("/users")) return "Пользователи";
    if (pathname.startsWith("/price-items")) return "Прайс-лист";
    if (pathname.startsWith("/notifications")) return "Уведомления";
    if (pathname.startsWith("/admin-system")) return "Система";
    return "NeuroDent";
  })();

  return (
    <div className="dashboard-shell" style={{ height: "100vh", display: "flex" }}>
      <Sidebar
        role={user.role}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={() => { logout(); router.replace("/login"); }}
      />
      <div className="dashboard-content" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="mobile-dashboard-bar">
          <button className="mobile-menu-button" type="button" onClick={() => setSidebarOpen((v) => !v)} aria-label="Открыть меню">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
          <div className="mobile-dashboard-title">{mobileTitle}</div>
        </div>
        {!isAiPage && !isReportPage && !isSchedulePage && !isVisitsPage && !isPaymentsPage && !isPatientsPage && !isUsersPage && !isNewModulePage && (
          <Header
            onBurger={() => setSidebarOpen((v) => !v)}
          />
        )}
        <main className="dashboard-main" style={{ flex: 1, overflow: "auto", background: "var(--bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
