'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth';
import { AlertCircle, ArrowRight, ShieldCheck, ArrowLeft } from 'lucide-react';

type LoginStep = 'credentials' | 'mfa';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authService.login({ email, password });
      
      // MFA required - go to MFA step
      if (response.requires_mfa) {
        setStep('mfa');
        setLoading(false);
        return;
      }
      
      // MFA setup required - redirect to settings after login
      if (response.mfa_setup_required) {
        setMfaSetupRequired(true);
        router.push('/settings?tab=security&setup=mfa');
        return;
      }
      
      // Direct login success
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

  const handleMFASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authService.verifyMFA(mfaCode, useBackupCode ? 'backup_code' : 'totp');
      router.push('/');
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError(error.message || 'Code de vérification invalide');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setStep('credentials');
    setMfaCode('');
    setError('');
    authService.clearPendingMFA();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-sm px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black">
            MedicAI
          </h1>
          <p className="text-sm text-neutral-500 mt-2">
            {step === 'credentials' 
              ? 'Connectez-vous à votre compte'
              : 'Vérification en deux étapes'}
          </p>
        </div>

        {/* Credentials Form */}
        {step === 'credentials' && (
          <form onSubmit={handleCredentialsSubmit} className="space-y-5">
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
        )}

        {/* MFA Form */}
        {step === 'mfa' && (
          <form onSubmit={handleMFASubmit} className="space-y-5">
            {/* Back button */}
            <button
              type="button"
              onClick={handleBackToLogin}
              className="flex items-center gap-1 text-sm text-neutral-500 hover:text-black transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </button>

            {/* MFA Icon */}
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-[var(--medicai-green-light)] rounded-full flex items-center justify-center">
                <ShieldCheck className="h-8 w-8 text-[var(--medicai-green-dark)]" />
              </div>
            </div>

            <p className="text-center text-sm text-neutral-600">
              {useBackupCode 
                ? 'Entrez un de vos codes de récupération'
                : 'Entrez le code à 6 chiffres de votre application d\'authentification'}
            </p>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <input
                id="mfaCode"
                name="mfaCode"
                type="text"
                inputMode={useBackupCode ? "text" : "numeric"}
                pattern={useBackupCode ? undefined : "[0-9]*"}
                maxLength={useBackupCode ? 20 : 6}
                autoComplete="one-time-code"
                required
                autoFocus
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(useBackupCode ? /[^a-zA-Z0-9-]/g : /\D/g, ''))}
                className="w-full h-14 px-4 bg-neutral-50 border border-neutral-200 rounded-lg text-center text-2xl tracking-[0.5em] font-mono text-black placeholder-neutral-400 focus:outline-none focus:border-[var(--medicai-green)] focus:ring-1 focus:ring-[var(--medicai-green)] transition-colors"
                placeholder={useBackupCode ? "XXXX-XXXX" : "000000"}
              />
            </div>

            <button
              type="submit"
              disabled={loading || (useBackupCode ? mfaCode.length < 8 : mfaCode.length !== 6)}
              className="w-full h-11 bg-black hover:bg-neutral-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Vérifier'
              )}
            </button>

            {/* Toggle backup code mode */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setUseBackupCode(!useBackupCode);
                  setMfaCode('');
                  setError('');
                }}
                className="text-xs text-neutral-500 hover:text-[var(--medicai-green-dark)] transition-colors"
              >
                {useBackupCode 
                  ? 'Utiliser l\'application d\'authentification' 
                  : 'Utiliser un code de récupération'}
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-neutral-400 mt-8">
          © 2026 MedicAI
        </p>

        {/* Register link */}
        {step === 'credentials' && (
          <div className="text-center mt-3">
            <button
              onClick={() => router.push('/register')}
              className="text-sm text-neutral-500 hover:text-[var(--medicai-green-dark)] transition-colors"
            >
              Pas encore de compte ? <span className="underline">Créer un espace médecin</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
