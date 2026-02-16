'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Key, MessageCircle, Mail, Upload, ExternalLink, Copy, Check, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: 'connected' | 'not_connected' | 'coming_soon';
  buttonLabel: string;
}

export default function IntegrationsPage() {
  const [apiKey] = useState('sk_live_xxxxxxxxxxxxxxxxxxxx');
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Email configuration state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailConfig, setEmailConfig] = useState({
    forwardingEmail: 'documents@votre-clinique.medicai.fr',
    autoImport: true,
    notifyOnImport: true,
    defaultPatientFolder: 'inbox',
  });
  
  // Scanner configuration state
  const [scannerDialogOpen, setScannerDialogOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<'disconnected' | 'scanning' | 'connected'>('disconnected');
  const [detectedScanners, setDetectedScanners] = useState<string[]>([]);
  const [selectedScanner, setSelectedScanner] = useState('');

  // WhatsApp configuration state
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [whatsappConfig, setWhatsappConfig] = useState({
    phoneNumber: '',
    apiKey: '',
    webhookUrl: 'https://votre-clinique.medicai.fr/api/whatsapp/webhook',
    autoReply: true,
    businessHoursOnly: true,
  });
  const [whatsappStatus, setWhatsappStatus] = useState<'not_connected' | 'verifying' | 'connected'>('not_connected');
  const [verificationCode, setVerificationCode] = useState('');

  const integrations: Integration[] = [
    {
      id: 'api',
      name: 'Clé API',
      description: 'Utilisez l\'API de MedicAI pour créer vos propres intégrations.',
      icon: Key,
      status: 'connected',
      buttonLabel: 'Gérer les clés',
    },
    {
      id: 'email',
      name: 'Email Forwarding',
      description: 'Importez automatiquement les documents envoyés par email.',
      icon: Mail,
      status: 'connected',
      buttonLabel: 'Configurer',
    },
    {
      id: 'scanner',
      name: 'Scanner Direct',
      description: 'Connectez votre scanner pour importer directement.',
      icon: Upload,
      status: scannerStatus === 'connected' ? 'connected' : 'not_connected',
      buttonLabel: scannerStatus === 'connected' ? 'Configurer' : 'Connecter',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      description: 'Recevez les documents patients via WhatsApp.',
      icon: MessageCircle,
      status: whatsappStatus === 'connected' ? 'connected' : 'not_connected',
      buttonLabel: whatsappStatus === 'connected' ? 'Configurer' : 'Connecter',
    },
  ];

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    toast.success('Clé copiée dans le presse-papiers');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(emailConfig.forwardingEmail);
    toast.success('Adresse email copiée');
  };

  const handleSaveEmailConfig = () => {
    toast.success('Configuration email enregistrée');
    setEmailDialogOpen(false);
  };

  const handleScanForScanners = () => {
    setScannerStatus('scanning');
    // Simulate scanner detection
    setTimeout(() => {
      setDetectedScanners(['HP ScanJet Pro 3000', 'Epson WorkForce ES-400', 'Canon imageFORMULA DR-C225']);
      setScannerStatus('disconnected');
      toast.info('3 scanners détectés');
    }, 2000);
  };

  const handleConnectScanner = () => {
    if (!selectedScanner) {
      toast.error('Veuillez sélectionner un scanner');
      return;
    }
    setScannerStatus('connected');
    toast.success(`Scanner "${selectedScanner}" connecté`);
    setScannerDialogOpen(false);
  };

  const handleVerifyWhatsApp = () => {
    if (!whatsappConfig.phoneNumber || !whatsappConfig.apiKey) {
      toast.error('Veuillez remplir tous les champs requis');
      return;
    }
    setWhatsappStatus('verifying');
    // Simulate verification
    setTimeout(() => {
      toast.info('Code de vérification envoyé par SMS');
    }, 1500);
  };

  const handleConfirmWhatsAppVerification = () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast.error('Veuillez entrer le code à 6 chiffres');
      return;
    }
    setWhatsappStatus('connected');
    toast.success('WhatsApp Business connecté avec succès');
    setWhatsappDialogOpen(false);
    setVerificationCode('');
  };

  const handleDisconnectWhatsApp = () => {
    setWhatsappStatus('not_connected');
    setWhatsappConfig({
      phoneNumber: '',
      apiKey: '',
      webhookUrl: 'https://votre-clinique.medicai.fr/api/whatsapp/webhook',
      autoReply: true,
      businessHoursOnly: true,
    });
    setVerificationCode('');
    toast.success('WhatsApp déconnecté');
  };

  const handleDisconnectScanner = () => {
    setScannerStatus('disconnected');
    setSelectedScanner('');
    toast.info('Scanner déconnecté');
  };

  const renderIntegrationButton = (integration: Integration) => {
    if (integration.id === 'api') {
      return (
        <Dialog>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 text-sm text-[var(--medicai-green-dark)] border-[var(--medicai-green-light)] hover:bg-[var(--medicai-green-light)]"
            >
              {integration.buttonLabel}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clé API</DialogTitle>
              <DialogDescription>
                Utilisez cette clé pour authentifier vos requêtes API.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-sm text-[#555]">Votre clé API</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    readOnly
                    className="h-10 font-mono text-sm border-[#E5E5E5]"
                  />
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-10 w-10 border-[#E5E5E5]"
                    onClick={handleCopyApiKey}
                  >
                    {copied ? <Check className="h-4 w-4 text-[var(--medicai-green-dark)]" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-sm text-[#666]"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? 'Cacher' : 'Afficher'} la clé
                </Button>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Button variant="outline" size="sm" className="h-9 text-sm border-[#E5E5E5]">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Documentation API
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      );
    }

    if (integration.id === 'email') {
      return (
        <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 text-sm text-[var(--medicai-green-dark)] border-[var(--medicai-green-light)] hover:bg-[var(--medicai-green-light)]"
            >
              {integration.buttonLabel}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Configuration Email</DialogTitle>
              <DialogDescription>
                Configurez l'importation automatique de documents par email.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-sm text-[#555]">Adresse de transfert</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={emailConfig.forwardingEmail}
                    readOnly
                    className="h-10 font-mono text-sm border-[#E5E5E5]"
                  />
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-10 w-10 border-[#E5E5E5]"
                    onClick={handleCopyEmail}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-[#999]">
                  Transférez vos emails à cette adresse pour importer les pièces jointes.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm text-[#555]">Import automatique</Label>
                  <p className="text-xs text-[#999]">Importer automatiquement les pièces jointes</p>
                </div>
                <Switch
                  checked={emailConfig.autoImport}
                  onCheckedChange={(checked) => setEmailConfig({ ...emailConfig, autoImport: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm text-[#555]">Notifications</Label>
                  <p className="text-xs text-[#999]">Recevoir une notification à chaque import</p>
                </div>
                <Switch
                  checked={emailConfig.notifyOnImport}
                  onCheckedChange={(checked) => setEmailConfig({ ...emailConfig, notifyOnImport: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-[#555]">Dossier par défaut</Label>
                <Select
                  value={emailConfig.defaultPatientFolder}
                  onValueChange={(value) => setEmailConfig({ ...emailConfig, defaultPatientFolder: value })}
                >
                  <SelectTrigger className="h-10 border-[#E5E5E5]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbox">Boîte de réception</SelectItem>
                    <SelectItem value="to_classify">À classer</SelectItem>
                    <SelectItem value="auto_assign">Attribution auto (par email)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSaveEmailConfig} className="bg-black hover:bg-neutral-800">
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }

    if (integration.id === 'scanner') {
      return (
        <Dialog open={scannerDialogOpen} onOpenChange={setScannerDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 text-sm text-[var(--medicai-green-dark)] border-[var(--medicai-green-light)] hover:bg-[var(--medicai-green-light)]"
            >
              {integration.buttonLabel}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Connexion Scanner</DialogTitle>
              <DialogDescription>
                Connectez un scanner pour importer directement vos documents.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {scannerStatus === 'connected' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                    <Wifi className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-800">Scanner connecté</p>
                      <p className="text-xs text-green-600">{selectedScanner}</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full h-10 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={handleDisconnectScanner}
                  >
                    <WifiOff className="h-4 w-4 mr-2" />
                    Déconnecter le scanner
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="w-full h-10 border-[#E5E5E5]"
                    onClick={handleScanForScanners}
                    disabled={scannerStatus === 'scanning'}
                  >
                    {scannerStatus === 'scanning' ? (
                      <>
                        <div className="h-4 w-4 mr-2 border-2 border-[var(--medicai-green-dark)] border-t-transparent rounded-full animate-spin" />
                        Recherche en cours...
                      </>
                    ) : (
                      <>
                        <Wifi className="h-4 w-4 mr-2" />
                        Rechercher des scanners
                      </>
                    )}
                  </Button>

                  {detectedScanners.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm text-[#555]">Scanners détectés</Label>
                      <Select value={selectedScanner} onValueChange={setSelectedScanner}>
                        <SelectTrigger className="h-10 border-[#E5E5E5]">
                          <SelectValue placeholder="Sélectionnez un scanner" />
                        </SelectTrigger>
                        <SelectContent>
                          {detectedScanners.map((scanner) => (
                            <SelectItem key={scanner} value={scanner}>
                              {scanner}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </div>
            {scannerStatus !== 'connected' && (
              <DialogFooter>
                <Button variant="outline" onClick={() => setScannerDialogOpen(false)}>
                  Annuler
                </Button>
                <Button 
                  onClick={handleConnectScanner} 
                  className="bg-black hover:bg-neutral-800"
                  disabled={!selectedScanner}
                >
                  Connecter
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      );
    }

    // WhatsApp integration
    if (integration.id === 'whatsapp') {
      return (
        <Dialog open={whatsappDialogOpen} onOpenChange={setWhatsappDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 text-sm text-[var(--medicai-green-dark)] border-[var(--medicai-green-light)] hover:bg-[var(--medicai-green-light)]"
            >
              {integration.buttonLabel}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-green-500" />
                Configuration WhatsApp Business
              </DialogTitle>
              <DialogDescription>
                Connectez votre compte WhatsApp Business pour recevoir les documents patients.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {whatsappStatus === 'connected' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                    <Check className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-800">WhatsApp connecté</p>
                      <p className="text-xs text-green-600">{whatsappConfig.phoneNumber}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-[#555]">Réponse automatique</Label>
                      <Switch 
                        checked={whatsappConfig.autoReply}
                        onCheckedChange={(checked) => setWhatsappConfig({...whatsappConfig, autoReply: checked})}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-[#555]">Heures ouvrables uniquement</Label>
                      <Switch 
                        checked={whatsappConfig.businessHoursOnly}
                        onCheckedChange={(checked) => setWhatsappConfig({...whatsappConfig, businessHoursOnly: checked})}
                      />
                    </div>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    className="w-full h-10 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={handleDisconnectWhatsApp}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Déconnecter WhatsApp
                  </Button>
                </div>
              ) : whatsappStatus === 'verifying' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <MessageCircle className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">Vérification envoyée</p>
                      <p className="text-xs text-blue-600">Entrez le code reçu par SMS</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-sm text-[#555]">Code de vérification (6 chiffres)</Label>
                    <Input
                      type="text"
                      placeholder="123456"
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className="h-12 text-center text-2xl font-mono tracking-widest border-[#E5E5E5]"
                    />
                  </div>
                  
                  <Button 
                    onClick={handleConfirmWhatsAppVerification}
                    className="w-full h-10 bg-green-600 hover:bg-green-700"
                    disabled={verificationCode.length !== 6}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Confirmer et connecter
                  </Button>
                  
                  <Button 
                    variant="ghost"
                    className="w-full h-9 text-sm text-[#666]"
                    onClick={() => setWhatsappStatus('not_connected')}
                  >
                    Annuler
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-[#555]">Numéro WhatsApp Business</Label>
                    <Input
                      type="tel"
                      placeholder="+33 6 12 34 56 78"
                      value={whatsappConfig.phoneNumber}
                      onChange={(e) => setWhatsappConfig({...whatsappConfig, phoneNumber: e.target.value})}
                      className="h-10 border-[#E5E5E5]"
                    />
                    <p className="text-xs text-[#999]">Format international avec indicatif pays</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-sm text-[#555]">Clé API WhatsApp Business</Label>
                    <Input
                      type="password"
                      placeholder="Votre clé API WhatsApp"
                      value={whatsappConfig.apiKey}
                      onChange={(e) => setWhatsappConfig({...whatsappConfig, apiKey: e.target.value})}
                      className="h-10 border-[#E5E5E5]"
                    />
                    <a href="https://business.whatsapp.com/products/business-platform" target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--medicai-green-dark)] hover:underline flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" />
                      Obtenir une clé API WhatsApp Business
                    </a>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-sm text-[#555]">URL Webhook</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={whatsappConfig.webhookUrl}
                        readOnly
                        className="h-10 font-mono text-xs border-[#E5E5E5] bg-gray-50"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-10 w-10 border-[#E5E5E5]"
                        onClick={() => {
                          navigator.clipboard.writeText(whatsappConfig.webhookUrl);
                          toast.success('URL copiée');
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-[#999]">Configurez cette URL dans votre console WhatsApp Business</p>
                  </div>
                  
                  <Button 
                    onClick={handleVerifyWhatsApp}
                    className="w-full h-10 bg-green-600 hover:bg-green-700"
                    disabled={!whatsappConfig.phoneNumber || !whatsappConfig.apiKey}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Vérifier et connecter
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      );
    }

    // Default for other integrations
    return (
      <Button 
        variant="outline" 
        size="sm" 
        className={`h-9 text-sm ${
          integration.status === 'coming_soon' 
            ? 'text-[#999] border-[#E5E5E5] cursor-not-allowed' 
            : 'text-[var(--medicai-green-dark)] border-[var(--medicai-green-light)] hover:bg-[var(--medicai-green-light)]'
        }`}
        disabled={integration.status === 'coming_soon'}
      >
        {integration.buttonLabel}
      </Button>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#111]">Intégrations</h1>
        <p className="text-sm text-[#666] mt-0.5">
          Connectez MedicAI à vos outils et services préférés.
        </p>
      </div>

      {/* Integration Cards Grid - Fernand style */}
      <div className="grid grid-cols-2 gap-3">
        {integrations.map((integration) => (
          <div 
            key={integration.id}
            className="bg-white rounded-lg border border-[#E5E5E5] p-4 hover:border-[var(--medicai-green-light)] transition-colors"
          >
            <h3 className="text-sm font-semibold text-[#111] mb-1">{integration.name}</h3>
            <p className="text-xs text-[#666] mb-3">{integration.description}</p>
            {renderIntegrationButton(integration)}
          </div>
        ))}
      </div>
    </div>
  );
}
