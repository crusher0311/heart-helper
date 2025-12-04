import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MessageSquarePlus, Edit2, Trash2, Loader2, X, AlertCircle, ThumbsUp, HelpCircle, MessageSquare } from "lucide-react";

type TranscriptAnnotation = {
  id: string;
  callId: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  note: string;
  annotationType: string | null;
  criterionId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type Utterance = {
  speaker: string;
  text: string;
};

type Props = {
  callId: string;
  transcriptText: string;
  utterances?: Utterance[];  // Speaker diarization from AssemblyAI
  isAdminOrManager: boolean;
};

const ANNOTATION_TYPES = [
  { value: "coaching", label: "Coaching Note", icon: MessageSquare, color: "bg-blue-500/10 text-blue-700 border-blue-200" },
  { value: "positive", label: "Positive Example", icon: ThumbsUp, color: "bg-green-500/10 text-green-700 border-green-200" },
  { value: "needs_improvement", label: "Needs Improvement", icon: AlertCircle, color: "bg-amber-500/10 text-amber-700 border-amber-200" },
  { value: "question", label: "Question/Discussion", icon: HelpCircle, color: "bg-purple-500/10 text-purple-700 border-purple-200" },
];

export function InteractiveTranscript({ callId, transcriptText, utterances, isAdminOrManager }: Props) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [selectedText, setSelectedText] = useState("");
  const [selectionOffsets, setSelectionOffsets] = useState<{ start: number; end: number } | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [annotationType, setAnnotationType] = useState("coaching");
  const [editingAnnotation, setEditingAnnotation] = useState<TranscriptAnnotation | null>(null);
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);

  const { data: annotations = [], isLoading: annotationsLoading } = useQuery<TranscriptAnnotation[]>({
    queryKey: ["/api/calls", callId, "annotations"],
    queryFn: async () => {
      const response = await fetch(`/api/calls/${callId}/annotations`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch annotations");
      return response.json();
    },
  });

  const createAnnotationMutation = useMutation({
    mutationFn: async (data: { startOffset: number; endOffset: number; selectedText: string; note: string; annotationType: string }) => {
      const res = await apiRequest("POST", `/api/calls/${callId}/annotations`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Annotation Added", description: "Your coaching note has been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/calls", callId, "annotations"] });
      resetSelection();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateAnnotationMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TranscriptAnnotation> }) => {
      const res = await apiRequest("PATCH", `/api/calls/${callId}/annotations/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Annotation Updated", description: "Your changes have been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/calls", callId, "annotations"] });
      setEditingAnnotation(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteAnnotationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/calls/${callId}/annotations/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Annotation Deleted", description: "The coaching note has been removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/calls", callId, "annotations"] });
      setActiveAnnotation(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetSelection = useCallback(() => {
    setSelectedText("");
    setSelectionOffsets(null);
    setShowDialog(false);
    setNewNote("");
    setAnnotationType("coaching");
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleTextSelection = useCallback(() => {
    if (!isAdminOrManager) return;
    
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length < 3) {
      return;
    }

    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    if (!container) {
      return;
    }
    
    // Walk up from the selection's start container to check if it's inside our container
    // This fixes issues with Popover-wrapped annotation spans
    let node: Node | null = range.startContainer;
    let isInsideContainer = false;
    while (node) {
      if (node === container) {
        isInsideContainer = true;
        break;
      }
      node = node.parentNode;
    }
    
    if (!isInsideContainer) {
      return;
    }

    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(container);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preSelectionRange.toString().length;
    const endOffset = startOffset + text.length;

    setSelectedText(text);
    setSelectionOffsets({ start: startOffset, end: endOffset });
    setShowDialog(true);
  }, [isAdminOrManager]);

  const handleAddAnnotation = () => {
    if (!selectionOffsets || !newNote.trim()) return;
    
    createAnnotationMutation.mutate({
      startOffset: selectionOffsets.start,
      endOffset: selectionOffsets.end,
      selectedText,
      note: newNote.trim(),
      annotationType,
    });
  };

  const handleUpdateAnnotation = () => {
    if (!editingAnnotation || !editingAnnotation.note.trim()) return;
    
    updateAnnotationMutation.mutate({
      id: editingAnnotation.id,
      data: {
        note: editingAnnotation.note,
        annotationType: editingAnnotation.annotationType || "coaching",
      },
    });
  };

  // Render transcript with speaker diarization (when available from AssemblyAI)
  const renderDiarizedTranscript = () => {
    if (!utterances || utterances.length === 0) return null;
    
    // Speaker colors for visual distinction
    const speakerColors: Record<string, string> = {
      "Speaker A": "text-blue-600 dark:text-blue-400",
      "Speaker B": "text-green-600 dark:text-green-400", 
      "Speaker C": "text-purple-600 dark:text-purple-400",
      "Speaker D": "text-orange-600 dark:text-orange-400",
    };
    
    return (
      <div className="space-y-3">
        {utterances.map((utterance, idx) => {
          const colorClass = speakerColors[utterance.speaker] || "text-primary";
          return (
            <div key={idx} className="flex gap-3">
              <span className={`font-semibold shrink-0 min-w-[90px] ${colorClass}`}>
                {utterance.speaker}:
              </span>
              <span className="text-foreground">{utterance.text}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderAnnotatedText = () => {
    if (!transcriptText) return null;

    const sortedAnnotations = [...annotations].sort((a, b) => a.startOffset - b.startOffset);
    const elements: JSX.Element[] = [];
    let lastEnd = 0;

    sortedAnnotations.forEach((annotation, idx) => {
      if (annotation.startOffset > lastEnd) {
        elements.push(
          <span key={`text-${idx}`}>
            {transcriptText.slice(lastEnd, annotation.startOffset)}
          </span>
        );
      }

      const typeConfig = ANNOTATION_TYPES.find(t => t.value === annotation.annotationType) || ANNOTATION_TYPES[0];
      const Icon = typeConfig.icon;

      elements.push(
        <Popover 
          key={`annotation-${annotation.id}`}
          open={activeAnnotation === annotation.id}
          onOpenChange={(open) => setActiveAnnotation(open ? annotation.id : null)}
        >
          <PopoverTrigger asChild>
            <span
              className={`cursor-pointer underline decoration-2 decoration-dotted ${
                annotation.annotationType === "positive" ? "decoration-green-500 bg-green-500/10" :
                annotation.annotationType === "needs_improvement" ? "decoration-amber-500 bg-amber-500/10" :
                annotation.annotationType === "question" ? "decoration-purple-500 bg-purple-500/10" :
                "decoration-blue-500 bg-blue-500/10"
              } hover:opacity-80 transition-opacity px-0.5 rounded`}
              data-testid={`annotation-highlight-${annotation.id}`}
            >
              {transcriptText.slice(annotation.startOffset, annotation.endOffset)}
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-80" side="top">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <Badge variant="outline" className={typeConfig.color}>
                  {typeConfig.label}
                </Badge>
              </div>
              <p className="text-sm font-medium">"{annotation.selectedText}"</p>
              <p className="text-sm text-muted-foreground">{annotation.note}</p>
              {isAdminOrManager && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingAnnotation(annotation);
                      setActiveAnnotation(null);
                    }}
                    data-testid={`button-edit-annotation-${annotation.id}`}
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => deleteAnnotationMutation.mutate(annotation.id)}
                    disabled={deleteAnnotationMutation.isPending}
                    data-testid={`button-delete-annotation-${annotation.id}`}
                  >
                    {deleteAnnotationMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3 mr-1" />
                    )}
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      );

      lastEnd = annotation.endOffset;
    });

    if (lastEnd < transcriptText.length) {
      elements.push(
        <span key="text-final">{transcriptText.slice(lastEnd)}</span>
      );
    }

    return elements;
  };

  return (
    <div className="space-y-4">
      {isAdminOrManager && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
          <MessageSquarePlus className="h-4 w-4" />
          <span>Select any text in the transcript to add a coaching note</span>
        </div>
      )}

      {annotations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">Annotations:</span>
          {annotations.map(annotation => {
            const typeConfig = ANNOTATION_TYPES.find(t => t.value === annotation.annotationType) || ANNOTATION_TYPES[0];
            return (
              <Badge 
                key={annotation.id} 
                variant="outline" 
                className={`${typeConfig.color} cursor-pointer`}
                onClick={() => setActiveAnnotation(annotation.id)}
                data-testid={`badge-annotation-${annotation.id}`}
              >
                {annotation.selectedText.slice(0, 20)}{annotation.selectedText.length > 20 ? "..." : ""}
              </Badge>
            );
          })}
        </div>
      )}

      <div
        ref={containerRef}
        className="bg-muted/30 rounded-lg p-4 text-sm leading-relaxed select-text"
        onMouseUp={handleTextSelection}
        data-testid="transcript-content"
      >
        {annotationsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : utterances && utterances.length > 0 ? (
          renderDiarizedTranscript()
        ) : (
          <div className="whitespace-pre-wrap">{renderAnnotatedText()}</div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={(open) => !open && resetSelection()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Coaching Note</DialogTitle>
            <DialogDescription>
              Add a coaching note for this selected text
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm font-medium text-muted-foreground mb-1">Selected Text:</p>
              <p className="text-sm italic">"{selectedText}"</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={annotationType} onValueChange={setAnnotationType}>
                <SelectTrigger data-testid="select-annotation-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANNOTATION_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Note</label>
              <Textarea
                placeholder="Enter your coaching feedback..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
                data-testid="input-annotation-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetSelection} data-testid="button-cancel-annotation">
              Cancel
            </Button>
            <Button 
              onClick={handleAddAnnotation}
              disabled={!newNote.trim() || createAnnotationMutation.isPending}
              data-testid="button-save-annotation"
            >
              {createAnnotationMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <MessageSquarePlus className="h-4 w-4 mr-2" />
              )}
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingAnnotation} onOpenChange={(open) => !open && setEditingAnnotation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Coaching Note</DialogTitle>
            <DialogDescription>
              Update this coaching note
            </DialogDescription>
          </DialogHeader>
          {editingAnnotation && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium text-muted-foreground mb-1">Selected Text:</p>
                <p className="text-sm italic">"{editingAnnotation.selectedText}"</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select 
                  value={editingAnnotation.annotationType || "coaching"} 
                  onValueChange={(val) => setEditingAnnotation({...editingAnnotation, annotationType: val})}
                >
                  <SelectTrigger data-testid="select-edit-annotation-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNOTATION_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Note</label>
                <Textarea
                  value={editingAnnotation.note}
                  onChange={(e) => setEditingAnnotation({...editingAnnotation, note: e.target.value})}
                  rows={3}
                  data-testid="input-edit-annotation-note"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAnnotation(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateAnnotation}
              disabled={!editingAnnotation?.note.trim() || updateAnnotationMutation.isPending}
              data-testid="button-update-annotation"
            >
              {updateAnnotationMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Edit2 className="h-4 w-4 mr-2" />
              )}
              Update Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
