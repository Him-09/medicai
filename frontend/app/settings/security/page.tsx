'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Smartphone, Monitor, Globe, LogOut, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { settingsApi, Session } from '@/lib/api/settings';

export default function SecurityPage() {
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('weak');
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsFetching(true);
      const sessionsData = await settingsApi.getSessions();
      setSessions(sessionsData.sessions || []);
    } catch (error) {
      console.error('Failed to load security data:', error);
    } finally {
      setIsFetching(false);
    }
  };

  const checkPasswordStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength <= 2) return 'weak';
    if (strength <= 4) return 'medium';
    return 'strong';
  };

  const handlePasswordChange = (value: string) => {
    setPasswordForm({ ...passwordForm, newPassword: value });
    setPasswordStrength(checkPasswordStrength(value));
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setIsChangingPassword(true);
    try {
      await settingsApi.changePassword({ current_password: passwordForm.currentPassword, new_password: passwordForm.newPassword });
      toast.success('Mot de passe modifié avec succès');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordDialogOpen(false);
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(err.message || 'Erreur lors du changement de mot de passe');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLogoutSession = async (sessionId: string) => {
    try {
      await settingsApi.deleteSession(sessionId);
      toast.success('Session déconnectée');
      setSessions(sessions.filter(s => s.session_id !== sessionId));
    } catch (error) {
      console.error('Failed to logout session:', error);
      toast.error('Erreur lors de la déconnexion');
    }
  };

  const handleLogoutAllSessions = async () => {
    try {
      await settingsApi.logoutAll();
      toast.success('Toutes les autres sessions ont été déconnectées');
      setSessions(sessions.filter(s => s.is_current));
    } catch (error) {
      console.error('Failed to logout all sessions:', error);
      toast.error('Erreur lors de la déconnexion');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#111]">Sécurité</h1>
        <p className="text-sm text-[#666] mt-0.5">
          Gérez votre mot de passe et les sessions actives.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
        <div className="uppercase text-[10px] font-semibold text-[#999] tracking-wide mb-3">
          Mot de passe
        </div>
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-[#666]" />
            <span className="text-sm text-[#333]">Mot de passe protégé</span>
          </div>
          <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-sm border-[#E5E5E5]">
                Modifier le mot de passe
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Modifier le mot de passe</DialogTitle>
                <DialogDescription>
                  Choisissez un nouveau mot de passe sécurisé (minimum 8 caractères).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-sm text-[#555]">Mot de passe actuel</Label>
                  <div className="relative">
                    <Input
                      type={showCurrentPassword ? 'text' : 'password'}
                      className="h-10 border-[#E5E5E5] pr-10"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-10 w-10"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-[#555]">Nouveau mot de passe</Label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? 'text' : 'password'}
                      className="h-10 border-[#E5E5E5] pr-10"
                      value={passwordForm.newPassword}
                      onChange={(e) => handlePasswordChange(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-10 w-10"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                    </Button>
                  </div>
                  {passwordForm.newPassword && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            passwordStrength === 'weak' ? 'w-1/3 bg-red-500' :
                            passwordStrength === 'medium' ? 'w-2/3 bg-yellow-500' :
                            'w-full bg-green-500'
                          }`}
                        />
                      </div>
                      <span className={`text-xs ${
                        passwordStrength === 'weak' ? 'text-red-500' :
                        passwordStrength === 'medium' ? 'text-yellow-600' :
                        'text-green-500'
                      }`}>
                        {passwordStrength === 'weak' ? 'Faible' : passwordStrength === 'medium' ? 'Moyen' : 'Fort'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-[#555]">Confirmer le nouveau mot de passe</Label>
                  <Input
                    type="password"
                    className="h-10 border-[#E5E5E5]"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  />
                  {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                    <p className="text-xs text-red-500">Les mots de passe ne correspondent pas</p>
                  )}
                </div>
              </div>
              <Button
                onClick={handleChangePassword}
                disabled={isChangingPassword || !passwordForm.currentPassword || !passwordForm.newPassword || passwordForm.newPassword !== passwordForm.confirmPassword}
                className="w-full h-10 bg-black hover:bg-neutral-800"
              >
                {isChangingPassword ? 'Modification...' : 'Modifier le mot de passe'}
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E5E5] p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="uppercase text-[11px] font-semibold text-[#999] tracking-wide">
            Sessions actives
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-sm text-[#666]">
                <LogOut className="h-4 w-4 mr-1.5" />
                Tout déconnecter
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Déconnecter toutes les sessions ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tous les appareils sauf celui-ci seront déconnectés. Vous devrez vous reconnecter sur ces appareils.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogoutAllSessions} className="bg-black hover:bg-neutral-800">
                  Déconnecter tout
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="divide-y divide-[#E5E5E5]">
          {isFetching ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--medicai-green)]"></div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#666]">
              Aucune session active
            </div>
          ) : (
            sessions.map((session) => (
              <div key={session.session_id} className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-[#F5F5F5] flex items-center justify-center">
                    {(session.device || '').includes('Mobile') ? (
                      <Smartphone className="h-5 w-5 text-[#666]" />
                    ) : (
                      <Monitor className="h-5 w-5 text-[#666]" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#111]">{session.device || 'Appareil inconnu'}</span>
                      {session.is_current && (
                        <span className="text-xs text-[var(--medicai-green-dark)] font-medium bg-[var(--medicai-green-light)] px-2 py-0.5 rounded">
                          Session actuelle
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-[#666] mt-0.5">
                      {session.ip_address && (
                        <>
                          <Globe className="h-3.5 w-3.5" />
                          <span>{session.ip_address}</span>
                          <span>·</span>
                        </>
                      )}
                      <span>{session.last_active || session.created_at}</span>
                    </div>
                  </div>
                </div>
                {!session.is_current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-sm text-[#666]"
                    onClick={() => handleLogoutSession(session.session_id)}
                  >
                    Déconnecter
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
