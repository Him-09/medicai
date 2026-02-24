'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth';
import { AlertCircle, ArrowRight, ArrowLeft, Stethoscope, ChevronDown } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [specialities, setSpecialities] = useState<string[]>([]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');

  useEffect(() => {
    authService.fetchSpecialities().then(setSpecialities);
  }, []);

  useEffect(() => {
    if (firstName || lastName) {
      const name = [firstName, lastName].filter(Boolean).join(' ');
      setClinicName(`Cabinet Dr. ${name}`);
    }
  }, [firstName, lastName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (!specialty) {
      setError('Veuillez sélectionner votre spécialité');
      return;
    }

    setLoading(true);

    try {
      const response = await authService.register({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        specialty,
        clinic_name: clinicName,
        phone: phone || undefined,
        license_number: licenseNumber || undefined,
      });

      router.push('/');
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError(error.message || 'Erreur lors de la création du compte');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white py-12">
      <div className="w-full max-w-md px-6">
        {}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[var(--medicai-green-light)] rounded-full mb-4">
            <Stethoscope className="h-7 w-7 text-[var(--medicai-green-darker)]" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-black">
            MedicAI
          </h1>
          <p className="text-sm text-neutral-500 mt-2">
            Créez votre espace médecin
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-black mb-1.5">
                Prénom
              </label>
              <input
                id="firstName"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full h-11 px-4 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-black placeholder-neutral-400 focus:outline-none focus:border-[var(--medicai-green)] focus:ring-1 focus:ring-[var(--medicai-green)] transition-colors"
                placeholder="Ibrahim"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-black mb-1.5">
                Nom
              </label>
              <input
                id="lastName"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full h-11 px-4 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-black placeholder-neutral-400 focus:outline-none focus:border-[var(--medicai-green)] focus:ring-1 focus:ring-[var(--medicai-green)] transition-colors"
                placeholder="Oubelkas"
              />
            </div>
          </div>

          {}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-black mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 px-4 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-black placeholder-neutral-400 focus:outline-none focus:border-[var(--medicai-green)] focus:ring-1 focus:ring-[var(--medicai-green)] transition-colors"
              placeholder="vous@exemple.com"
            />
          </div>

          {}
          <div>
            <label htmlFor="specialty" className="block text-sm font-medium text-black mb-1.5">
              Spécialité
            </label>
            <div className="relative">
              <select
                id="specialty"
                required
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                className="w-full h-11 px-4 pr-10 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-black appearance-none focus:outline-none focus:border-[var(--medicai-green)] focus:ring-1 focus:ring-[var(--medicai-green)] transition-colors"
              >
                <option value="">Sélectionnez votre spécialité</option>
                {specialities.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
            </div>
          </div>

          {}
          <div>
            <label htmlFor="clinicName" className="block text-sm font-medium text-black mb-1.5">
              Nom du cabinet
            </label>
            <input
              id="clinicName"
              type="text"
              required
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              className="w-full h-11 px-4 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-black placeholder-neutral-400 focus:outline-none focus:border-[var(--medicai-green)] focus:ring-1 focus:ring-[var(--medicai-green)] transition-colors"
              placeholder="Cabinet Dr. Oubelkas"
            />
          </div>

          {}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-black mb-1.5">
                Téléphone <span className="text-neutral-400">(opt.)</span>
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full h-11 px-4 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-black placeholder-neutral-400 focus:outline-none focus:border-[var(--medicai-green)] focus:ring-1 focus:ring-[var(--medicai-green)] transition-colors"
                placeholder="06 12 34 56 78"
              />
            </div>
            <div>
              <label htmlFor="license" className="block text-sm font-medium text-black mb-1.5">
                N° INPE <span className="text-neutral-400">(opt.)</span>
              </label>
              <input
                id="license"
                type="text"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                className="w-full h-11 px-4 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-black placeholder-neutral-400 focus:outline-none focus:border-[var(--medicai-green)] focus:ring-1 focus:ring-[var(--medicai-green)] transition-colors"
                placeholder="123456"
              />
            </div>
          </div>

          {}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-black mb-1.5">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 px-4 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-black placeholder-neutral-400 focus:outline-none focus:border-[var(--medicai-green)] focus:ring-1 focus:ring-[var(--medicai-green)] transition-colors"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-black mb-1.5">
                Confirmer
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-11 px-4 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-black placeholder-neutral-400 focus:outline-none focus:border-[var(--medicai-green)] focus:ring-1 focus:ring-[var(--medicai-green)] transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          {password && confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-red-500">Les mots de passe ne correspondent pas</p>
          )}

          <button
            type="submit"
            disabled={loading || !firstName || !lastName || !email || !password || !confirmPassword || !specialty}
            className="w-full h-11 bg-black hover:bg-neutral-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group mt-2"
          >
            {loading ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Créer mon espace
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </form>

        {}
        <div className="text-center mt-6">
          <button
            onClick={() => router.push('/login')}
            className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-[var(--medicai-green-dark)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Déjà inscrit ? Se connecter
          </button>
        </div>

        {}
        <p className="text-center text-xs text-neutral-400 mt-6">
          © 2026 MedicAI
        </p>
      </div>
    </div>
  );
}
