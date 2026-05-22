"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { getCurrentUser, logout as logoutRequest } from "@/lib/api";

const AuthContext = createContext(null);
const VALID_ROLES = new Set(["owner", "admin", "doctor", "assistant", "patient"]);

function normalizeUser(user) {
  if (!VALID_ROLES.has(user?.role)) return null;
  const safeUser = { ...user };
  delete safeUser.token;
  return safeUser;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const currentUser = normalizeUser(await getCurrentUser());
        if (!currentUser) throw new Error("Invalid user session");
        if (!cancelled) {
          setUser(currentUser);
          localStorage.setItem("neurodent_user", JSON.stringify(currentUser));
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          localStorage.removeItem("neurodent_user");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  function saveUser(u) {
    const safeUser = normalizeUser(u);
    if (!safeUser) return;
    setUser(safeUser);
    localStorage.setItem("neurodent_user", JSON.stringify(safeUser));
  }

  async function logout() {
    try {
      await logoutRequest();
    } catch {
      // Client state must still be cleared even if the server session already expired.
    }
    setUser(null);
    localStorage.removeItem("neurodent_user");
  }

  return (
    <AuthContext.Provider value={{ user, loading, saveUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
