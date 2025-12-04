import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Plus, GripVertical, Trash2, Save, Loader2, CheckCircle2, XCircle, Edit2, Phone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CoachingCriteria } from "@shared/schema";

const DEFAULT_CRITERIA = [
  { name: "Rapport", description: "Building connection and trust with the customer through friendly, professional conversation", category: "greeting", weight: 10 },
  { name: "Inspection Credentials", description: "Mentioning ASE certifications, technician experience, or shop qualifications", category: "credibility", weight: 10 },
  { name: "Digital Resources Confirmation", description: "Explaining digital inspection, photos, and videos that will be provided", category: "credibility", weight: 10 },
  { name: "Good-Good-Bad Presentation", description: "Starting with positive findings before presenting repair needs", category: "sales", weight: 10 },
  { name: "Safety Concern Emphasis", description: "Clearly communicating safety implications of needed repairs", category: "sales", weight: 10 },
  { name: "3yr/36k Warranty", description: "Mentioning the warranty coverage for parts and labor", category: "value", weight: 10 },
  { name: "Price Presentation (Investment)", description: "Framing costs as an investment in vehicle longevity and safety", category: "sales", weight: 10 },
  { name: "Permission to Inspect Rest", description: "Asking for authorization to complete full vehicle inspection", category: "closing", weight: 10 },
  { name: "Follow-up Commitment", description: "Scheduling or confirming next steps and future contact", category: "closing", weight: 10 },
  { name: "Objection Handling", description: "Effectively addressing customer concerns about price, timing, or necessity", category: "objections", weight: 10 },
];

const CATEGORIES = [
  { value: "greeting", label: "Greeting & Rapport" },
  { value: "credibility", label: "Credibility" },
  { value: "sales", label: "Sales Presentation" },
  { value: "value", label: "Value Proposition" },
  { value: "closing", label: "Closing" },
  { value: "objections", label: "Objection Handling" },
];

const CALL_TYPES = [
  { value: "all", label: "All Call Types", color: "bg-gray-500/10 text-gray-700 border-gray-200" },
  { value: "sales", label: "Sales", color: "bg-blue-500/10 text-blue-700 border-blue-200" },
  { value: "price_shopper", label: "Price Shopper", color: "bg-teal-500/10 text-teal-700 border-teal-200" },
  { value: "appointment_request", label: "Appointment Request", color: "bg-purple-500/10 text-purple-700 border-purple-200" },
];

