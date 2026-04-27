"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { User } from "@/types";
import * as api from "@/lib/api";

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string
  ) => Promise<void>;
  loginWithGoogle: (googleToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const updateToken = useCallback((newToken: string | null) => {
    tokenRef.current = newToken;
    setToken(newToken);
    api.setToken(newToken);
  }, []);

  useEffect(() => {
    const currentToken = api.getToken();
    if (currentToken) {
      tokenRef.current = currentToken;
      setToken(currentToken);
      api
        .getMe()
        .then((u) => setUser(u))
        .catch(() => {
          updateToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [updateToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.login(email, password);
      updateToken(data.access_token);
      setUser(data.user);
    },
    [updateToken]
  );

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const data = await api.register(username, email, password);
      updateToken(data.access_token);
      setUser(data.user);
    },
    [updateToken]
  );

  const loginWithGoogle = useCallback(
    async (googleToken: string) => {
      const data = await api.googleAuth(googleToken);
      updateToken(data.access_token);
      setUser(data.user);
    },
    [updateToken]
  );

  const logout = useCallback(() => {
    updateToken(null);
    setUser(null);
  }, [updateToken]);

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, register, loginWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
