'use client';

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  Sparkles,
  Pill,
  TestTube,
  Stethoscope,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import { notesApi, SuggestionItem, FieldType, PlanBucket } from '@/lib/api';

type SuggestionType = 'icd10' | 'medication' | 'lab' | 'order';

// ============================================================================
// CLIENT-SIDE LRU CACHE (Layer C)
// ============================================================================

interface CacheEntry {
  completion: string;
  timestamp: number;
}

class LRUCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number = 100, ttlMs: number = 120000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  private makeKey(
    consultationId: string,
    section: string,
    fieldType: string | undefined,
    text: string,
    problems: string[] | undefined
  ): string {
    // Use last 40 chars of text for key (similar to server)
    const textSuffix = text.slice(-40).toLowerCase().trim();
    const problemsHash = problems?.slice(0, 3).sort().join('|') || 'none';
    return `${consultationId}:${section}:${fieldType || 'gen'}:${problemsHash}:${textSuffix}`;
  }

  get(
    consultationId: string,
    section: string,
    fieldType: string | undefined,
    text: string,
    problems: string[] | undefined
  ): string | null {
    const key = this.makeKey(consultationId, section, fieldType, text, problems);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.completion;
  }

  set(
    consultationId: string,
    section: string,
    fieldType: string | undefined,
    text: string,
    problems: string[] | undefined,
    completion: string
  ): void {
    if (!completion) return; // Don't cache empty results
    
    const key = this.makeKey(consultationId, section, fieldType, text, problems);
    
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      completion,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Global client-side cache instance (shared across all SmartInput instances)
const clientCache = new LRUCache(100, 120000); // 100 entries, 2 min TTL

interface SmartInputProps {
  value: string;
  onChange: (value: string) => void;
  patientId?: string;
  consultationId?: string;
  // Context for better suggestions
  section?: 'hpi' | 'assessment' | 'plan' | 'orders' | 'agenda' | 'general';
  fieldType?: FieldType;
  problemId?: string;
  bucket?: PlanBucket;
  activeProblems?: string[];
  visitFocus?: string;
  // UI props
  placeholder?: string;
  className?: string;
  containerClassName?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  multiline?: boolean;
  minHeight?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onBlur?: () => void;
  showTriggerHints?: boolean;
  disableGhostText?: boolean;
  /** Auto-open dropdown on focus with this type (for order forms) */
  autoTriggerType?: SuggestionType;
}

/**
 * Sleek Smart Input with contentEditable
 * - Minimal, borderless design
 * - Inline ghost text (Tab to accept)
 * - Trigger dropdowns (dx:, rx:, lab:, order:)
 * - Micro-triggers (#p1, @meds, @allergies)
 */
export function SmartInput({
  value,
  onChange,
  patientId,
  consultationId,
  section = 'general',
  fieldType,
  problemId,
  bucket,
  activeProblems,
  visitFocus,
  placeholder = 'Type here...',
  className,
  containerClassName,
  disabled = false,
  autoFocus = false,
  multiline = false,
  minHeight = '24px',
  onKeyDown: externalKeyDown,
  onBlur,
  showTriggerHints = false,
  disableGhostText = false,
  autoTriggerType,
}: SmartInputProps) {
  const editableRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  
  // Ghost text
  const [ghostText, setGhostText] = useState('');
  const [isLoadingGhost, setIsLoadingGhost] = useState(false);
  
  // Dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownType, setDropdownType] = useState<SuggestionType>('icd10');
  const [dropdownTrigger, setDropdownTrigger] = useState('');
  const [triggerPosition, setTriggerPosition] = useState(0);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [isLoadingDropdown, setIsLoadingDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Debounce
  const ghostTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Trigger patterns for dropdowns
  const triggerPatterns: Record<string, SuggestionType> = {
    'dx:': 'icd10',
    'icd:': 'icd10',
    'rx:': 'medication',
    'med:': 'medication',
    'lab:': 'lab',
    'order:': 'order',
  };

  // Micro-triggers for quick context insertion
  const microTriggers: Record<string, () => string> = {
    '#p1': () => activeProblems?.[0] || '[Problem 1]',
    '#p2': () => activeProblems?.[1] || '[Problem 2]',
    '#p3': () => activeProblems?.[2] || '[Problem 3]',
    '#focus': () => visitFocus || '[Visit Focus]',
    '#problem': () => activeProblems?.join(', ') || '[No active problems]',
  };

  // Icons
  const getTypeIcon = (type: SuggestionType) => {
    const iconClass = "h-3.5 w-3.5";
    switch (type) {
      case 'icd10': return <Stethoscope className={iconClass} />;
      case 'medication': return <Pill className={iconClass} />;
      case 'lab': return <TestTube className={iconClass} />;
      case 'order': return <FileText className={iconClass} />;
    }
  };

  // Sync contentEditable with value
  useEffect(() => {
    if (editableRef.current && editableRef.current.textContent !== value) {
      editableRef.current.textContent = value;
    }
  }, [value]);

  // Auto focus
  useEffect(() => {
    if (autoFocus && editableRef.current) {
      editableRef.current.focus();
      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editableRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [autoFocus]);

  // Update dropdown position on scroll (for portal)
  useEffect(() => {
    if (!dropdownOpen) return;
    
    const handleScrollOrResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + 4,
          left: rect.left,
          width: Math.min(rect.width, 384)
        });
      }
    };
    
    // Initial position
    handleScrollOrResize();
    
    // Listen to scroll on all parent elements and window
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [dropdownOpen]);

  // Fetch ghost text with full context + client-side caching
  const fetchGhostText = useCallback(async (text: string) => {
    if (!text || text.length < 5) {
      setGhostText('');
      return;
    }

    // =========================================================================
    // CLIENT CACHE CHECK (Layer C - fastest, no network)
    // =========================================================================
    const cachedCompletion = clientCache.get(
      consultationId || '',
      section,
      fieldType,
      text,
      activeProblems
    );
    
    if (cachedCompletion) {
      setGhostText(cachedCompletion);
      return; // Skip network request entirely
    }

    setIsLoadingGhost(true);
    try {
      const response = await notesApi.autocomplete({
        patient_id: patientId || '',
        consultation_id: consultationId || '',
        text: text.slice(-500),
        cursor_offset: text.length,
        section,
        field_type: fieldType,
        problem_id: problemId,
        bucket,
        active_problems: activeProblems,
        visit_focus: visitFocus,
      });
      
      const completion = response.completion || '';
      setGhostText(completion);
      
      // Cache the result client-side
      if (completion) {
        clientCache.set(
          consultationId || '',
          section,
          fieldType,
          text,
          activeProblems,
          completion
        );
      }
    } catch {
      setGhostText('');
    } finally {
      setIsLoadingGhost(false);
    }
  }, [patientId, consultationId, section, fieldType, problemId, bucket, activeProblems, visitFocus]);

  // Load dropdown suggestions with context
  const loadSuggestions = useCallback(async (type: SuggestionType, query: string) => {
    setIsLoadingDropdown(true);
    try {
      const items = await notesApi.getSuggestions({
        type,
        query,
        patient_id: patientId || '',
        consultation_id: consultationId || '',
        limit: 10,
        active_problems: activeProblems,
        current_bucket: bucket,
      });
      setSuggestions(items);
      setSelectedIndex(0);
    } catch {
      setSuggestions([]);
    } finally {
      setIsLoadingDropdown(false);
    }
  }, [patientId, consultationId, activeProblems, bucket]);

  // Helper to update dropdown position
  const updateDropdownPosition = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom,
        left: rect.left,
        width: Math.min(rect.width, 384)
      });
    }
  }, []);

  // Handle input
  const handleInput = () => {
    let text = editableRef.current?.textContent || '';
    
    // Check for micro-triggers (instant replacement)
    for (const [trigger, getValue] of Object.entries(microTriggers)) {
      if (text.includes(trigger)) {
        text = text.replace(trigger, getValue());
        onChange(text);
        if (editableRef.current) {
          editableRef.current.textContent = text;
          // Move cursor to end
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editableRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
        setGhostText('');
        return;
      }
    }
    
    onChange(text);
    setGhostText('');
    
    // Check for triggers
    let foundTrigger = false;
    for (const [pattern, type] of Object.entries(triggerPatterns)) {
      const lastIndex = text.toLowerCase().lastIndexOf(pattern);
      if (lastIndex !== -1) {
        const afterTrigger = text.slice(lastIndex + pattern.length);
        // Only if trigger is recent (within last few chars being typed)
        if (text.length - lastIndex <= pattern.length + 30) {
          foundTrigger = true;
          setDropdownType(type);
          setDropdownTrigger(pattern);
          setTriggerPosition(lastIndex);
          setSearchQuery(afterTrigger);
          setDropdownOpen(true);
          
          // Calculate dropdown position
          updateDropdownPosition();
          
          // Debounce search
          if (dropdownTimerRef.current) clearTimeout(dropdownTimerRef.current);
          dropdownTimerRef.current = setTimeout(() => {
            loadSuggestions(type, afterTrigger);
          }, 150);
          break;
        }
      }
    }
    
    if (!foundTrigger) {
      // If autoTriggerType is set, keep dropdown open and search with current text
      if (autoTriggerType) {
        setDropdownOpen(true);
        updateDropdownPosition();
        
        // Debounce search
        if (dropdownTimerRef.current) clearTimeout(dropdownTimerRef.current);
        dropdownTimerRef.current = setTimeout(() => {
          loadSuggestions(autoTriggerType, text);
        }, 150);
      } else {
        setDropdownOpen(false);
      }
      
      // Debounce ghost text (only if not disabled)
      if (!disableGhostText) {
        if (ghostTimerRef.current) clearTimeout(ghostTimerRef.current);
        ghostTimerRef.current = setTimeout(() => {
          fetchGhostText(text);
        }, 400);
      }
    }
  };

  // Handle key events
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Tab to accept ghost text
    if (e.key === 'Tab' && ghostText && !dropdownOpen) {
      e.preventDefault();
      const newValue = value + ghostText;
      onChange(newValue);
      setGhostText('');
      if (editableRef.current) {
        editableRef.current.textContent = newValue;
        // Move cursor to end
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(editableRef.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      return;
    }

    // Dropdown navigation
    if (dropdownOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && suggestions[selectedIndex]) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDropdownOpen(false);
        return;
      }
    }

    // Prevent newline in single-line mode
    if (!multiline && e.key === 'Enter') {
      e.preventDefault();
    }

    // Call external handler
    externalKeyDown?.(e);
  };

  // Select suggestion
  const handleSelectSuggestion = (item: SuggestionItem) => {
    let newValue: string;
    
    // If autoTriggerType is set, replace entire value with selected item
    if (autoTriggerType) {
      newValue = item.display_text;
    } else {
      // Otherwise, replace from trigger position
      const beforeTrigger = value.slice(0, triggerPosition);
      newValue = beforeTrigger + item.display_text + ' ';
    }
    
    onChange(newValue);
    setDropdownOpen(false);
    setGhostText('');
    
    if (editableRef.current) {
      editableRef.current.textContent = newValue;
      editableRef.current.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editableRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  };

  const showPlaceholder = !value && !isFocused;
  const showGhost = ghostText && isFocused && !dropdownOpen;

  return (
    <div ref={containerRef} className={cn("relative w-full", containerClassName)}>
      {/* Main editable area with inline ghost text */}
      <div className={cn(
        "relative flex items-start px-2 py-1 rounded-sm transition-all",
        "border-b-2 border-transparent",
        isFocused ? "border-b-primary/30 bg-accent/30" : "hover:bg-accent/20",
        !multiline && "min-h-[32px]"
      )}>
        <div
          ref={editableRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            // Auto-trigger dropdown on focus for order forms
            if (autoTriggerType) {
              setDropdownType(autoTriggerType);
              setDropdownTrigger('');
              setTriggerPosition(0);
              updateDropdownPosition();
              loadSuggestions(autoTriggerType, value || '');
              setDropdownOpen(true);
            }
          }}
          onBlur={() => {
            setIsFocused(false);
            setGhostText('');
            onBlur?.();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
          }}
          className={cn(
            'outline-none text-sm leading-relaxed flex-1 min-w-0',
            'break-words',
            multiline ? 'whitespace-pre-wrap' : 'whitespace-nowrap overflow-x-auto',
            disabled && 'opacity-50 cursor-not-allowed',
            className
          )}
          style={{ minHeight }}
        />
        
        {/* Inline ghost text - appears right after the editable content */}
        {showGhost && (
          <span className="text-muted-foreground/40 text-sm pointer-events-none whitespace-pre flex items-center gap-1">
            {ghostText}
            <span className="text-[9px] bg-muted/60 px-1 py-0.5 rounded text-muted-foreground ml-0.5">
              Tab
            </span>
          </span>
        )}
        
        {/* Loading indicator */}
        {isLoadingGhost && isFocused && (
          <span className="ml-1 flex-shrink-0">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/50" />
          </span>
        )}
      </div>
      
      {/* Placeholder - positioned absolute when empty */}
      {showPlaceholder && (
        <div 
          className="absolute left-2 top-1 text-sm text-muted-foreground pointer-events-none"
          style={{ minHeight }}
        >
          {placeholder}
        </div>
      )}

      {/* Trigger hints (optional) */}
      {showTriggerHints && isFocused && !dropdownOpen && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] text-muted-foreground">
          <span><kbd className="px-1 bg-muted rounded">dx:</kbd> diagnostics</span>
          <span><kbd className="px-1 bg-muted rounded">rx:</kbd> médic</span>
          <span><kbd className="px-1 bg-muted rounded">lab:</kbd> bilans</span>
          {activeProblems && activeProblems.length > 0 && (
            <span className="text-primary/70"><kbd className="px-1 bg-primary/10 rounded">#p1</kbd> insérer problème</span>
          )}
        </div>
      )}

      {/* Dropdown - rendered in portal to avoid overflow clipping */}
      {dropdownOpen && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed z-[9999] rounded-lg border bg-popover shadow-lg overflow-hidden"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxWidth: '384px'
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
            {getTypeIcon(dropdownType)}
            <span className="text-xs font-medium capitalize">{dropdownType === 'icd10' ? 'Diagnostics' : dropdownType === 'medication' ? 'Médicaments' : dropdownType === 'lab' ? 'Bilans' : 'Ordres'}s</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {searchQuery && `"${searchQuery}"`}
            </span>
            <button 
              onMouseDown={(e) => {
                e.preventDefault();
                setDropdownOpen(false);
              }} 
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          
          {/* Results */}
          <div className="max-h-[180px] overflow-y-auto">
            {isLoadingDropdown ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : suggestions.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                {searchQuery ? 'Aucun résultat' : 'Taper pour rechercher...'}
              </div>
            ) : (
              suggestions.map((item, index) => (
                <button
                  key={item.code || index}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent blur before selection
                    handleSelectSuggestion(item);
                  }}
                  className={cn(
                    'flex items-start gap-2 w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors',
                    index === selectedIndex && 'bg-accent',
                    item.source === 'context_boost' && 'bg-primary/5 border-l-2 border-primary'
                  )}
                >
                  {getTypeIcon(item.type as SuggestionType)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{item.display_text}</div>
                    {item.code && (
                      <div className="text-[10px] text-muted-foreground">{item.code}</div>
                    )}
                    {/* Show relevance reason for context-boosted items */}
                    {item.relevance_reason && (
                      <div className="text-[9px] text-primary/70 mt-0.5">
                        <Sparkles className="h-2.5 w-2.5 inline mr-0.5" />
                        {item.relevance_reason}
                      </div>
                    )}
                  </div>
                  {item.source === 'patient_history' && (
                    <span className="text-[9px] bg-[var(--medicai-green-light)] text-foreground px-1 rounded">
                      Hx
                    </span>
                  )}
                  {item.source === 'context_boost' && (
                    <span className="text-[9px] bg-primary/10 text-primary px-1 rounded">
                      ★
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
          
          {/* Footer */}
          <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground bg-muted/20">
            <kbd className="px-1 bg-muted rounded">↑↓</kbd> naviguer
            <kbd className="px-1 bg-muted rounded ml-2">↵</kbd> sélectionner
            <kbd className="px-1 bg-muted rounded ml-2">Esc</kbd> fermer
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