export default function AdminCoachingCriteriaPage() {
  const { toast } = useToast();
  const [editingCriteria, setEditingCriteria] = useState<CoachingCriteria | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCriteria, setNewCriteria] = useState({
    name: "",
    description: "",
    category: "sales",
    callType: "sales",
    weight: 10,
    keywords: "",
    aiPrompt: "",
  });

  const { data: user } = useQuery<{ id: string; isAdmin: boolean }>({
    queryKey: ["/api/auth/user"],
  });

  const { data: criteria, isLoading } = useQuery<CoachingCriteria[]>({
    queryKey: ["/api/coaching/criteria"],
    enabled: user?.isAdmin === true,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<CoachingCriteria> }) => {
      return apiRequest("PATCH", `/api/coaching/criteria/${data.id}`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaching/criteria"] });
      toast({ title: "Criteria updated", description: "Changes saved successfully" });
      setEditingCriteria(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newCriteria) => {
      return apiRequest("POST", "/api/coaching/criteria", {
        ...data,
        keywords: data.keywords ? data.keywords.split(",").map(k => k.trim()) : [],
        sortOrder: criteria?.length || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaching/criteria"] });
      toast({ title: "Criteria created", description: "New criterion added successfully" });
      setIsAddingNew(false);
      setNewCriteria({ name: "", description: "", category: "sales", callType: "sales", weight: 10, keywords: "", aiPrompt: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/coaching/criteria/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaching/criteria"] });
      toast({ title: "Criteria deleted", description: "Criterion removed successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/coaching/criteria/seed-defaults", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaching/criteria"] });
      toast({ title: "Success", description: "Default criteria seeded successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleActive = (criterion: CoachingCriteria) => {
    updateMutation.mutate({ id: criterion.id, updates: { isActive: !criterion.isActive } });
  };

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <Link href="/settings" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>
          <Card>
            <CardContent className="p-12 text-center">
              <XCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">Admin Access Required</h2>
              <p className="text-muted-foreground">You need administrator privileges to manage coaching criteria.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <Link href="/settings" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6" data-testid="link-back-settings">
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Phone className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Call Coaching Criteria</h1>
              <p className="text-muted-foreground">Configure the 10-point grading system for call evaluations</p>
            </div>
          </div>
          <div className="flex gap-2">
            {(!criteria || criteria.length === 0) && (
              <Button
                variant="outline"
                onClick={() => seedDefaultsMutation.mutate()}
                disabled={seedDefaultsMutation.isPending}
                data-testid="button-seed-defaults"
              >
                {seedDefaultsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Load Defaults
              </Button>
            )}
            <Button onClick={() => setIsAddingNew(true)} data-testid="button-add-criteria">
              <Plus className="w-4 h-4 mr-2" />
              Add Criterion
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">Loading criteria...</p>
            </CardContent>
          </Card>
        ) : criteria && criteria.length > 0 ? (
          <div className="space-y-3">
            {criteria
              .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
              .map((criterion, index) => (
                <Card key={criterion.id} className={criterion.isActive ? "" : "opacity-60"} data-testid={`card-criterion-${criterion.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <GripVertical className="w-4 h-4" />
                        <span className="font-mono text-sm w-6">{index + 1}.</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{criterion.name}</h3>
                          {criterion.category && (
                            <Badge variant="secondary" className="text-xs">
                              {CATEGORIES.find(c => c.value === criterion.category)?.label || criterion.category}
                            </Badge>
                          )}
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${CALL_TYPES.find(t => t.value === (criterion.callType || 'sales'))?.color || ''}`}
                          >
                            {CALL_TYPES.find(t => t.value === (criterion.callType || 'sales'))?.label || 'Sales'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {criterion.weight} pts
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{criterion.description || "No description"}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={criterion.isActive ?? true}
                          onCheckedChange={() => toggleActive(criterion)}
                          data-testid={`switch-active-${criterion.id}`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingCriteria(criterion)}
                          data-testid={`button-edit-${criterion.id}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(criterion.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${criterion.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Phone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Coaching Criteria</h3>
              <p className="text-muted-foreground mb-4">
                Get started by loading the default 10-point grading system or create your own criteria.
              </p>
              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => seedDefaultsMutation.mutate()}
                  disabled={seedDefaultsMutation.isPending}
                  data-testid="button-seed-defaults-empty"
                >
                  {seedDefaultsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Load Default Criteria
                </Button>
                <Button onClick={() => setIsAddingNew(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Custom
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">How Scoring Works</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Each criterion is scored from 0-5 based on AI analysis of call transcripts:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>0:</strong> Not mentioned or attempted</li>
              <li><strong>1-2:</strong> Briefly mentioned but incomplete</li>
              <li><strong>3:</strong> Adequately covered</li>
              <li><strong>4-5:</strong> Excellent execution with positive customer response</li>
            </ul>
            <p className="pt-2">The overall score is calculated as a weighted percentage of the maximum possible points.</p>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingCriteria} onOpenChange={(open) => !open && setEditingCriteria(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Criterion</DialogTitle>
            <DialogDescription>Update the scoring criterion details</DialogDescription>
          </DialogHeader>
          {editingCriteria && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editingCriteria.name}
                  onChange={(e) => setEditingCriteria({ ...editingCriteria, name: e.target.value })}
                  data-testid="input-edit-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editingCriteria.description || ""}
                  onChange={(e) => setEditingCriteria({ ...editingCriteria, description: e.target.value })}
                  rows={3}
                  data-testid="input-edit-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-category">Category</Label>
                  <Select
                    value={editingCriteria.category || "sales"}
                    onValueChange={(value) => setEditingCriteria({ ...editingCriteria, category: value })}
                  >
                    <SelectTrigger id="edit-category" data-testid="select-edit-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-call-type">Call Type</Label>
                  <Select
                    value={editingCriteria.callType || "sales"}
                    onValueChange={(value) => setEditingCriteria({ ...editingCriteria, callType: value })}
                  >
                    <SelectTrigger id="edit-call-type" data-testid="select-edit-call-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CALL_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-weight">Weight (Points)</Label>
                <Input
                  id="edit-weight"
                  type="number"
                  min={1}
                  max={20}
                  value={editingCriteria.weight || 10}
                  onChange={(e) => setEditingCriteria({ ...editingCriteria, weight: parseInt(e.target.value) || 10 })}
                  data-testid="input-edit-weight"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-keywords">Keywords (comma-separated)</Label>
                <Input
                  id="edit-keywords"
                  value={editingCriteria.keywords?.join(", ") || ""}
                  onChange={(e) => setEditingCriteria({ ...editingCriteria, keywords: e.target.value.split(",").map(k => k.trim()) })}
                  placeholder="warranty, guarantee, coverage"
                  data-testid="input-edit-keywords"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-prompt">Custom AI Prompt (optional)</Label>
                <Textarea
                  id="edit-prompt"
                  value={editingCriteria.aiPrompt || ""}
                  onChange={(e) => setEditingCriteria({ ...editingCriteria, aiPrompt: e.target.value })}
                  rows={3}
                  placeholder="Custom instructions for AI scoring..."
                  data-testid="input-edit-prompt"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCriteria(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingCriteria) {
                  updateMutation.mutate({
                    id: editingCriteria.id,
                    updates: {
                      name: editingCriteria.name,
                      description: editingCriteria.description,
                      category: editingCriteria.category,
                      callType: editingCriteria.callType,
                      weight: editingCriteria.weight,
                      keywords: editingCriteria.keywords,
                      aiPrompt: editingCriteria.aiPrompt,
                    },
                  });
                }
              }}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Dialog */}
      <Dialog open={isAddingNew} onOpenChange={setIsAddingNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Criterion</DialogTitle>
            <DialogDescription>Create a new scoring criterion for call evaluations</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Name</Label>
              <Input
                id="new-name"
                value={newCriteria.name}
                onChange={(e) => setNewCriteria({ ...newCriteria, name: e.target.value })}
                placeholder="e.g., Customer Greeting"
                data-testid="input-new-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-description">Description</Label>
              <Textarea
                id="new-description"
                value={newCriteria.description}
                onChange={(e) => setNewCriteria({ ...newCriteria, description: e.target.value })}
                rows={3}
                placeholder="What should the advisor do to score well on this?"
                data-testid="input-new-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-category">Category</Label>
                <Select
                  value={newCriteria.category}
                  onValueChange={(value) => setNewCriteria({ ...newCriteria, category: value })}
                >
                  <SelectTrigger id="new-category" data-testid="select-new-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-call-type">Call Type</Label>
                <Select
                  value={newCriteria.callType}
                  onValueChange={(value) => setNewCriteria({ ...newCriteria, callType: value })}
                >
                  <SelectTrigger id="new-call-type" data-testid="select-new-call-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CALL_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-weight">Weight (Points)</Label>
              <Input
                id="new-weight"
                type="number"
                min={1}
                max={20}
                value={newCriteria.weight}
                onChange={(e) => setNewCriteria({ ...newCriteria, weight: parseInt(e.target.value) || 10 })}
                data-testid="input-new-weight"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-keywords">Keywords (comma-separated)</Label>
              <Input
                id="new-keywords"
                value={newCriteria.keywords}
                onChange={(e) => setNewCriteria({ ...newCriteria, keywords: e.target.value })}
                placeholder="warranty, guarantee, coverage"
                data-testid="input-new-keywords"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-prompt">Custom AI Prompt (optional)</Label>
              <Textarea
                id="new-prompt"
                value={newCriteria.aiPrompt}
                onChange={(e) => setNewCriteria({ ...newCriteria, aiPrompt: e.target.value })}
                rows={3}
                placeholder="Custom instructions for AI scoring..."
                data-testid="input-new-prompt"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingNew(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(newCriteria)}
              disabled={createMutation.isPending || !newCriteria.name}
              data-testid="button-create-criteria"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Criterion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
