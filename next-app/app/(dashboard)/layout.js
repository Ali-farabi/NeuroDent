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

  return (
    <div style={{ height: "100vh", display: "flex" }}>
      <Sidebar
        role={user.role}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={() => { logout(); router.replace("/login"); }}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {!isAiPage && !isReportPage && !isSchedulePage && !isVisitsPage && !isPaymentsPage && !isPatientsPage && !isUsersPage && !isNewModulePage && (
          <Header
            onBurger={() => setSidebarOpen((v) => !v)}
          />
        )}
        <main style={{ flex: 1, overflow: "auto", background: "var(--bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
