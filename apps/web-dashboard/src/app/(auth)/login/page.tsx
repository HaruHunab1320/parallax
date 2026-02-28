'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';

  const [isSetup, setIsSetup] = useState(false);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function checkSetup() {
      try {
        const count = await apiClient.getUserCount();
        setIsSetup(count === 0);
      } catch {
        setIsSetup(false);
      } finally {
        setIsCheckingSetup(false);
      }
    }
    checkSetup();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      let response;
      if (isSetup) {
        response = await apiClient.register(email, password, name || undefined);
      } else {
        response = await apiClient.login(email, password);
      }

      localStorage.setItem('parallax_access_token', response.tokens.accessToken);
      localStorage.setItem('parallax_refresh_token', response.tokens.refreshToken);
      document.cookie = `parallax_auth=1; path=/; max-age=604800; SameSite=Lax`;
      apiClient.setAuthToken(response.tokens.accessToken);
      router.push(redirectTo);
    } catch (err: any) {
      const message = err.response?.data?.error || err.response?.data?.message || err.message;
      setError(message || 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isCheckingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            <span className="text-parallax-accent">Parallax</span>
          </h1>
          <p className="text-parallax-gray text-sm">AI Orchestration Platform</p>
        </div>

        <div className="glass-panel border border-white/10 rounded-xl p-8">
          <h2 className="text-xl font-semibold text-white mb-6">
            {isSetup ? 'Create Admin Account' : 'Sign In'}
          </h2>

          {isSetup && (
            <p className="text-parallax-gray text-sm mb-6">
              No users found. Create the first admin account to get started.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSetup && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-parallax-accent"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-parallax-accent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-parallax-accent"
                placeholder={isSetup ? 'Min 8 chars, 1 letter, 1 number' : 'Your password'}
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 px-4 bg-parallax-accent hover:bg-parallax-accent/90 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {isSubmitting
                ? 'Please wait...'
                : isSetup
                  ? 'Create Account'
                  : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-parallax-gray text-xs mt-6">
          Parallax AI Orchestration Platform
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
