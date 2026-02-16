// @ts-nocheck
// TODO: This component needs type fixes - not currently in use for main workspace feature
'use client';

import { useState, useEffect, Key } from 'react';
import { Button } from '@/components/ui/button';
import { Save, Lock, ChevronRight, Loader2, AlertTriangle, TrendingUp, FileText, Activity } from 'lucide-react';
import type { Canvas, CanvasSections } from '@/types';
import { usePatientChanges } from '@/lib/hooks';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Stub hooks until properly implemented
const useUpdateCanvas = (consultationId: string) => ({
  mutate: async (data: any) => {},
  isPending: false,
});
const useFinalizeCanvas = (consultationId: string) => ({
  mutate: async () => {},
  isPending: false,
});

interface ConsultationCanvasProps {
  canvas: Canvas;
  consultationId: string;
  onClose?: () => void;
}

type SectionKey = keyof CanvasSections;


const sectionLabels: Record<SectionKey, string> = {
  summary: 'Summary',
  red_flags: 'Red Flags',
  timeline: 'Timeline',
  active_problems: 'Active Problems',
  meds: 'Medications',
  labs_highlights: 'Lab Highlights',
  imaging_highlights: 'Imaging Highlights',
  questions: 'Questions to Ask',
};

export function ConsultationCanvas({ canvas, consultationId, onClose }: ConsultationCanvasProps) {
  const [sections, setSections] = useState<CanvasSections>(canvas.sections || {} as CanvasSections);
  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    new Set(['summary', 'red_flags'])
  );
  const [editingSection, setEditingSection] = useState<SectionKey | null>(null);
  const [editContent, setEditContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const updateCanvas = useUpdateCanvas(consultationId);
  const finalizeCanvas = useFinalizeCanvas(consultationId);
  
  // Fetch changes since last visit - strip '#' prefix if present
  const patientIdClean = canvas.patient_id.startsWith('#') 
    ? canvas.patient_id.substring(1) 
    : canvas.patient_id;
  const { data: patientChanges, isLoading: changesLoading, error: changesError } = usePatientChanges(
    patientIdClean,
    consultationId
  );

  const isDraft = canvas.status === 'draft';

  // Update sections when canvas changes
  useEffect(() => {
    if (canvas.sections) {
      setSections(canvas.sections);
    }
  }, [canvas]);

  // Check if canvas has any meaningful data - be less strict
  const hasData = canvas && canvas.sections;

  if (!hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Generating canvas sections...</p>
        </div>
      </div>
    );
  }

  const toggleSection = (section: SectionKey) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const startEdit = (section: SectionKey) => {
    if (!isDraft) return;
    setEditingSection(section);
    const content = section === 'timeline' 
      ? JSON.stringify(sections[section], null, 2)
      : sections[section].text;
    setEditContent(content);
  };

  const cancelEdit = () => {
    setEditingSection(null);
    setEditContent('');
  };

  const saveEdit = () => {
    if (!editingSection) return;

    const newSections = { ...sections };
    
    if (editingSection === 'timeline') {
      try {
        newSections[editingSection] = JSON.parse(editContent);
      } catch (e) {
        alert('Invalid JSON format for timeline');
        return;
      }
    } else {
      newSections[editingSection] = {
        ...newSections[editingSection],
        text: editContent,
      };
    }

    setSections(newSections);
    setHasChanges(true);
    setEditingSection(null);
    setEditContent('');
  };

  const handleSave = () => {
    updateCanvas.mutate(sections, {
      onSuccess: () => {
        setHasChanges(false);
      },
    });
  };

  const handleFinalize = () => {
    if (!confirm('Lock this canvas as final version? You cannot edit after finalization.')) {
      return;
    }
    
    // Save first if there are changes
    if (hasChanges) {
      updateCanvas.mutate(sections, {
        onSuccess: () => {
          finalizeCanvas.mutate();
          setHasChanges(false);
        },
      });
    } else {
      finalizeCanvas.mutate();
    }
  };

  const renderSectionContent = (section: SectionKey) => {
    if (!sections) return null;
    
    if (section === 'timeline') {
      const timeline = sections.timeline as any;
      if (!timeline || !timeline.items || timeline.items.length === 0) {
        return <p className="text-sm text-muted-foreground">No timeline items</p>;
      }
      return (
        <div className="space-y-3">
          {timeline.items.map((item: any, idx: number) => (
            <div key={idx} className="flex gap-3 text-sm">
              <div className="font-semibold text-muted-foreground min-w-[100px]">
                {item.date}
              </div>
              <div className="flex-1">
                <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed prose-p:my-1 prose-ul:my-2 prose-li:my-0 prose-strong:font-semibold prose-strong:text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {item.event}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    const content = sections[section] as any;
    if (!content || !content.text) {
      return <p className="text-sm text-muted-foreground">No content available</p>;
    }

    // Ensure text is a string (handle arrays or other types from AI)
    let textContent = content.text;
    if (Array.isArray(textContent)) {
      textContent = textContent.join('\n\n');
    } else if (typeof textContent !== 'string') {
      textContent = String(textContent);
    }

    return (
      <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed prose-p:my-2 prose-ul:my-2 prose-li:my-1 prose-strong:font-semibold prose-strong:text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {textContent}
        </ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="font-semibold text-lg">Consultation Canvas</h2>
            <p className="text-sm text-muted-foreground">
              {isDraft ? 'Draft' : `Version ${canvas.version}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <>
              {hasChanges && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSave}
                  disabled={updateCanvas.isPending}
                >
                  {updateCanvas.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span className="ml-2">Save</span>
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleFinalize}
                disabled={finalizeCanvas.isPending}
              >
                {finalizeCanvas.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                <span className="ml-2">Finalize</span>
              </Button>
            </>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* What Changed Since Last Visit */}
      {patientChanges && (
        <div className="border-b bg-muted/20 p-4">
          <div className="max-w-4xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-base">
                {patientChanges.since ? 'What Changed Since Last Visit' : 'First Consultation'}
              </h3>
              {patientChanges.since && (
                <Badge variant="outline" className="ml-2">
                  {new Date(patientChanges.since).toLocaleDateString()}
                </Badge>
              )}
            </div>
            
            {/* First visit message */}
            {!patientChanges.since && (
              <p className="text-sm text-muted-foreground italic mb-3">
                This is the patient's first consultation. No previous visit data available for comparison.
              </p>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* New Documents */}
              {patientChanges.new_documents.length > 0 && (
                <Card className="bg-background/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      New Documents
                      <Badge variant="secondary" className="ml-auto">
                        {patientChanges.new_documents.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {patientChanges.new_documents.slice(0, 3).map((doc) => (
                      <div key={doc.doc_id} className="text-xs">
                        <span className="font-medium capitalize">{doc.document_type}</span>
                        {doc.date_of_service && (
                          <span className="text-muted-foreground ml-1">
                            ({new Date(doc.date_of_service).toLocaleDateString()})
                          </span>
                        )}
                      </div>
                    ))}
                    {patientChanges.new_documents.length > 3 && (
                      <p className="text-xs text-muted-foreground italic">
                        +{patientChanges.new_documents.length - 3} more
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* New Abnormal Labs */}
              {patientChanges.new_abnormals.length > 0 && (
                <Card className="bg-background/50 border-border dark:border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      New Abnormals
                      <Badge variant="destructive" className="ml-auto">
                        {patientChanges.new_abnormals.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {patientChanges.new_abnormals.slice(0, 3).map((lab, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="font-medium">{lab.test_name}</span>
                        <span className="text-muted-foreground ml-1">
                          {lab.value} {lab.unit}
                        </span>
                        <Badge variant="outline" className="ml-1 text-[10px] h-4 px-1">
                          {lab.flag}
                        </Badge>
                      </div>
                    ))}
                    {patientChanges.new_abnormals.length > 3 && (
                      <p className="text-xs text-muted-foreground italic">
                        +{patientChanges.new_abnormals.length - 3} more
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Worsening Trends */}
              {patientChanges.worsening_trends.length > 0 && (
                <Card className="bg-background/50 border-red-200 dark:border-red-900">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-red-600" />
                      Worsening Trends
                      <Badge variant="destructive" className="ml-auto">
                        {patientChanges.worsening_trends.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {patientChanges.worsening_trends.slice(0, 3).map((lab, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="font-medium">{lab.test_name}</span>
                        {lab.previous_value && (
                          <span className="text-muted-foreground ml-1">
                            {lab.previous_value} → {lab.value}
                          </span>
                        )}
                      </div>
                    ))}
                    {patientChanges.worsening_trends.length > 3 && (
                      <p className="text-xs text-muted-foreground italic">
                        +{patientChanges.worsening_trends.length - 3} more
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* New Imaging */}
              {patientChanges.new_imaging.length > 0 && (
                <Card className="bg-background/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      New Imaging
                      <Badge variant="secondary" className="ml-auto">
                        {patientChanges.new_imaging.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {patientChanges.new_imaging.slice(0, 2).map((img) => (
                      <div key={img.report_id} className="text-xs">
                        <span className="font-medium">{img.type_examen}</span>
                        <span className="text-muted-foreground ml-1">
                          ({new Date(img.date_of_service).toLocaleDateString()})
                        </span>
                        {img.conclusion && (
                          <p className="text-muted-foreground mt-0.5 line-clamp-2">
                            {img.conclusion}
                          </p>
                        )}
                      </div>
                    ))}
                    {patientChanges.new_imaging.length > 2 && (
                      <p className="text-xs text-muted-foreground italic">
                        +{patientChanges.new_imaging.length - 2} more
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* No changes message */}
            {patientChanges.new_documents.length === 0 && 
             patientChanges.new_abnormals.length === 0 && 
             patientChanges.worsening_trends.length === 0 && 
             patientChanges.new_imaging.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                No significant changes detected since last visit.
              </p>
            )}
          </div>
        </div>
      )}

      {changesLoading && (
        <div className="border-b bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading changes since last visit...</span>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3 max-w-4xl">
          {(Object.keys(sectionLabels) as SectionKey[]).map((section) => {
            const isExpanded = expandedSections.has(section);
            const isEditing = editingSection === section;

            return (
              <div
                key={section}
                className="border rounded-lg bg-card"
              >
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(section)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium">{sectionLabels[section]}</span>
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                {/* Section Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t">
                    {isEditing ? (
                      <div className="space-y-3 pt-4">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full min-h-[200px] p-3 border rounded-md font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveEdit}>
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-4">
                        <div className="mb-3">
                          {renderSectionContent(section)}
                        </div>
                        {isDraft && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(section)}
                            className="text-xs"
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
