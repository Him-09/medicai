'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  HelpCircle, 
  MessageCircle, 
  Book, 
  FileText, 
  Mail,
  ExternalLink,
  ChevronRight,
  Search,
  Stethoscope,
  Upload,
  Mic,
  FileCheck,
  Settings,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const helpCategories = [
  {
    id: 'getting-started',
    title: 'Premiers pas',
    icon: Book,
    description: 'Découvrez les bases de MedicAI',
    articles: [
      { title: 'Créer un patient', href: '#create-patient' },
      { title: 'Lancer une consultation', href: '#start-consultation' },
      { title: 'Importer des documents', href: '#import-documents' },
    ],
  },
  {
    id: 'consultations',
    title: 'Consultations',
    icon: Stethoscope,
    description: 'Gérer vos consultations efficacement',
    articles: [
      { title: 'Utiliser l\'assistant IA', href: '#ai-assistant' },
      { title: 'Générer un workspace', href: '#workspace' },
      { title: 'Créer des ordonnances', href: '#prescriptions' },
    ],
  },
  {
    id: 'documents',
    title: 'Documents',
    icon: Upload,
    description: 'Importer et analyser des documents',
    articles: [
      { title: 'Types de documents supportés', href: '#document-types' },
      { title: 'Extraction automatique', href: '#extraction' },
      { title: 'Réviser les documents', href: '#review' },
    ],
  },
  {
    id: 'voice',
    title: 'Mode Vocal',
    icon: Mic,
    description: 'Utiliser les fonctionnalités vocales',
    articles: [
      { title: 'Assistant vocal', href: '#voice-assistant' },
      { title: 'Mode scribe', href: '#scribe-mode' },
      { title: 'Langues supportées', href: '#languages' },
    ],
  },
  {
    id: 'settings',
    title: 'Paramètres',
    icon: Settings,
    description: 'Configurer votre compte',
    articles: [
      { title: 'Profil du cabinet', href: '#clinic-profile' },
      { title: 'Modèles personnalisés', href: '#templates' },
      { title: 'Intégrations', href: '#integrations' },
    ],
  },
  {
    id: 'security',
    title: 'Sécurité',
    icon: Shield,
    description: 'Protéger vos données',
    articles: [
      { title: 'Authentification', href: '#authentication' },
      { title: 'Confidentialité HIPAA', href: '#hipaa' },
      { title: 'Export des données', href: '#data-export' },
    ],
  },
];

