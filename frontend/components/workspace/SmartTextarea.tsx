'use client';

import { useState, useRef, useEffect, useCallback, KeyboardEvent, ChangeEvent } from 'react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sparkles,
  Pill,
  TestTube,
  Stethoscope,
  FileText,
  Loader2,
  CheckCircle2,
  X,
} from 'lucide-react';
import { notesApi, SuggestionItem } from '@/lib/api';

type SuggestionType = 'icd10' | 'medication' | 'lab' | 'order';

interface SmartTextareaProps {
  value: string;
  onChange: (value: string) => void;
  patientId?: string;
  consultationId?: string;
  contextType?: 'hpi' | 'assessment' | 'plan' | 'general';
  section?: 'hpi' | 'assessment' | 'plan' | 'general';
  placeholder?: string;
  className?: string;
  rows?: number;
  disabled?: boolean;
  aiEnabled?: boolean;
  onAiToggle?: (enabled: boolean) => void;
  autoFocus?: boolean;
}

/**
 * Smart Textarea with:
 * 1. Inline ghost text suggestions (Tab to accept)
 * 2. Trigger-based dropdown for structured items (dx:, rx:, lab:)
 */
export function SmartTextarea({
  value,
  onChange,
  patientId,
  consultationId,
  contextType,
  section = 'general',
  placeholder = 'Commencer à taper...',
  className,
  rows = 4,
  disabled = false,
  aiEnabled: externalAiEnabled,
  onAiToggle,
  autoFocus = false,
}: SmartTextareaProps) {
  // Use contextType if provided, otherwise fall back to section
  const effectiveSection = contextType || section;
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [internalAiEnabled, setInternalAiEnabled] = useState(true);
  const aiEnabled = externalAiEnabled ?? internalAiEnabled;
  
  // Ghost text suggestion
  const [ghostText, setGhostText] = useState('');
  const [isLoadingGhost, setIsLoadingGhost] = useState(false);
  const [showAccepted, setShowAccepted] = useState(false);
  
  // Dropdown suggestions
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownType, setDropdownType] = useState<SuggestionType>('icd10');
  const [dropdownTrigger, setDropdownTrigger] = useState('');
  const [triggerPosition, setTriggerPosition] = useState(0);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [isLoadingDropdown, setIsLoadingDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Debounce refs
  const ghostTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Trigger patterns
  const triggerPatterns: Record<string, SuggestionType> = {
    'dx:': 'icd10',
    'icd:': 'icd10',
    'rx:': 'medication',
    'med:': 'medication',
    'lab:': 'lab',
    'order:': 'order',
  };

  // Get icon for type
  const getTypeIcon = (type: SuggestionType) => {
    switch (type) {
      case 'icd10': return <Stethoscope className="h-4 w-4 text-foreground" />;
      case 'medication': return <Pill className="h-4 w-4 text-foreground" />;
      case 'lab': return <TestTube className="h-4 w-4 text-muted-foreground" />;
      case 'order': return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Fetch ghost text suggestion
  const fetchGhostText = useCallback(async (text: string) => {
    if (!aiEnabled || !text || text.length < 5) {
      setGhostText('');
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoadingGhost(true);
    try {
      const response = await notesApi.autocomplete({
        patient_id: patientId || '',
        consultation_id: consultationId || '',
        text: text.slice(-1500), // Last 1500 chars
        cursor_offset: text.length,
        section: effectiveSection,
      });

      if (response.completion) {
        setGhostText(response.completion);
      } else {
        setGhostText('');
      }
    } catch (error) {
      // Ignore aborted requests
      if ((error as Error).name !== 'AbortError') {
        console.error('Ghost text error:', error);
      }
      setGhostText('');
    } finally {
      setIsLoadingGhost(false);
    }
  }, [aiEnabled, patientId, consultationId, effectiveSection]);

  // Load dropdown suggestions
  const loadSuggestions = useCallback(async (type: SuggestionType, query: string) => {
    setIsLoadingDropdown(true);
    try {
      const items = await notesApi.getSuggestions({
        type,
        query,
        patient_id: patientId || '',
        consultation_id: consultationId || '',
        limit: 15,
      });
      setSuggestions(items);
    } catch (error) {
      console.error('Suggestions error:', error);
      setSuggestions([]);
    } finally {
      setIsLoadingDropdown(false);
    }
  }, [patientId, consultationId]);

  // Handle text change
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    onChange(newValue);
    setGhostText(''); // Clear ghost on typing

    // Check for trigger patterns
    const textBeforeCursor = newValue.slice(0, cursorPos).toLowerCase();
    let foundTrigger = false;
    
    for (const [trigger, type] of Object.entries(triggerPatterns)) {
      if (textBeforeCursor.endsWith(trigger)) {
        setDropdownType(type);
        setDropdownTrigger(trigger);
        setTriggerPosition(cursorPos - trigger.length);
        setDropdownOpen(true);
        setSearchQuery('');
        loadSuggestions(type, '');
        foundTrigger = true;
        break;
      }
    }

    // Debounce ghost text fetch (only if no trigger found)
    if (!foundTrigger && aiEnabled) {
      if (ghostTimerRef.current) {
        clearTimeout(ghostTimerRef.current);
      }
      ghostTimerRef.current = setTimeout(() => {
        fetchGhostText(newValue);
      }, 300);
    }
  };

  // Handle key down
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab to accept ghost text
    if (e.key === 'Tab' && ghostText && !dropdownOpen) {
      e.preventDefault();
      onChange(value + ghostText);
      setGhostText('');
      setShowAccepted(true);
      setTimeout(() => setShowAccepted(false), 1500);
    }

    // Escape to clear ghost or close dropdown
    if (e.key === 'Escape') {
      if (dropdownOpen) {
        setDropdownOpen(false);
      } else {
        setGhostText('');
      }
    }
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (item: SuggestionItem) => {
    // Replace trigger with selected item
    const beforeTrigger = value.slice(0, triggerPosition);
    const afterCursor = value.slice(triggerPosition + dropdownTrigger.length + searchQuery.length);
    
    let insertText = item.display_text;
    if (item.code) {
      insertText = `${item.display_text} (${item.code})`;
    }
    
    const newValue = beforeTrigger + insertText + ' ' + afterCursor;
    onChange(newValue);
    setDropdownOpen(false);
    setShowAccepted(true);
    setTimeout(() => setShowAccepted(false), 1500);
    
    // Focus back on textarea
    textareaRef.current?.focus();
  };

  // Handle dropdown search
  const handleDropdownSearch = (query: string) => {
    setSearchQuery(query);
    loadSuggestions(dropdownType, query);
  };

  // Toggle AI
  const handleAiToggle = () => {
    const newValue = !aiEnabled;
    if (onAiToggle) {
      onAiToggle(newValue);
    } else {
      setInternalAiEnabled(newValue);
    }
    if (!newValue) {
      setGhostText('');
    }
  };

  return (
    <div className="relative">
      {/* AI toggle and status bar */}
      <div className="flex items-center justify-between mb-1 px-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAiToggle}
            className={cn(
              'flex items-center gap-1 text-xs rounded px-1.5 py-0.5 transition-colors',
              aiEnabled 
                ? 'bg-[var(--medicai-green)] text-foreground hover:bg-[var(--medicai-green-dark)]' 
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            <Sparkles className="h-3 w-3" />
            AI {aiEnabled ? 'ON' : 'OFF'}
          </button>
          
          {isLoadingGhost && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
            </span>
          )}
          
          {showAccepted && (
            <span className="flex items-center gap-1 text-xs text-[var(--medicai-green-dark)]">
              <CheckCircle2 className="h-3 w-3" />
              Accepted
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">
            <kbd className="px-1 py-0.5 bg-muted rounded">dx:</kbd> diagnostics
          </span>
          <span className="text-[10px] text-muted-foreground">
            <kbd className="px-1 py-0.5 bg-muted rounded">rx:</kbd> médic
          </span>
          <span className="text-[10px] text-muted-foreground">
            <kbd className="px-1 py-0.5 bg-muted rounded">lab:</kbd> bilans
          </span>
        </div>
      </div>

      {/* Textarea with ghost text overlay */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn('pr-8', className)}
        />
        
        {/* Ghost text overlay */}
        {ghostText && (
          <div 
            className="absolute pointer-events-none inset-0 p-3 text-sm whitespace-pre-wrap overflow-hidden"
            style={{ 
              color: 'transparent',
              caretColor: 'transparent',
            }}
          >
            <span style={{ visibility: 'hidden' }}>{value}</span>
            <span className="text-gray-400">{ghostText}</span>
          </div>
        )}
        
        {/* Tab hint */}
        {ghostText && (
          <div className="absolute right-2 bottom-2">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
              Tab ↹
            </Badge>
          </div>
        )}
      </div>

      {/* Dropdown suggestions popover */}
      {dropdownOpen && (
        <div className="absolute z-50 mt-1 w-full max-w-md rounded-md border bg-popover shadow-lg">
          <Command shouldFilter={false}>
            <div className="flex items-center border-b px-3 py-2">
              {getTypeIcon(dropdownType)}
              <input
                type="text"
                placeholder={`Rechercher ${dropdownType === 'icd10' ? 'diagnostic' : dropdownType === 'medication' ? 'médicament' : dropdownType === 'lab' ? 'bilan' : 'ordre'}...`}
                value={searchQuery}
                onChange={(e) => handleDropdownSearch(e.target.value)}
                className="flex-1 ml-2 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setDropdownOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[200px] overflow-y-auto p-1">
              {isLoadingDropdown ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : suggestions.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  Aucun résultat
                </div>
              ) : (
                suggestions.map((item, index) => (
                  <button
                    key={item.code || index}
                    type="button"
                    onClick={() => handleSelectSuggestion(item)}
                    className="flex items-start gap-2 w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent cursor-pointer"
                  >
                    {getTypeIcon(item.type as SuggestionType)}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.display_text}</div>
                      {item.code && (
                        <div className="text-xs text-muted-foreground">{item.code}</div>
                      )}
                      {item.details && (
                        <div className="text-xs text-muted-foreground truncate">{item.details}</div>
                      )}
                    </div>
                    {item.source === 'patient_history' && (
                      <Badge variant="secondary" className="text-[10px] ml-auto shrink-0">
                        Patient
                      </Badge>
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="border-t px-2 py-1.5 text-[10px] text-muted-foreground">
              <kbd className="px-1 py-0.5 bg-muted rounded">↵</kbd> sélectionner • <kbd className="px-1 py-0.5 bg-muted rounded">Esc</kbd> fermer
            </div>
          </Command>
        </div>
      )}
    </div>
  );
}
