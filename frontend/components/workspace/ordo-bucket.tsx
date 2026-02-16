'use client';

import { useState } from 'react';
import {
  Pill,
  FlaskConical,
  ScanLine,
  Stethoscope,
  Plus,
  ChevronDown,
  ChevronUp,
  Sparkles,
  FileOutput,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { OrdoItemCard, OrdoTypeIcon } from './ordo-item-card';
import type { OrdoItem, OrdoItemType, OrdoTemplate } from '@/types/ordo';
import {
  LAB_TEMPLATES,
  IMAGING_TEMPLATES,
  createOrdoMedication,
  createOrdoLab,
  createOrdoImaging,
  createOrdoProcedure,
  createOrdoFromTemplate,
  validateOrdoItem,
  getOrdoTypeLabel,
} from '@/types/ordo';

// =============================================================================
// ORDO BUCKET COMPONENT
// =============================================================================
// This replaces the plain text "Ordo" bucket with structured items

interface OrdoBucketProps {
  items: OrdoItem[];
  onChange: (items: OrdoItem[]) => void;
  onGenerateAndSend: () => void;
  problemTitle?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  patientId?: string;
  consultationId?: string;
}

export function OrdoBucket({
  items,
  onChange,
  onGenerateAndSend,
  problemTitle,
  isCollapsed = false,
  onToggleCollapse,
  patientId,
  consultationId,
}: OrdoBucketProps) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<OrdoItemType | 'all'>('all');

  // Stats
  const medicationCount = items.filter(i => i.type === 'medication').length;
  const labCount = items.filter(i => i.type === 'lab').length;
  const imagingCount = items.filter(i => i.type === 'imaging').length;
  const procedureCount = items.filter(i => i.type === 'procedure').length;
  const incompleteCount = items.filter(i => validateOrdoItem(i).length > 0).length;

  // Filtered items
  const filteredItems = filterType === 'all' 
    ? items 
    : items.filter(i => i.type === filterType);

  // Add new item
  const addItem = (type: OrdoItemType) => {
    let newItem: OrdoItem;
    switch (type) {
      case 'medication':
        newItem = createOrdoMedication({ source_problem_id: problemTitle });
        break;
      case 'lab':
        newItem = createOrdoLab({ source_problem_id: problemTitle });
        break;
      case 'imaging':
        newItem = createOrdoImaging({ source_problem_id: problemTitle });
        break;
      case 'procedure':
        newItem = createOrdoProcedure({ source_problem_id: problemTitle });
        break;
    }
    onChange([...items, newItem]);
    setExpandedItemId(newItem.id);
  };

  // Add from template
  const addFromTemplate = (template: OrdoTemplate) => {
    const newItem = createOrdoFromTemplate(template);
    onChange([...items, newItem]);
    setExpandedItemId(newItem.id);
  };

  // Update item
  const updateItem = (updatedItem: OrdoItem) => {
    onChange(items.map(i => i.id === updatedItem.id ? updatedItem : i));
  };

  // Remove item
  const removeItem = (id: string) => {
    onChange(items.filter(i => i.id !== id));
    if (expandedItemId === id) setExpandedItemId(null);
  };

  return (
    <div className="space-y-2">
      {/* Header with filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onToggleCollapse}
            >
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          )}
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Ordonnances
          </span>
          
          {/* Type filter badges */}
          <div className="flex gap-1">
            <Badge 
              variant={filterType === 'all' ? 'default' : 'outline'}
              className="h-5 text-[10px] px-1.5 cursor-pointer"
              onClick={() => setFilterType('all')}
            >
              Tout ({items.length})
            </Badge>
            {medicationCount > 0 && (
              <Badge 
                variant={filterType === 'medication' ? 'default' : 'outline'}
                className={cn(
                  "h-5 text-[10px] px-1.5 cursor-pointer",
                  filterType !== 'medication' && 'text-foreground border-border'
                )}
                onClick={() => setFilterType('medication')}
              >
                <Pill className="h-2.5 w-2.5 mr-0.5" />
                {medicationCount}
              </Badge>
            )}
            {labCount > 0 && (
              <Badge 
                variant={filterType === 'lab' ? 'default' : 'outline'}
                className={cn(
                  "h-5 text-[10px] px-1.5 cursor-pointer",
                  filterType !== 'lab' && 'text-foreground border-border'
                )}
                onClick={() => setFilterType('lab')}
              >
                <FlaskConical className="h-2.5 w-2.5 mr-0.5" />
                {labCount}
              </Badge>
            )}
            {imagingCount > 0 && (
              <Badge 
                variant={filterType === 'imaging' ? 'default' : 'outline'}
                className={cn(
                  "h-5 text-[10px] px-1.5 cursor-pointer",
                  filterType !== 'imaging' && 'text-foreground border-border'
                )}
                onClick={() => setFilterType('imaging')}
              >
                <ScanLine className="h-2.5 w-2.5 mr-0.5" />
                {imagingCount}
              </Badge>
            )}
            {procedureCount > 0 && (
              <Badge 
                variant={filterType === 'procedure' ? 'default' : 'outline'}
                className={cn(
                  "h-5 text-[10px] px-1.5 cursor-pointer",
                  filterType !== 'procedure' && 'text-green-600 border-green-200'
                )}
                onClick={() => setFilterType('procedure')}
              >
                <Stethoscope className="h-2.5 w-2.5 mr-0.5" />
                {procedureCount}
              </Badge>
            )}
          </div>
        </div>

        {/* Add button with dropdown */}
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={onGenerateAndSend}
            >
              <FileOutput className="h-3 w-3 mr-1" />
              Générer
              {incompleteCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 text-[9px] px-1 bg-muted text-muted-foreground">
                  {incompleteCount} incomplet
                </Badge>
              )}
            </Button>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Ajouter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* Quick add by type */}
              <DropdownMenuItem onClick={() => addItem('medication')}>
                <Pill className="h-4 w-4 mr-2 text-foreground" />
                <span>Médicament</span>
                <span className="ml-auto text-[10px] text-muted-foreground">→ Rx PDF</span>
              </DropdownMenuItem>
              
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FlaskConical className="h-4 w-4 mr-2 text-foreground" />
                  <span>Biologie</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuItem onClick={() => addItem('lab')}>
                    <Plus className="h-3 w-3 mr-2" />
                    Bilan personnalisé
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium">
                    Modèles rapides
                  </div>
                  {LAB_TEMPLATES.map(template => (
                    <DropdownMenuItem 
                      key={template.id}
                      onClick={() => addFromTemplate(template)}
                    >
                      <Sparkles className="h-3 w-3 mr-2 text-muted-foreground" />
                      {template.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ScanLine className="h-4 w-4 mr-2 text-blue-500" />
                  <span>Imagerie</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuItem onClick={() => addItem('imaging')}>
                    <Plus className="h-3 w-3 mr-2" />
                    Examen personnalisé
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium">
                    Modèles rapides
                  </div>
                  {IMAGING_TEMPLATES.map(template => (
                    <DropdownMenuItem 
                      key={template.id}
                      onClick={() => addFromTemplate(template)}
                    >
                      <Sparkles className="h-3 w-3 mr-2 text-muted-foreground" />
                      {template.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuItem onClick={() => addItem('procedure')}>
                <Stethoscope className="h-4 w-4 mr-2 text-foreground" />
                <span>Acte / Procédure</span>
                <span className="ml-auto text-[10px] text-muted-foreground">→ Réf.</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Items list */}
      {!isCollapsed && (
        <div className="space-y-2">
          {filteredItems.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
              <p>Aucune ordonnance</p>
              <p className="text-xs mt-1">Cliquez sur "Ajouter" pour créer une ordonnance</p>
            </div>
          ) : (
            filteredItems.map(item => (
              <OrdoItemCard
                key={item.id}
                item={item}
                onChange={updateItem}
                onRemove={() => removeItem(item.id)}
                isExpanded={expandedItemId === item.id}
                onToggleExpand={() => setExpandedItemId(
                  expandedItemId === item.id ? null : item.id
                )}
                patientId={patientId}
                consultationId={consultationId}
              />
            ))
          )}
        </div>
      )}

      {/* Incomplete warning */}
      {!isCollapsed && incompleteCount > 0 && items.length > 0 && (
        <div className="flex items-start gap-2 p-2 bg-muted rounded-lg text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium">{incompleteCount} élément{incompleteCount > 1 ? 's' : ''} incomplet{incompleteCount > 1 ? 's' : ''}</span>
            <span className="ml-1">— complétez les champs marqués avant de générer</span>
          </div>
        </div>
      )}
    </div>
  );
}
