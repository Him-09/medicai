'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth';
import { AlertCircle, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authService.login({ email, password });

      if (response.access_token) {
        router.push('/');
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError(error.message || 'Email ou mot de passe incorrect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black">
            MedicAI
          </h1>
          <p className="text-sm text-neutral-500 mt-2">
            Connectez-vous à votre compte
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-black mb-1.5">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 px-4 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-black placeholder-neutral-400 focus:outline-none focus:border-[var(--medicai-green)] focus:ring-1 focus:ring-[var(--medicai-green)] transition-colors"
              placeholder="vous@exemple.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-black">
                Mot de passe
              </label>
              <a href="#" className="text-xs text-neutral-500 hover:text-[var(--medicai-green-dark)] transition-colors">
                Oublié ?
              </a>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 px-4 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-black placeholder-neutral-400 focus:outline-none focus:border-[var(--medicai-green)] focus:ring-1 focus:ring-[var(--medicai-green)] transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-black hover:bg-neutral-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Continuer
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-neutral-400 mt-8">
          © 2026 MedicAI
        </p>

        <div className="text-center mt-3">
          <button
            onClick={() => router.push('/register')}
            className="text-sm text-neutral-500 hover:text-[var(--medicai-green-dark)] transition-colors"
          >
            Pas encore de compte ? <span className="underline">Créer un espace médecin</span>
          </button>
        </div>
      </div>
    </div>
  );
}
