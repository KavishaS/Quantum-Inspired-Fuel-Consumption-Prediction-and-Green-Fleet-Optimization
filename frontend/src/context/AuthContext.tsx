import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from "react";
import type { AuthUser, UserRole } from "@/types/auth";
import { loginApi, getMeApi } from "@/services/api";

const TOKEN_KEY = "greenfleet_auth_token";
const USER_KEY = "greenfleet_auth_user";

const DEMO_CREDENTIALS: Record<UserRole, { username: string; pass: string }> = {
  admin: { username: "admin", pass: "Admin@123" },
  analyst: { username: "analyst", pass: "Analyst@123" },
  auditor: { username: "auditor", pass: "Auditor@123" },
};

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  demoLogin: (role: UserRole) => Promise<void>;
  logout: () => void;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  isAdmin: boolean;
  isAnalyst: boolean;
  isAuditor: boolean;
  canManageAssets: boolean;
  canDeleteScenarios: boolean;
  canEditScenarios: boolean;
  canRunOptimization: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem(USER_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    // Default fallback initial session: Fleet Analyst
    return {
      id: 2,
      username: "analyst",
      display_name: "Dr. Marcus Chen",
      email: "marcus.chen@vates.io",
      role: "analyst",
      is_active: true,
    };
  });
  const [isLoading, setIsLoading] = useState(false);

  // Sync token validation on mount if token exists
  useEffect(() => {
    if (token) {
      getMeApi()
        .then((me) => {
          setUser(me);
          localStorage.setItem(USER_KEY, JSON.stringify(me));
        })
        .catch(() => {
          // Token expired or invalid
          console.warn("Stored auth token was invalid. Performing quick demo analyst sign-in.");
          demoLogin("analyst").catch(() => {});
        });
    } else {
      // Auto-issue default demo analyst session for zero-friction hackathon testing
      demoLogin("analyst").catch(() => {});
    }
  }, []);

  const login = async (username: string, pass: string) => {
    setIsLoading(true);
    try {
      const res = await loginApi({ username, password: pass });
      setToken(res.access_token);
      setUser(res.user);
      localStorage.setItem(TOKEN_KEY, res.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    } finally {
      setIsLoading(false);
    }
  };

  const demoLogin = async (targetRole: UserRole) => {
    const cred = DEMO_CREDENTIALS[targetRole];
    if (!cred) return;
    await login(cred.username, cred.pass);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const role: UserRole = user?.role || "analyst";

  const hasRole = (roles: UserRole | UserRole[]): boolean => {
    if (!user) return false;
    const list = Array.isArray(roles) ? roles : [roles];
    if (user.role === "admin") return true; // Admin has all rights
    if (user.role === "analyst") return list.includes("analyst") || list.includes("auditor");
    return list.includes("auditor");
  };

  const isAdmin = role === "admin";
  const isAnalyst = role === "analyst";
  const isAuditor = role === "auditor";
  const canManageAssets = role === "admin";
  const canDeleteScenarios = role === "admin";
  const canEditScenarios = role === "admin" || role === "analyst";
  const canRunOptimization = role === "admin" || role === "analyst";

  const value = useMemo(
    () => ({
      user,
      token,
      role,
      isAuthenticated: !!user,
      isLoading,
      login,
      demoLogin,
      logout,
      hasRole,
      isAdmin,
      isAnalyst,
      isAuditor,
      canManageAssets,
      canDeleteScenarios,
      canEditScenarios,
      canRunOptimization,
    }),
    [user, token, role, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
