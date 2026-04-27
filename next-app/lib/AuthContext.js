"use client";

import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);
const VALID_ROLES = new Set(["owner", "admin", "doctor", "patient"]);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("neurodent_user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (VALID_ROLES.has(parsed?.role)) {
          setUser(parsed); // eslint-disable-line react-hooks/set-state-in-effect
        } else {
          localStorage.removeItem("neurodent_user");
        }
      } catch {
        localStorage.removeItem("neurodent_user");
      }
    }
    setLoading(false);
  }, []);

  function saveUser(u) {
    if (!VALID_ROLES.has(u?.role)) return;
    setUser(u);
    localStorage.setItem("neurodent_user", JSON.stringify(u));
  }

  function logout() {
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
