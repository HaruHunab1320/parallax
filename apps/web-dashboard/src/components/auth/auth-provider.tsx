'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient, AuthUser } from '@/lib/api-client';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function validateSession() {
      const token = localStorage.getItem('parallax_access_token');
      if (!token) {
        setIsLoading(false);
        return;
      }

      apiClient.setAuthToken(token);

      try {
        const me = await apiClient.getMe();
        setUser(me);
      } catch {
        // Token invalid — clear state, middleware handles redirect
        localStorage.removeItem('parallax_access_token');
        localStorage.removeItem('parallax_refresh_token');
        document.cookie = 'parallax_auth=; path=/; max-age=0';
        apiClient.setAuthToken(null);
      } finally {
        setIsLoading(false);
      }
    }

    validateSession();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: authUser, tokens } = await apiClient.login(email, password);
    localStorage.setItem('parallax_access_token', tokens.accessToken);
    localStorage.setItem('parallax_refresh_token', tokens.refreshToken);
    document.cookie = `parallax_auth=1; path=/; max-age=604800; SameSite=Lax`;
    apiClient.setAuthToken(tokens.accessToken);
    setUser(authUser);
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const { user: authUser, tokens } = await apiClient.register(email, password, name);
    localStorage.setItem('parallax_access_token', tokens.accessToken);
    localStorage.setItem('parallax_refresh_token', tokens.refreshToken);
    document.cookie = `parallax_auth=1; path=/; max-age=604800; SameSite=Lax`;
    apiClient.setAuthToken(tokens.accessToken);
    setUser(authUser);
  }, []);

  const logout = useCallback(async () => {
    await apiClient.logout();
    localStorage.removeItem('parallax_access_token');
    localStorage.removeItem('parallax_refresh_token');
    document.cookie = 'parallax_auth=; path=/; max-age=0';
    apiClient.setAuthToken(null);
    setUser(null);
    window.location.href = '/login';
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-parallax-dark">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-parallax-gray">Authenticating...</p>
        </div>
      </div>
    );
  }

  // Redirect unauthenticated users to login
  if (!user) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    return null;
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
