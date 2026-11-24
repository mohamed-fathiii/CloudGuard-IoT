"use client";

/**
 * DEMO SESSION ONLY. M1 owns production authentication (Auth.js credentials +
 * server-side RBAC). This context exists so the frontend can be exercised
 * before M1 is available; replace it with the M1 session provider during
 * integration. See `docs/API-INTEGRATION.md`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storeToken } from "@/lib/api/client";
import type { Role, Session } from "@/lib/types";
import { demoRoleForEmail, makeDemoSession } from "@/lib/mock/fixtures";

const SESSION_KEY = "cloudguard.demo.session";

export type GuardAction = "approve" | "manageUsers" | "manageDevices" | "changeSettings" | "respond" | "viewAudit";

interface AuthContextValue {
  session: Session | null;
  ready: boolean;
  signIn: (email: string, role: Role) => Session;
  signOut: () => void;
  switchRole: (role: Role) => void;
  can: (action: GuardAction) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const ROLE_LABELS: Record<Role, string> = {
  ADMINISTRATOR: "Administrator",
  SECURITY_ANALYST: "Security Analyst",
  VIEWER: "Viewer",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) setSession(JSON.parse(raw) as Session);
    } catch {
      window.localStorage.removeItem(SESSION_KEY);
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: Session | null) => {
    setSession(next);
    storeToken(next?.token ?? null);
    if (next) window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(SESSION_KEY);
  }, []);

  const signIn = useCallback((email: string, role: Role) => {
    const next = makeDemoSession(email, role);
    persist(next);
    return next;
  }, [persist]);

  const signOut = useCallback(() => persist(null), [persist]);

  const switchRole = useCallback((role: Role) => {
    setSession((current) => {
      if (!current) return current;
      const next = makeDemoSession(current.user.email, role);
      storeToken(next.token);
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const can = useCallback((action: GuardAction) => {
    const role = session?.user.role;
    if (!role) return false;
    switch (action) {
      case "approve":
      case "manageUsers":
      case "manageDevices":
      case "changeSettings":
      case "viewAudit":
        return role === "ADMINISTRATOR";
      case "respond":
        return role === "ADMINISTRATOR" || role === "SECURITY_ANALYST";
      default:
        return false;
    }
  }, [session]);

  const value = useMemo(
    () => ({ session, ready, signIn, signOut, switchRole, can }),
    [session, ready, signIn, signOut, switchRole, can],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function roleForEmail(email: string): Role {
  return demoRoleForEmail(email);
}
