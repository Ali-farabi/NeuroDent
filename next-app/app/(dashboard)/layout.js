"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export default function DashboardLayout({ children }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) return null;

  return (
    <div style={{ height: "100vh", display: "flex" }}>
      <Sidebar
        role={user.role}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Header
          user={user}
          onBurger={() => setSidebarOpen((v) => !v)}
          onLogout={() => { logout(); router.replace("/login"); }}
        />
        <main style={{ flex: 1, overflow: "auto", background: "var(--bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