const faqs = [
  {
    question: 'Comment importer des documents patients ?',
    answer: 'Accédez à la fiche patient, puis cliquez sur "Importer un document". Vous pouvez glisser-déposer des fichiers PDF, images (JPEG, PNG) ou les sélectionner depuis votre ordinateur. MedicAI analysera automatiquement le contenu et extraira les données pertinentes.',
  },
  {
    question: 'Quels types de documents sont supportés ?',
    answer: 'MedicAI supporte les analyses de laboratoire, comptes-rendus de radiologie, ordonnances et notes cliniques. Les formats acceptés sont PDF, JPEG, PNG et TIFF. Les documents en français sont optimisés pour l\'extraction.',
  },
  {
    question: 'Comment fonctionne l\'assistant IA ?',
    answer: 'L\'assistant IA analyse les documents du patient et peut répondre à vos questions cliniques. Il a accès aux résultats de laboratoire, imagerie, et historique médical. Posez simplement votre question dans le chat de la consultation.',
  },
  {
    question: 'Mes données sont-elles sécurisées ?',
    answer: 'Oui, MedicAI utilise le chiffrement de bout en bout, l\'authentification JWT sécurisée, et respecte les normes HIPAA. Toutes les actions sont journalisées dans un audit trail. Vos données restent sur des serveurs sécurisés.',
  },
  {
    question: 'Comment utiliser le mode scribe ?',
    answer: 'Le mode scribe transcrit automatiquement vos consultations. Activez-le depuis la page de consultation, parlez normalement avec votre patient, et MedicAI générera un résumé structuré à la fin.',
  },
  {
    question: 'Puis-je personnaliser les modèles d\'ordonnance ?',
    answer: 'Oui, accédez à Paramètres > Modèles pour créer et gérer vos modèles d\'ordonnances, certificats et autres documents. Vous pouvez utiliser des variables comme [PATIENT_NAME] qui seront remplacées automatiquement.',
  },
];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-[var(--medicai-green-light)] mb-4">
            <HelpCircle className="h-7 w-7 text-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-[#111]">Centre d'aide</h1>
          <p className="text-sm text-[#666] mt-1">
            Trouvez des réponses à vos questions sur MedicAI
          </p>
        </div>

          {/* Search */}
          <div className="relative mb-8">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#999]" />
            <Input
              placeholder="Rechercher dans l'aide..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-white border-[#E5E5E5]"
            />
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {helpCategories.slice(0, 3).map((category) => (
              <div
                key={category.id}
                className="bg-white rounded-lg border border-[#E5E5E5] p-4 hover:border-[var(--medicai-green)] transition-colors cursor-pointer"
              >
                <category.icon className="h-5 w-5 text-foreground mb-2" />
                <h3 className="font-medium text-sm text-[#111]">{category.title}</h3>
                <p className="text-xs text-[#666] mt-0.5">{category.description}</p>
              </div>
            ))}
          </div>

          {/* FAQ Section */}
          <div className="bg-white rounded-lg border border-[#E5E5E5] p-6 mb-8">
            <h2 className="text-lg font-semibold text-[#111] mb-4">Questions fréquentes</h2>
            
            <Accordion type="single" collapsible className="space-y-2">
              {filteredFaqs.map((faq, index) => (
                <AccordionItem 
                  key={index} 
                  value={`faq-${index}`}
                  className="border border-[#E5E5E5] rounded-lg px-4"
                >
                  <AccordionTrigger className="text-sm font-medium text-[#111] hover:no-underline py-3">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-[#666] pb-4">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {filteredFaqs.length === 0 && (
              <p className="text-sm text-[#666] text-center py-8">
                Aucun résultat trouvé pour "{searchQuery}"
              </p>
            )}
          </div>

          {/* All Categories */}
          <div className="bg-white rounded-lg border border-[#E5E5E5] p-6 mb-8">
            <h2 className="text-lg font-semibold text-[#111] mb-4">Toutes les catégories</h2>
            
            <div className="grid grid-cols-2 gap-4">
              {helpCategories.map((category) => (
                <div key={category.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <category.icon className="h-4 w-4 text-foreground" />
                    <h3 className="font-medium text-sm text-[#111]">{category.title}</h3>
                  </div>
                  <ul className="space-y-1 ml-6">
                    {category.articles.map((article, index) => (
                      <li key={index}>
                        <a
                          href={article.href}
                          className="text-xs text-[#666] hover:text-[var(--medicai-green-dark)] transition-colors flex items-center gap-1"
                        >
                          <ChevronRight className="h-3 w-3" />
                          {article.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Contact Support */}
          <div className="bg-[var(--medicai-green-light)] rounded-lg border border-[var(--medicai-green)] p-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-[var(--medicai-green)] flex items-center justify-center flex-shrink-0">
                <MessageCircle className="h-5 w-5 text-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-[#111]">Besoin d'aide supplémentaire ?</h3>
                <p className="text-sm text-[#666] mt-1">
                  Notre équipe de support est disponible pour répondre à vos questions.
                </p>
                <div className="flex items-center gap-3 mt-4">
                  <Button 
                    className="h-9 bg-black hover:bg-neutral-800"
                    onClick={() => window.open('mailto:support@medicai.ma', '_blank')}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Contacter le support
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-9 border-[#E5E5E5]"
                    onClick={() => window.open('https://docs.medicai.ma', '_blank')}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Documentation
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Back to Settings */}
          <div className="mt-6 text-center">
            <Link 
              href="/settings"
              className="text-sm text-[#666] hover:text-[var(--medicai-green-dark)] transition-colors"
            >
              ← Retour aux paramètres
            </Link>
          </div>
        </div>
      </div>
  );
}
