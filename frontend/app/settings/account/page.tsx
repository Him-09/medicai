'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { settingsApi, UserProfile } from '@/lib/api/settings';

export default function AccountPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [showDeletePhotoDialog, setShowDeletePhotoDialog] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [stampImage, setStampImage] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [isUploadingStamp, setIsUploadingStamp] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    specialty: 'Médecine générale',
    licenseNumber: '',
    outputLanguage: 'fr',
    aiCompactness: 'normal',
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setIsFetching(true);
      const [profileData, imagesData] = await Promise.all([
        settingsApi.getProfile(),
        settingsApi.getProfileImages(),
      ]);

      setProfile({
        firstName: profileData.first_name || '',
        lastName: profileData.last_name || '',
        email: profileData.email || '',
        phone: profileData.phone || '',
        specialty: profileData.specialty || 'Médecine générale',
        licenseNumber: profileData.license_number || '',
        outputLanguage: profileData.output_language || 'fr',
        aiCompactness: profileData.ai_compactness || 'normal',
      });

      setProfilePhoto(imagesData.profile_photo);
      setSignatureImage(imagesData.signature_image);
      setStampImage(imagesData.stamp_image);
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setIsFetching(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await settingsApi.updateProfile({
        first_name: profile.firstName,
        last_name: profile.lastName,
        phone: profile.phone,
        specialty: profile.specialty,
        license_number: profile.licenseNumber,
        output_language: profile.outputLanguage,
        ai_compactness: profile.aiCompactness,
      });
      toast.success('Profil mis à jour avec succès');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
      toast.error('Format non supporté. Utilisez JPG, PNG ou GIF.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('La taille du fichier ne doit pas dépasser 2MB.');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const result = await settingsApi.uploadProfilePhoto(file);
      setProfilePhoto(result.photo_url);
      toast.success('Photo de profil mise à jour');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors du téléchargement');
    } finally {
      setIsUploadingPhoto(false);

      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async () => {
    try {
      await settingsApi.deleteProfilePhoto();
      setProfilePhoto(null);
      setShowDeletePhotoDialog(false);
      toast.success('Photo de profil supprimée');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const handleSignatureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Format non supporté. Utilisez JPG ou PNG.');
      return;
    }

    if (file.size > 1024 * 1024) {
      toast.error('La taille du fichier ne doit pas dépasser 1MB.');
      return;
    }

    setIsUploadingSignature(true);
    try {
      const result = await settingsApi.uploadSignature(file);
      setSignatureImage(result.signature_url);
      toast.success('Signature mise à jour');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors du téléchargement');
    } finally {
      setIsUploadingSignature(false);
      if (signatureInputRef.current) signatureInputRef.current.value = '';
    }
  };

  const handleDeleteSignature = async () => {
    try {
      await settingsApi.deleteSignature();
      setSignatureImage(null);
      toast.success('Signature supprimée');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const handleStampUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Format non supporté. Utilisez JPG ou PNG.');
      return;
    }

    if (file.size > 1024 * 1024) {
      toast.error('La taille du fichier ne doit pas dépasser 1MB.');
      return;
    }

    setIsUploadingStamp(true);
    try {
      const result = await settingsApi.uploadStamp(file);
      setStampImage(result.stamp_url);
      toast.success('Cachet mis à jour');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors du téléchargement');
    } finally {
      setIsUploadingStamp(false);
      if (stampInputRef.current) stampInputRef.current.value = '';
    }
  };

  const handleDeleteStamp = async () => {
    try {
      await settingsApi.deleteStamp();
      setStampImage(null);
      toast.success('Cachet supprimé');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const initials = `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.replace('Dr. ', '') || 'DR';

  if (isFetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-[var(--medicai-green)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif"
        onChange={handlePhotoUpload}
        className="hidden"
      />
      <input
        ref={signatureInputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleSignatureUpload}
        className="hidden"
      />
      <input
        ref={stampInputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleStampUpload}
        className="hidden"
      />

      {}
      <div>
        <h1 className="text-2xl font-bold text-[#111]">Mon compte</h1>
        <p className="text-sm text-[#666] mt-0.5">
          Gérez vos informations personnelles et professionnelles.
        </p>
      </div>

      {}
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 border-2 border-[#E5E5E5]">
            <AvatarImage src={profilePhoto || ''} />
            <AvatarFallback className="text-base bg-[var(--medicai-green-light)] text-[var(--medicai-green-dark)]">{initials}</AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-sm border-[#E5E5E5]"
                onClick={() => photoInputRef.current?.click()}
                disabled={isUploadingPhoto}
              >
                {isUploadingPhoto ? (
                  <div className="animate-spin h-4 w-4 mr-2 border-2 border-gray-300 border-t-transparent rounded-full" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {isUploadingPhoto ? 'Téléchargement...' : 'Changer la photo'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-sm text-[#666]"
                onClick={() => profilePhoto ? setShowDeletePhotoDialog(true) : toast.info('Aucune photo à supprimer')}
                disabled={isUploadingPhoto}
              >
                Supprimer
              </Button>
            </div>
            <p className="text-sm text-[#999]">JPG, PNG ou GIF. Max 2MB.</p>
          </div>
        </div>
      </div>

      {}
      <AlertDialog open={showDeletePhotoDialog} onOpenChange={setShowDeletePhotoDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la photo de profil ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Votre photo de profil sera remplacée par vos initiales.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePhoto} className="bg-red-600 hover:bg-red-700">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {}
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
        <h2 className="text-sm font-semibold text-[#111] mb-3">Informations personnelles</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="firstName" className="text-xs text-[#555]">Prénom</Label>
            <Input
              id="firstName"
              value={profile.firstName}
              onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
              className="h-9 border-[#E5E5E5] focus:border-[var(--medicai-green)] focus:ring-[var(--medicai-green)]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lastName" className="text-xs text-[#555]">Nom</Label>
            <Input
              id="lastName"
              value={profile.lastName}
              onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
              className="h-9 border-[#E5E5E5] focus:border-[var(--medicai-green)] focus:ring-[var(--medicai-green)]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email" className="text-xs text-[#555]">Email</Label>
            <Input
              id="email"
              type="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              className="h-9 border-[#E5E5E5] focus:border-[var(--medicai-green)] focus:ring-[var(--medicai-green)]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone" className="text-xs text-[#555]">Téléphone</Label>
            <Input
              id="phone"
              type="tel"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              className="h-9 border-[#E5E5E5] focus:border-[var(--medicai-green)] focus:ring-[var(--medicai-green)]"
            />
          </div>
        </div>
      </div>

      {}
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
        <h2 className="text-sm font-semibold text-[#111] mb-3">Informations professionnelles</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="specialty" className="text-xs text-[#555]">Spécialité</Label>
            <Select
              value={profile.specialty}
              onValueChange={(value) => setProfile({ ...profile, specialty: value })}
            >
              <SelectTrigger id="specialty" className="h-9 border-[#E5E5E5]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Médecine générale">Médecine générale</SelectItem>
                <SelectItem value="Cardiologie">Cardiologie</SelectItem>
                <SelectItem value="Dermatologie">Dermatologie</SelectItem>
                <SelectItem value="Endocrinologie">Endocrinologie</SelectItem>
                <SelectItem value="Gastro-entérologie">Gastro-entérologie</SelectItem>
                <SelectItem value="Neurologie">Neurologie</SelectItem>
                <SelectItem value="Pédiatrie">Pédiatrie</SelectItem>
                <SelectItem value="Pneumologie">Pneumologie</SelectItem>
                <SelectItem value="Psychiatrie">Psychiatrie</SelectItem>
                <SelectItem value="Rhumatologie">Rhumatologie</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="licenseNumber" className="text-xs text-[#555]">N° CNOM</Label>
            <Input
              id="licenseNumber"
              value={profile.licenseNumber}
              onChange={(e) => setProfile({ ...profile, licenseNumber: e.target.value })}
              className="h-9 border-[#E5E5E5] focus:border-[var(--medicai-green)] focus:ring-[var(--medicai-green)]"
            />
          </div>
        </div>
      </div>

      {}
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
        <h2 className="text-sm font-semibold text-[#111] mb-3">Signature et cachet</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-[#555]">Signature</Label>
            {signatureImage ? (
              <div className="relative border-2 border-[#E5E5E5] rounded-lg p-2 group">
                <img
                  src={signatureImage}
                  alt="Signature"
                  className="max-h-20 mx-auto object-contain"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    onClick={() => signatureInputRef.current?.click()}
                    disabled={isUploadingSignature}
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Changer
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 text-xs"
                    onClick={handleDeleteSignature}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Supprimer
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className={`border-2 border-dashed border-[#E5E5E5] rounded-lg p-4 text-center hover:border-[var(--medicai-green)] hover:bg-[#FAFAFA] transition-colors cursor-pointer ${isUploadingSignature ? 'opacity-50' : ''}`}
                onClick={() => !isUploadingSignature && signatureInputRef.current?.click()}
              >
                {isUploadingSignature ? (
                  <div className="animate-spin h-5 w-5 mx-auto border-2 border-[var(--medicai-green)] border-t-transparent rounded-full mb-1" />
                ) : (
                  <Upload className="h-5 w-5 mx-auto text-[#999] mb-1" />
                )}
                <p className="text-xs text-[#666]">{isUploadingSignature ? 'Téléchargement...' : 'Cliquez pour télécharger'}</p>
                <p className="text-xs text-[#999] mt-1">PNG, JPG jusqu'à 1MB</p>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[#555]">Cachet</Label>
            {stampImage ? (
              <div className="relative border-2 border-[#E5E5E5] rounded-lg p-2 group">
                <img
                  src={stampImage}
                  alt="Cachet"
                  className="max-h-20 mx-auto object-contain"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    onClick={() => stampInputRef.current?.click()}
                    disabled={isUploadingStamp}
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Changer
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 text-xs"
                    onClick={handleDeleteStamp}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Supprimer
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className={`border-2 border-dashed border-[#E5E5E5] rounded-lg p-4 text-center hover:border-[var(--medicai-green)] hover:bg-[#FAFAFA] transition-colors cursor-pointer ${isUploadingStamp ? 'opacity-50' : ''}`}
                onClick={() => !isUploadingStamp && stampInputRef.current?.click()}
              >
                {isUploadingStamp ? (
                  <div className="animate-spin h-5 w-5 mx-auto border-2 border-[var(--medicai-green)] border-t-transparent rounded-full mb-1" />
                ) : (
                  <Upload className="h-5 w-5 mx-auto text-[#999] mb-1" />
                )}
                <p className="text-xs text-[#666]">{isUploadingStamp ? 'Téléchargement...' : 'Cliquez pour télécharger'}</p>
                <p className="text-xs text-[#999] mt-1">PNG, JPG jusqu'à 1MB</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {}
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
        <h2 className="text-sm font-semibold text-[#111] mb-3">Préférences IA</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="outputLanguage" className="text-xs text-[#555]">Langue de sortie</Label>
            <Select
              value={profile.outputLanguage}
              onValueChange={(value) => setProfile({ ...profile, outputLanguage: value })}
            >
              <SelectTrigger id="outputLanguage" className="h-10 border-[#E5E5E5]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="ar">العربية (Arabe)</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aiCompactness" className="text-sm text-[#555]">Style des réponses</Label>
            <Select
              value={profile.aiCompactness}
              onValueChange={(value) => setProfile({ ...profile, aiCompactness: value })}
            >
              <SelectTrigger id="aiCompactness" className="h-10 border-[#E5E5E5]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Court</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="detailed">Détaillé</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isLoading}
          className="h-9 px-5 bg-black hover:bg-neutral-800 text-white text-sm"
        >
          {isLoading ? 'Enregistrement...' : 'Enregistrer les modifications'}
        </Button>
      </div>
    </div>
  );
}
