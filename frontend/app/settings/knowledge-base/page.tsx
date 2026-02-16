'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { 
  Search, Plus, FileText, ChevronRight, Edit, Trash2, 
  ArrowLeft, Clock, User, Link2, Upload, Loader2, ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { 
  knowledgeBaseApi, 
  type Article, 
  type Collection,
  type ArticleCreate,
} from '@/lib/api/knowledge-base';

export default function KnowledgeBasePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Dialog states
  const [newCollectionDialogOpen, setNewCollectionDialogOpen] = useState(false);
  const [newArticleDialogOpen, setNewArticleDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState<'manual' | 'url' | 'file'>('manual');
  const [isImporting, setIsImporting] = useState(false);
  
  // Form states
  const [newCollection, setNewCollection] = useState({ name: '', description: '' });
  const [newArticle, setNewArticle] = useState<Partial<ArticleCreate>>({
    title: '',
    content: '',
    collection_id: '',
    assessment_template: '',
  });
  const [importUrl, setImportUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load data from backend
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [collectionsData, articlesData] = await Promise.all([
        knowledgeBaseApi.getCollections(),
        knowledgeBaseApi.getArticles(),
      ]);
      setCollections(collectionsData);
      setArticles(articlesData);
    } catch (error) {
      console.error('Failed to load knowledge base:', error);
      toast.error('Erreur de chargement de la base de connaissances');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter articles by search or collection
  const filteredArticles = articles.filter(article => {
    const matchesSearch = searchQuery 
      ? article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.content.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    const matchesCollection = selectedCollection 
      ? article.collection_id === selectedCollection.id 
      : true;
    return matchesSearch && matchesCollection;
  });

  const handleCreateCollection = async () => {
    if (!newCollection.name) {
      toast.error('Veuillez entrer un nom de collection');
      return;
    }
    try {
      const created = await knowledgeBaseApi.createCollection(newCollection);
      setCollections([...collections, created]);
      setNewCollectionDialogOpen(false);
      setNewCollection({ name: '', description: '' });
      toast.success('Collection créée');
    } catch (error) {
      toast.error('Erreur lors de la création');
    }
  };

  const handleCreateArticle = async () => {
    if (!newArticle.title || !newArticle.collection_id) {
      toast.error('Veuillez remplir les champs requis');
      return;
    }
    try {
      const created = await knowledgeBaseApi.createArticle(newArticle as ArticleCreate);
      setArticles([...articles, created]);
      // Reload to update counts
      const updatedCollections = await knowledgeBaseApi.getCollections();
      setCollections(updatedCollections);
      setNewArticleDialogOpen(false);
      resetArticleForm();
      toast.success('Article créé');
    } catch (error) {
      toast.error('Erreur lors de la création');
    }
  };

  const handleImportFromUrl = async () => {
    if (!importUrl || !newArticle.collection_id) {
      toast.error('Veuillez remplir l\'URL et sélectionner une collection');
      return;
    }
    try {
      setIsImporting(true);
      const created = await knowledgeBaseApi.createArticleFromUrl(importUrl, newArticle.collection_id);
      setArticles([...articles, created]);
      const updatedCollections = await knowledgeBaseApi.getCollections();
      setCollections(updatedCollections);
      setNewArticleDialogOpen(false);
      resetArticleForm();
      toast.success('Article importé et analysé avec succès');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'import');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !newArticle.collection_id) {
      toast.error('Veuillez sélectionner un fichier et une collection');
      return;
    }
    try {
      setIsImporting(true);
      const created = await knowledgeBaseApi.createArticleFromDocument(file, newArticle.collection_id);
      setArticles([...articles, created]);
      const updatedCollections = await knowledgeBaseApi.getCollections();
      setCollections(updatedCollections);
      setNewArticleDialogOpen(false);
      resetArticleForm();
      toast.success('Document analysé et article créé');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'import');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteArticle = async (articleId: string) => {
    const article = articles.find(a => a.id === articleId);
    if (article?.is_default) {
      toast.error('Impossible de supprimer un article par défaut');
      return;
    }
    try {
      await knowledgeBaseApi.deleteArticle(articleId);
      setArticles(articles.filter(a => a.id !== articleId));
      if (selectedArticle?.id === articleId) {
        setSelectedArticle(null);
      }
      toast.success('Article supprimé');
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const resetArticleForm = () => {
    setNewArticle({ title: '', content: '', collection_id: selectedCollection?.id || '', assessment_template: '' });
    setImportUrl('');
    setImportMode('manual');
  };

  const openNewArticleDialog = () => {
    setNewArticle({ 
      ...newArticle, 
      collection_id: selectedCollection?.id || '' 
    });
    setNewArticleDialogOpen(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#999]" />
      </div>
    );
  }

  // Render content based on current view
  const renderContent = () => {
    // Article detail view
    if (selectedArticle) {
      return (
        <div className="space-y-4">
          <Button 
            variant="ghost" 
            className="-ml-2 text-[#666] hover:text-[#333]"
            onClick={() => setSelectedArticle(null)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {selectedArticle.is_default && (
                  <Badge className="bg-[#F5F5F5] text-[#666] border-0 text-[10px]">
                    MedicAI
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] text-[#999] border-[#E5E5E5]">
                  {collections.find(c => c.id === selectedArticle.collection_id)?.name}
                </Badge>
              </div>
              <h1 className="text-xl font-semibold text-[#111]">{selectedArticle.title}</h1>
              <p className="text-xs text-[#666] mt-1">{selectedArticle.content}</p>
              {selectedArticle.source_url && (
                <a 
                  href={selectedArticle.source_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--medicai-green)] hover:underline flex items-center gap-1 mt-1"
                >
                  <ExternalLink className="h-3 w-3" />
                Source
              </a>
            )}
          </div>
          {!selectedArticle.is_default && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => handleDeleteArticle(selectedArticle.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Symptoms & Red Flags */}
        <div className="grid grid-cols-2 gap-3">
          {selectedArticle.symptoms_prompts && selectedArticle.symptoms_prompts.length > 0 && (
            <div className="rounded-lg border border-[#E5E5E5] p-3">
              <h3 className="text-xs font-medium text-[#111] mb-2">Symptômes à explorer</h3>
              <div className="space-y-1">
                {selectedArticle.symptoms_prompts.map((s, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium text-[#333]">{s.name}</span>
                    <span className="text-[#999] ml-1">— {s.details}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedArticle.red_flags && selectedArticle.red_flags.length > 0 && (
            <div className="rounded-lg border border-red-100 bg-red-50/30 p-3">
              <h3 className="text-xs font-medium text-red-700 mb-2">Drapeaux rouges</h3>
              <div className="space-y-1">
                {selectedArticle.red_flags.map((rf, i) => (
                  <div key={i} className="text-xs text-red-600 flex items-start gap-1">
                    <span className="text-red-400">•</span>
                    {rf.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Assessment */}
        {selectedArticle.assessment_template && (
          <div className="rounded-lg border border-[#E5E5E5] p-3">
            <h3 className="text-xs font-medium text-[#111] mb-2">Évaluation</h3>
            <p className="text-xs text-[#555]">{selectedArticle.assessment_template}</p>
          </div>
        )}

        {/* Plan */}
        {selectedArticle.plan_template && (
          <div className="rounded-lg border border-[#E5E5E5] p-3">
            <h3 className="text-xs font-medium text-[#111] mb-2">Plan</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {selectedArticle.plan_template.today?.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-[#999] uppercase">Aujourd'hui</span>
                  <ul className="mt-1 space-y-0.5">
                    {selectedArticle.plan_template.today.map((item, i) => (
                      <li key={i} className="text-[#555]">• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedArticle.plan_template.orders?.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-[#999] uppercase">Examens</span>
                  <ul className="mt-1 space-y-0.5">
                    {selectedArticle.plan_template.orders.map((item, i) => (
                      <li key={i} className="text-[#555]">• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedArticle.plan_template.safety_net?.length > 0 && (
                <div className="col-span-2">
                  <span className="text-[10px] font-medium text-red-400 uppercase">Consignes</span>
                  <ul className="mt-1 space-y-0.5">
                    {selectedArticle.plan_template.safety_net.map((item, i) => (
                      <li key={i} className="text-red-600">• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Suggested Orders */}
        {selectedArticle.suggested_orders && selectedArticle.suggested_orders.length > 0 && (
          <div className="rounded-lg border border-[#E5E5E5] p-3">
            <h3 className="text-xs font-medium text-[#111] mb-2">Examens suggérés</h3>
            <div className="flex flex-wrap gap-1">
              {selectedArticle.suggested_orders.map((order, i) => (
                <span 
                  key={i} 
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded',
                    order.urgency === 'stat' 
                      ? 'bg-red-50 text-red-600' 
                      : 'bg-[#F5F5F5] text-[#666]'
                  )}
                >
                  {order.code} — {order.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="text-[10px] text-[#999] flex items-center gap-3 pt-3 border-t border-[#E5E5E5]">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {selectedArticle.author}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(selectedArticle.updated_at).toLocaleDateString('fr-FR')}
          </span>
        </div>
      </div>
      );
    }

    // Collection view
    if (selectedCollection) {
      const collectionArticles = articles.filter(a => a.collection_id === selectedCollection.id);
      
      return (
        <div className="space-y-4">
          <Button 
            variant="ghost" 
          className="-ml-2 text-[#666] hover:text-[#333]"
          onClick={() => setSelectedCollection(null)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#111]">{selectedCollection.name}</h1>
            <p className="text-xs text-[#666]">{selectedCollection.description}</p>
          </div>
          <Button 
            size="sm"
            className="h-8 bg-[#111] hover:bg-[#333] text-xs"
            onClick={() => {
              setNewArticle({ title: '', content: '', collection_id: selectedCollection.id, assessment_template: '' });
              setImportUrl('');
              setImportMode('manual');
              setNewArticleDialogOpen(true);
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Ajouter
          </Button>
        </div>

        <div className="rounded-lg border border-[#E5E5E5] overflow-hidden">
          {collectionArticles.length === 0 ? (
            <div className="p-4 text-center text-xs text-[#999]">
              Aucun article dans cette collection
            </div>
          ) : (
            collectionArticles.map((article, index) => (
              <div 
                key={article.id}
                className={cn(
                  'flex items-center gap-3 p-3 cursor-pointer hover:bg-[#FAFAFA] transition-colors',
                  index !== collectionArticles.length - 1 && 'border-b border-[#E5E5E5]'
                )}
                onClick={() => setSelectedArticle(article)}
              >
                <FileText className="h-4 w-4 text-[#999] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#111]">{article.title}</span>
                    {article.is_default && (
                      <Badge className="bg-[#F5F5F5] text-[#999] border-0 text-[10px]">
                        MedicAI
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-[#666] line-clamp-1">{article.content}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#CCC] flex-shrink-0" />
              </div>
            ))
          )}
        </div>
      </div>
      );
    }

    // Main view - Collections list
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#111]">Base de connaissances</h1>
            <p className="text-xs text-[#666]">
              Documentation clinique pour les suggestions IA
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline"
              size="sm"
              className="h-8 text-xs border-[#E5E5E5]"
              onClick={() => setNewCollectionDialogOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Collection
          </Button>
          <Button 
            size="sm"
            className="h-8 bg-[#111] hover:bg-[#333] text-xs"
            onClick={() => {
              setNewArticle({ title: '', content: '', collection_id: '', assessment_template: '' });
              setImportUrl('');
              setImportMode('manual');
              setNewArticleDialogOpen(true);
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Article
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#999]" />
        <Input
          placeholder="Rechercher..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-sm border-[#E5E5E5]"
        />
      </div>

      {/* Collections Grid */}
      <div className="grid grid-cols-3 gap-2">
        {collections.map(collection => (
          <div 
            key={collection.id}
            className="rounded-lg border border-[#E5E5E5] p-3 cursor-pointer hover:border-[#CCC] transition-colors"
            onClick={() => setSelectedCollection(collection)}
          >
            <h3 className="text-sm font-medium text-[#111]">{collection.name}</h3>
            <p className="text-[10px] text-[#999] mt-0.5">
              {collection.article_count} article{collection.article_count !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </div>

      {/* Search results */}
      {searchQuery && (
        <div>
          <div className="text-[10px] font-medium text-[#999] uppercase mb-2">
            Résultats ({filteredArticles.length})
          </div>
          <div className="rounded-lg border border-[#E5E5E5] overflow-hidden">
            {filteredArticles.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#999]">
                Aucun résultat
              </div>
            ) : (
              filteredArticles.map((article, index) => (
                <div 
                  key={article.id}
                  className={cn(
                    'flex items-center gap-3 p-3 cursor-pointer hover:bg-[#FAFAFA] transition-colors',
                    index !== filteredArticles.length - 1 && 'border-b border-[#E5E5E5]'
                  )}
                  onClick={() => setSelectedArticle(article)}
                >
                  <FileText className="h-4 w-4 text-[#999] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#111]">{article.title}</span>
                      <Badge variant="outline" className="text-[10px] h-4 text-[#999]">
                        {collections.find(c => c.id === article.collection_id)?.name}
                      </Badge>
                    </div>
                    <p className="text-xs text-[#666] line-clamp-1">{article.content}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#CCC] flex-shrink-0" />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
    );
  };

  // Main return - always renders dialogs
  return (
    <>
      {renderContent()}

      {/* New Collection Dialog */}
      <Dialog open={newCollectionDialogOpen} onOpenChange={setNewCollectionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle collection</DialogTitle>
            <DialogDescription>
              Organisez vos articles cliniques par catégorie.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nom</Label>
              <Input
                value={newCollection.name}
                onChange={(e) => setNewCollection({ ...newCollection, name: e.target.value })}
                placeholder="Ex: Cardiologie"
                className="h-9 text-sm border-[#E5E5E5]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={newCollection.description}
                onChange={(e) => setNewCollection({ ...newCollection, description: e.target.value })}
                placeholder="Description courte..."
                className="h-9 text-sm border-[#E5E5E5]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewCollectionDialogOpen(false)}>
              Annuler
            </Button>
            <Button size="sm" className="bg-[#111] hover:bg-[#333]" onClick={handleCreateCollection}>
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Article Dialog */}
      <Dialog open={newArticleDialogOpen} onOpenChange={(open) => {
        setNewArticleDialogOpen(open);
        if (!open) resetArticleForm();
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvel article</DialogTitle>
            <DialogDescription>
              Ajoutez un article manuellement ou importez depuis une URL/document.
            </DialogDescription>
          </DialogHeader>
          
          {/* Import mode tabs */}
          <div className="flex gap-1 p-0.5 bg-[#F5F5F5] rounded-md">
            <button
              onClick={() => setImportMode('manual')}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                importMode === 'manual' ? 'bg-white text-[#111] shadow-sm' : 'text-[#666]'
              )}
            >
              Manuel
            </button>
            <button
              onClick={() => setImportMode('url')}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1',
                importMode === 'url' ? 'bg-white text-[#111] shadow-sm' : 'text-[#666]'
              )}
            >
              <Link2 className="h-3 w-3" />
              URL
            </button>
            <button
              onClick={() => setImportMode('file')}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1',
                importMode === 'file' ? 'bg-white text-[#111] shadow-sm' : 'text-[#666]'
              )}
            >
              <Upload className="h-3 w-3" />
              Document
            </button>
          </div>

          <div className="space-y-1">
            {/* Collection selector - always visible */}
            <div className="space-y-0">
              <Label className="text-xs">Collection *</Label>
              <Select 
                value={newArticle.collection_id} 
                onValueChange={(value) => setNewArticle({ ...newArticle, collection_id: value })}
              >
                <SelectTrigger className="h-8 text-xs border-[#E5E5E5]">
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {collections.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {importMode === 'manual' && (
              <>
                <div className="space-y-0">
                  <Label className="text-xs">Titre *</Label>
                  <Input
                    value={newArticle.title}
                    onChange={(e) => setNewArticle({ ...newArticle, title: e.target.value })}
                    placeholder="Ex: Syndrome coronarien aigu"
                    className="h-8 text-xs border-[#E5E5E5]"
                  />
                </div>
                <div className="space-y-0">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    value={newArticle.content}
                    onChange={(e) => setNewArticle({ ...newArticle, content: e.target.value })}
                    placeholder="Description courte..."
                    rows={1}
                    className="text-xs border-[#E5E5E5]"
                  />
                </div>
                <div className="space-y-0">
                  <Label className="text-xs">Template d'évaluation</Label>
                  <Textarea
                    value={newArticle.assessment_template}
                    onChange={(e) => setNewArticle({ ...newArticle, assessment_template: e.target.value })}
                    placeholder="Texte suggéré pour l'évaluation clinique..."
                    rows={1}
                    className="text-xs border-[#E5E5E5]"
                  />
                </div>
              </>
            )}

            {importMode === 'url' && (
              <div className="space-y-1">
                <Label className="text-xs">URL de l'article</Label>
                <Input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://..."
                  className="h-9 text-sm border-[#E5E5E5]"
                />
                <p className="text-[10px] text-[#999]">
                  L'IA analysera automatiquement le contenu et extraira les informations cliniques.
                </p>
              </div>
            )}

            {importMode === 'file' && (
              <div className="space-y-1">
                <Label className="text-xs">Document (PDF, TXT, MD)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  onChange={handleImportFromFile}
                  className="block w-full text-xs text-[#666] file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-[#F5F5F5] file:text-[#333] hover:file:bg-[#E5E5E5]"
                  disabled={isImporting || !newArticle.collection_id}
                />
                <p className="text-[10px] text-[#999]">
                  L'IA analysera le document et extraira les informations cliniques.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewArticleDialogOpen(false)}>
              Annuler
            </Button>
            {importMode === 'manual' && (
              <Button size="sm" className="bg-[#111] hover:bg-[#333]" onClick={handleCreateArticle}>
                Créer
              </Button>
            )}
            {importMode === 'url' && (
              <Button 
                size="sm" 
                className="bg-[#111] hover:bg-[#333]" 
                onClick={handleImportFromUrl}
                disabled={isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Analyse...
                  </>
                ) : (
                  'Importer'
                )}
              </Button>
            )}
            {importMode === 'file' && isImporting && (
              <Button size="sm" disabled>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Analyse...
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
