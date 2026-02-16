'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Users,
  Plus,
  Trash2,
  Shield,
  ShieldCheck,
  Copy,
  Eye,
  EyeOff,
  UserPlus,
  AlertCircle,
  Stethoscope,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  settingsApi,
  type TeamMember,
  type TeamListResponse,
} from '@/lib/api/settings';

const MAX_ASSISTANTS = 2;

export default function TeamPage() {
  const [team, setTeam] = useState<TeamListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<string>('doctor');

  // Add assistant dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    email: '',
    first_name: '',
    last_name: '',
    password: '',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  // Credentials dialog (shown after adding)
  const [credentialsDialog, setCredentialsDialog] = useState<{
    open: boolean;
    email: string;
    password: string;
  }>({ open: false, email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchTeam = useCallback(async () => {
    try {
      setLoading(true);
      const [teamData, roleData] = await Promise.all([
        settingsApi.getTeamMembers(),
        settingsApi.getMyRole(),
      ]);
      setTeam(teamData);
      setMyRole(roleData.role);
    } catch (err) {
      console.error('Failed to load team:', err);
      toast.error('Erreur lors du chargement de l\'équipe');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const assistantCount = team?.members.filter((m) => m.role === 'assistant').length ?? 0;
  const canAddMore = assistantCount < MAX_ASSISTANTS;
  const isDoctor = myRole === 'doctor';

  const handleAddAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);

    try {
      const result = await settingsApi.inviteTeamMember({
        email: addForm.email.trim().toLowerCase(),
        role: 'assistant',
        first_name: addForm.first_name.trim() || undefined,
        last_name: addForm.last_name.trim() || undefined,
        password: addForm.password.trim() || undefined,
      });

      setAddDialogOpen(false);
      setAddForm({ email: '', first_name: '', last_name: '', password: '' });

      // Show credentials
      setCredentialsDialog({
        open: true,
        email: result.email,
        password: result.temp_password,
      });

      toast.success('Assistant ajouté avec succès');
      fetchTeam();
    } catch (err: any) {
      const message =
        err?.response?.data?.detail || err?.message || 'Erreur lors de l\'ajout';
      setAddError(message);
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);

    try {
      await settingsApi.removeMember(deleteTarget.id);
      toast.success(`${deleteTarget.email} a été retiré de l'équipe`);
      setDeleteTarget(null);
      fetchTeam();
    } catch (err: any) {
      const message =
        err?.response?.data?.detail || err?.message || 'Erreur lors de la suppression';
      toast.error(message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copié dans le presse-papiers');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--medicai-green)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111]">Équipe</h1>
          <p className="text-sm text-[#666] mt-0.5">
            Gérez les assistants de votre cabinet — maximum {MAX_ASSISTANTS} assistants
          </p>
        </div>
        {isDoctor && (
          <Button
            onClick={() => {
              if (!canAddMore) {
                toast.error(
                  `Maximum ${MAX_ASSISTANTS} assistants. Retirez un assistant existant pour en ajouter un nouveau.`
                );
                return;
              }
              setAddDialogOpen(true);
            }}
            className="h-9 px-4 text-sm font-medium bg-[#111] hover:bg-[#333] text-white rounded-lg"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Ajouter un assistant
          </Button>
        )}
      </div>

      {/* Capacity indicator */}
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-[#111]">Places assistants</span>
          <span className="text-sm text-[#666]">
            {assistantCount} / {MAX_ASSISTANTS}
          </span>
        </div>
        <div className="w-full bg-[#F0F0F0] rounded-full h-2">
          <div
            className={cn(
              'h-2 rounded-full transition-all',
              assistantCount >= MAX_ASSISTANTS
                ? 'bg-orange-400'
                : 'bg-[var(--medicai-green-darker)]'
            )}
            style={{ width: `${(assistantCount / MAX_ASSISTANTS) * 100}%` }}
          />
        </div>
        {!canAddMore && (
          <p className="text-xs text-orange-600 mt-1.5">
            Toutes les places sont occupées. Retirez un assistant pour en ajouter un nouveau.
          </p>
        )}
      </div>

      {/* Team Members */}
      <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
        {/* Doctor (always first) */}
        {team?.members
          .filter((m) => m.role === 'doctor')
          .map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 p-4 border-b border-[#E5E5E5] bg-[var(--medicai-green-lighter)]/40"
            >
              {/* Avatar */}
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--medicai-green-light)] border border-[var(--medicai-green)]/30 flex-shrink-0">
                <Stethoscope className="h-5 w-5 text-[var(--medicai-green-darker)]" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-[#111] truncate">
                    {member.first_name || member.last_name
                      ? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim()
                      : member.email}
                  </span>
                  <Badge className="bg-[var(--medicai-green-light)] text-[var(--medicai-green-darker)] border-[var(--medicai-green)]/30 text-[10px] font-medium px-1.5 py-0">
                    Médecin
                  </Badge>
                  {member.totp_enabled && (
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--medicai-green-darker)]" />
                  )}
                </div>
                <p className="text-xs text-[#888] truncate">{member.email}</p>
              </div>

              <span className="text-xs text-[#999]">Propriétaire</span>
            </div>
          ))}

        {/* Assistants */}
        {team?.members
          .filter((m) => m.role === 'assistant')
          .map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 p-4 border-b border-[#E5E5E5] last:border-b-0"
            >
              {/* Avatar */}
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F5] border border-[#E5E5E5] flex-shrink-0">
                <Users className="h-4 w-4 text-[#888]" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-[#111] truncate">
                    {member.first_name || member.last_name
                      ? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim()
                      : member.email}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-medium px-1.5 py-0 text-[#888] border-[#DDD]"
                  >
                    Assistant
                  </Badge>
                  {member.totp_enabled && (
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--medicai-green-darker)]" />
                  )}
                </div>
                <p className="text-xs text-[#888] truncate">{member.email}</p>
              </div>

              {/* Actions */}
              {isDoctor && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteTarget(member)}
                  className="h-8 w-8 p-0 text-[#CCC] hover:text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

        {/* Empty state for assistants */}
        {assistantCount === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-[#999]">
            <Users className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">Aucun assistant</p>
            <p className="text-xs mt-1">
              Ajoutez jusqu'à {MAX_ASSISTANTS} assistants pour vous aider au quotidien.
            </p>
            {isDoctor && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddDialogOpen(true)}
                className="mt-4 h-8 px-3 text-xs text-[var(--medicai-green-darker)] border-[var(--medicai-green)] hover:bg-[var(--medicai-green-light)]"
              >
                <Plus className="h-3 w-3 mr-1" />
                Ajouter un assistant
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Permissions info */}
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4 space-y-3">
        <h3 className="text-sm font-medium text-[#111] flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#888]" />
          Permissions des rôles
        </h3>
        <Separator className="bg-[#E5E5E5]" />
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="font-medium text-[#111] mb-1.5 flex items-center gap-1.5">
              <Stethoscope className="h-3.5 w-3.5 text-[var(--medicai-green-darker)]" />
              Médecin
            </p>
            <ul className="space-y-1 text-[#666]">
              <li>• Accès complet au cabinet</li>
              <li>• Consultations & chat IA</li>
              <li>• Gestion des patients</li>
              <li>• Paramètres & intégrations</li>
              <li>• Gestion de l'équipe</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-[#111] mb-1.5 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-[#888]" />
              Assistant
            </p>
            <ul className="space-y-1 text-[#666]">
              <li>• Voir les patients</li>
              <li>• Télécharger des documents</li>
              <li>• Consulter les résultats</li>
              <li className="text-red-400">• Pas de chat IA</li>
              <li className="text-red-400">• Pas d'accès aux paramètres</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ======== ADD ASSISTANT DIALOG ======== */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-5 w-5" />
              Ajouter un assistant
            </DialogTitle>
            <DialogDescription>
              Créez un compte assistant pour votre cabinet. L'assistant aura un accès limité.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddAssistant} className="space-y-4 pt-2">
            {addError && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="first_name" className="text-xs">
                  Prénom
                </Label>
                <Input
                  id="first_name"
                  value={addForm.first_name}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, first_name: e.target.value }))
                  }
                  placeholder="Jean"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name" className="text-xs">
                  Nom
                </Label>
                <Input
                  id="last_name"
                  value={addForm.last_name}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, last_name: e.target.value }))
                  }
                  placeholder="Dupont"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={addForm.email}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="assistant@exemple.com"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">
                Mot de passe{' '}
                <span className="text-[#999] font-normal">(optionnel — auto-généré si vide)</span>
              </Label>
              <Input
                id="password"
                type="text"
                value={addForm.password}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, password: e.target.value }))
                }
                placeholder="Laisser vide pour auto-générer"
                className="h-9 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAddDialogOpen(false);
                  setAddError('');
                }}
                className="h-9 px-4 text-sm"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={addLoading || !addForm.email}
                size="sm"
                className="h-9 px-4 text-sm bg-[#111] hover:bg-[#333] text-white"
              >
                {addLoading ? (
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Créer le compte'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======== CREDENTIALS DIALOG ======== */}
      <Dialog
        open={credentialsDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setCredentialsDialog({ open: false, email: '', password: '' });
            setShowPassword(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base">Identifiants de connexion</DialogTitle>
            <DialogDescription>
              Transmettez ces identifiants à l'assistant. Le mot de passe ne sera plus affiché.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#999]">Email</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-[#F5F5F5] rounded-md px-3 py-2 font-mono">
                  {credentialsDialog.email}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => copyToClipboard(credentialsDialog.email)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-[#999]">Mot de passe</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-[#F5F5F5] rounded-md px-3 py-2 font-mono">
                  {showPassword ? credentialsDialog.password : '••••••••••••'}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => copyToClipboard(credentialsDialog.password)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-[#FFF9E6] border border-[#F5E6B3] rounded-lg mt-2">
              <AlertCircle className="h-4 w-4 text-[#B8860B] flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[#8B7355]">
                <span className="font-medium text-[#6B4F1D]">Important :</span>{' '}
                Notez ce mot de passe maintenant. Il ne sera plus accessible après la fermeture de cette fenêtre.
              </p>
            </div>

            <Button
              onClick={() => {
                setCredentialsDialog({ open: false, email: '', password: '' });
                setShowPassword(false);
              }}
              className="w-full h-9 text-sm mt-2 bg-[#111] hover:bg-[#333] text-white"
            >
              J'ai noté les identifiants
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ======== DELETE CONFIRMATION DIALOG ======== */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="text-base">Retirer l'assistant ?</DialogTitle>
            <DialogDescription>
              Le compte de{' '}
              <span className="font-medium text-[#111]">{deleteTarget?.email}</span>{' '}
              sera supprimé définitivement. Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              className="h-9 px-4 text-sm"
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRemoveMember}
              disabled={deleteLoading}
              className="h-9 px-4 text-sm"
            >
              {deleteLoading ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Supprimer'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
