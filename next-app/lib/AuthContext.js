"use client";

import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("neurodent_user");
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch {} // eslint-disable-line react-hooks/set-state-in-effect
    }
    setLoading(false);
  }, []);

  function saveUser(u) {
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
