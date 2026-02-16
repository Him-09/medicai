'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Smartphone, Monitor, Globe, LogOut, Lock, ShieldCheck, QrCode, Key, Eye, EyeOff } from 'lucide-react';
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
  DialogFooter,
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
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFASecret, setTwoFASecret] = useState('');
  const [twoFAQRCode, setTwoFAQRCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('weak');
  const [disableCode, setDisableCode] = useState('');
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [isSettingUp2FA, setIsSettingUp2FA] = useState(false);
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
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
      const [sessionsData, twoFAStatus] = await Promise.all([
        settingsApi.getSessions(),
        settingsApi.get2FAStatus(),
      ]);
      setSessions(sessionsData.sessions || []);
      setIs2FAEnabled(twoFAStatus.enabled);
      
      // If 2FA is enabled, load backup codes count
      if (twoFAStatus.enabled) {
        try {
          const backupData = await settingsApi.getBackupCodes();
          setBackupCodes(backupData.backup_codes || []);
        } catch (e) {
          console.error('Failed to load backup codes:', e);
        }
      }
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

  const handleSetup2FA = async () => {
    setIsSettingUp2FA(true);
    try {
      const data = await settingsApi.setup2FA();
      setTwoFASecret(data.secret);
      setTwoFAQRCode(data.qr_code);
      setShow2FASetup(true);
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(err.message || 'Erreur lors de la configuration 2FA');
    } finally {
      setIsSettingUp2FA(false);
    }
  };

  const handleVerify2FA = async () => {
    if (twoFACode.length !== 6) {
      toast.error('Le code doit contenir 6 chiffres');
      return;
    }
    
    setIsVerifying2FA(true);
    try {
      const data = await settingsApi.verify2FA(twoFACode);
      setBackupCodes(data.backup_codes);
      setIs2FAEnabled(true);
      setShow2FASetup(false);
      setShowBackupCodes(true);
      setTwoFACode('');
      toast.success('Authentification à deux facteurs activée');
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(err.message || 'Code de vérification invalide');
    } finally {
      setIsVerifying2FA(false);
    }
  };

  const handleDisable2FA = async () => {
    if (disableCode.length !== 6) {
      toast.error('Le code doit contenir 6 chiffres');
      return;
    }
    
    try {
      await settingsApi.disable2FA(disableCode);
      setIs2FAEnabled(false);
      setBackupCodes([]);
      setDisableCode('');
      setShowDisableDialog(false);
      toast.info('Authentification à deux facteurs désactivée');
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(err.message || 'Code de vérification invalide');
    }
  };

  const handleLogoutSession = async (sessionId: string) => {
    try {
      await settingsApi.logoutSession(sessionId);
      toast.success('Session déconnectée');
      setSessions(sessions.filter(s => s.id !== sessionId));
    } catch (error) {
      console.error('Failed to logout session:', error);
      toast.error('Erreur lors de la déconnexion');
    }
  };

  const handleLogoutAllSessions = async () => {
    try {
      await settingsApi.logoutAllSessions();
      toast.success('Toutes les autres sessions ont été déconnectées');
      setSessions(sessions.filter(s => s.current));
    } catch (error) {
      console.error('Failed to logout all sessions:', error);
      toast.error('Erreur lors de la déconnexion');
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    toast.success('Codes de récupération copiés');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#111]">Sécurité</h1>
        <p className="text-sm text-[#666] mt-0.5">
          Gérez votre mot de passe et les sessions actives.
        </p>
      </div>

      {/* Password Section */}
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

      {/* 2FA Section */}
      <div className="bg-white rounded-xl border border-[#E5E5E5] p-6">
        <div className="uppercase text-[11px] font-semibold text-[#999] tracking-wide mb-4">
          Authentification à deux facteurs (2FA)
        </div>
        
        {is2FAEnabled ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
              <ShieldCheck className="h-6 w-6 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">2FA activé</p>
                <p className="text-xs text-green-600">Votre compte est protégé par une authentification à deux facteurs.</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-9 text-sm border-[#E5E5E5]"
                onClick={() => setShowBackupCodes(true)}
              >
                <Key className="h-4 w-4 mr-2" />
                Voir les codes de récupération
              </Button>
              <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 text-sm text-red-600 border-red-200 hover:bg-red-50">
                    Désactiver
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Désactiver l'authentification à deux facteurs</DialogTitle>
                    <DialogDescription>
                      Entrez le code de votre application d'authentification pour confirmer.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label className="text-sm text-[#555]">Code de vérification</Label>
                      <Input
                        className="h-12 text-center text-xl font-mono tracking-widest border-[#E5E5E5]"
                        value={disableCode}
                        onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                      />
                    </div>
                    <p className="text-xs text-red-600">
                      ⚠️ Votre compte sera moins sécurisé sans la 2FA.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setShowDisableDialog(false); setDisableCode(''); }}>
                      Annuler
                    </Button>
                    <Button 
                      onClick={handleDisable2FA}
                      disabled={disableCode.length !== 6}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Désactiver
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-gray-400" />
              </div>
              <div>
                <span className="text-sm text-[#333]">Ajouter une méthode d'authentification</span>
                <p className="text-xs text-[#666]">Protégez votre compte avec une deuxième couche de sécurité</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 text-sm border-[#E5E5E5]"
              onClick={handleSetup2FA}
              disabled={isSettingUp2FA}
            >
              {isSettingUp2FA ? 'Configuration...' : '+ Configurer'}
            </Button>
          </div>
        )}
      </div>

      {/* 2FA Setup Dialog */}
      <Dialog open={show2FASetup} onOpenChange={setShow2FASetup}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurer l'authentification à deux facteurs</DialogTitle>
            <DialogDescription>
              Scannez le QR code avec votre application d'authentification (Google Authenticator, Authy, etc.)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-center p-4 bg-white border rounded-lg">
              {twoFAQRCode ? (
                <img src={twoFAQRCode} alt="QR Code 2FA" className="h-48 w-48" />
              ) : (
                <div className="h-48 w-48 bg-gray-100 rounded-lg flex items-center justify-center">
                  <QrCode className="h-24 w-24 text-gray-400" />
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm text-[#555]">Ou entrez ce code manuellement:</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-gray-100 rounded-lg font-mono text-sm text-center">
                  {twoFASecret}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(twoFASecret);
                    toast.success('Code copié');
                  }}
                >
                  Copier
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm text-[#555]">Entrez le code à 6 chiffres de votre application:</Label>
              <Input
                className="h-12 text-center text-xl font-mono tracking-widest border-[#E5E5E5]"
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShow2FASetup(false)}>
              Annuler
            </Button>
            <Button 
              onClick={handleVerify2FA}
              disabled={twoFACode.length !== 6 || isVerifying2FA}
              className="bg-black hover:bg-neutral-800"
            >
              {isVerifying2FA ? 'Vérification...' : 'Vérifier et activer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backup Codes Dialog */}
      <Dialog open={showBackupCodes} onOpenChange={setShowBackupCodes}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Codes de récupération</DialogTitle>
            <DialogDescription>
              Conservez ces codes en lieu sûr. Chaque code ne peut être utilisé qu'une seule fois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-2 p-4 bg-gray-100 rounded-lg">
              {backupCodes.map((code, index) => (
                <code key={index} className="font-mono text-sm p-2 bg-white rounded text-center">
                  {code}
                </code>
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={copyBackupCodes}>
              <Key className="h-4 w-4 mr-2" />
              Copier tous les codes
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowBackupCodes(false)} className="bg-black hover:bg-neutral-800">
              J'ai sauvegardé mes codes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active Sessions */}
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
              <div key={session.id} className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-[#F5F5F5] flex items-center justify-center">
                    {session.device.includes('iPhone') || session.device.includes('Android') ? (
                      <Smartphone className="h-5 w-5 text-[#666]" />
                    ) : (
                      <Monitor className="h-5 w-5 text-[#666]" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#111]">{session.device}</span>
                      {session.current && (
                        <span className="text-xs text-[var(--medicai-green-dark)] font-medium bg-[var(--medicai-green-light)] px-2 py-0.5 rounded">
                          Session actuelle
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-[#666] mt-0.5">
                      <span>{session.browser}</span>
                      <span>•</span>
                      <Globe className="h-3.5 w-3.5" />
                      <span>{session.location}</span>
                      <span>•</span>
                      <span>{session.last_active}</span>
                    </div>
                  </div>
                </div>
                {!session.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-sm text-[#666]"
                    onClick={() => handleLogoutSession(session.id)}
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
