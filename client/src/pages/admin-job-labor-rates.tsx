import { ArrowLeft, DollarSign, Plus, Trash2, Edit2, Loader2, Save, X, Tag, ToggleLeft, ToggleRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";

type JobLaborRate = {
  id: string;
  name: string;
  keywords: string[];
  defaultRate: number;
  shopOverrides: Record<string, number> | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

const SHOPS = [
  { id: "NB", name: "Northbrook" },
  { id: "WM", name: "Wilmette" },
  { id: "EV", name: "Evanston" },
];

export default function AdminJobLaborRates() {
  const { toast } = useToast();
  const [editingRate, setEditingRate] = useState<JobLaborRate | null>(null);
  const [deleteConfirmRate, setDeleteConfirmRate] = useState<JobLaborRate | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    keywords: "",
    defaultRate: "",
    shopOverrides: {} as Record<string, string>,
    isActive: true,
  });

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
  });

  const { data: rates, isLoading } = useQuery<JobLaborRate[]>({
    queryKey: ["/api/admin/job-labor-rates"],
    enabled: adminCheck?.isAdmin === true,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; keywords: string[]; defaultRate: number; shopOverrides: Record<string, number>; isActive: boolean }) => {
      const response = await apiRequest("POST", "/api/admin/job-labor-rates", data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create job rate");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/job-labor-rates"] });
      toast({ title: "Job rate created", description: "Job-based labor rate has been created." });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ name: string; keywords: string[]; defaultRate: number; shopOverrides: Record<string, number>; isActive: boolean }> }) => {
      const response = await apiRequest("PUT", `/api/admin/job-labor-rates/${id}`, data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update job rate");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/job-labor-rates"] });
      toast({ title: "Job rate updated", description: "Job-based labor rate has been updated." });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/job-labor-rates/${id}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete job rate");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/job-labor-rates"] });
      toast({ title: "Job rate deleted", description: "Job-based labor rate has been deleted." });
      setDeleteConfirmRate(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ name: "", keywords: "", defaultRate: "", shopOverrides: {}, isActive: true });
    setEditingRate(null);
    setIsAddMode(false);
  };

  const handleEditClick = (rate: JobLaborRate) => {
    setEditingRate(rate);
    setIsAddMode(false);
    const overrides: Record<string, string> = {};
    if (rate.shopOverrides) {
      Object.entries(rate.shopOverrides).forEach(([shopId, cents]) => {
        overrides[shopId] = (cents / 100).toFixed(2);
      });
    }
    setFormData({
      name: rate.name,
      keywords: rate.keywords.join(", "),
      defaultRate: (rate.defaultRate / 100).toFixed(2),
      shopOverrides: overrides,
      isActive: rate.isActive,
    });
  };

  const handleSubmit = () => {
    const keywordsArray = formData.keywords
      .split(",")
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Job name is required", variant: "destructive" });
      return;
    }
    if (keywordsArray.length === 0) {
      toast({ title: "Error", description: "At least one keyword is required", variant: "destructive" });
      return;
    }
    const parsedRate = parseFloat(formData.defaultRate);
    if (!formData.defaultRate || isNaN(parsedRate) || parsedRate <= 0) {
      toast({ title: "Error", description: "Valid default rate is required (must be greater than 0)", variant: "destructive" });
      return;
    }

    const defaultRateCents = Math.round(parsedRate * 100);
    
    const shopOverridesCents: Record<string, number> = {};
    for (const [shopId, value] of Object.entries(formData.shopOverrides)) {
      if (value && value.trim()) {
        const parsed = parseFloat(value);
        if (!isNaN(parsed) && parsed > 0) {
          shopOverridesCents[shopId] = Math.round(parsed * 100);
        }
      }
    }

    if (editingRate) {
      updateMutation.mutate({
        id: editingRate.id,
        data: {
          name: formData.name.trim(),
          keywords: keywordsArray,
          defaultRate: defaultRateCents,
          shopOverrides: shopOverridesCents,
          isActive: formData.isActive,
        },
      });
    } else {
      createMutation.mutate({
        name: formData.name.trim(),
        keywords: keywordsArray,
        defaultRate: defaultRateCents,
        shopOverrides: shopOverridesCents,
        isActive: formData.isActive,
      });
    }
  };

  const formatRate = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const handleShopOverrideChange = (shopId: string, value: string) => {
    setFormData({
      ...formData,
      shopOverrides: {
        ...formData.shopOverrides,
        [shopId]: value,
      },
    });
  };

  if (!adminCheck?.isAdmin) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <Card>
            <CardContent className="p-12 text-center">
              <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">Admin Access Required</h2>
              <p className="text-muted-foreground">
                You don't have permission to manage job labor rates.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6" data-testid="link-back-home">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Tag className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-job-rates-title">Job-Based Labor Rates</h1>
              <p className="text-muted-foreground">Set fixed labor charges for specific job types (e.g., Cabin Filter = $100)</p>
            </div>
          </div>
          {!isAddMode && !editingRate && (
            <Button onClick={() => setIsAddMode(true)} data-testid="button-add-rate">
              <Plus className="h-4 w-4 mr-2" />
              Add Job Rate
            </Button>
          )}
        </div>

        {(isAddMode || editingRate) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{editingRate ? "Edit Job Rate" : "Add New Job Rate"}</CardTitle>
              <CardDescription>
                {editingRate 
                  ? "Update the job-based labor rate settings" 
                  : "Create a fixed labor rate for a specific job type"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Job Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Cabin Air Filter"
                    data-testid="input-job-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultRate">Default Rate ($)</Label>
                  <Input
                    id="defaultRate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.defaultRate}
                    onChange={(e) => setFormData({ ...formData, defaultRate: e.target.value })}
                    placeholder="e.g., 100.00"
                    data-testid="input-default-rate"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="keywords">Match Keywords (comma-separated)</Label>
                <Input
                  id="keywords"
                  value={formData.keywords}
                  onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                  placeholder="e.g., cabin filter, cabin air filter, hvac filter"
                  data-testid="input-keywords"
                />
                <p className="text-xs text-muted-foreground">
                  Job names containing any of these keywords will use this rate
                </p>
              </div>

              <div className="space-y-2">
                <Label>Shop-Specific Overrides (optional)</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {SHOPS.map((shop) => (
                    <div key={shop.id} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{shop.name}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.shopOverrides[shop.id] || ""}
                        onChange={(e) => handleShopOverrideChange(shop.id, e.target.value)}
                        placeholder="Use default"
                        data-testid={`input-override-${shop.id}`}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the default rate for that shop
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  data-testid="switch-active"
                />
                <Label htmlFor="isActive" className="cursor-pointer">
                  {formData.isActive ? "Active" : "Inactive"} - {formData.isActive ? "This rate will be applied to matching jobs" : "This rate is disabled"}
                </Label>
              </div>

              <div className="flex gap-3">
                <Button 
                  onClick={handleSubmit} 
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-rate"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" /> {editingRate ? "Update" : "Create"} Job Rate</>
                  )}
                </Button>
                <Button variant="outline" onClick={resetForm} data-testid="button-cancel">
                  <X className="h-4 w-4 mr-2" /> Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading job labor rates...</p>
            </CardContent>
          </Card>
        ) : !rates || rates.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h2 className="text-lg font-semibold mb-2">No Job Labor Rates</h2>
              <p className="text-muted-foreground mb-4">
                Create job-specific rates to apply fixed labor charges for common services.
              </p>
              {!isAddMode && (
                <Button onClick={() => setIsAddMode(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Add First Job Rate
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {rates.map((rate) => (
              <Card key={rate.id} className={!rate.isActive ? "opacity-60" : ""} data-testid={`rate-${rate.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-semibold">{rate.name}</span>
                        <Badge variant="outline" className="text-primary">
                          {formatRate(rate.defaultRate)}
                        </Badge>
                        {!rate.isActive && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">
                        <span className="font-medium">Keywords:</span>{" "}
                        {rate.keywords.map((kw, i) => (
                          <Badge key={i} variant="secondary" className="mr-1 mb-1 text-xs">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                      {rate.shopOverrides && Object.keys(rate.shopOverrides).length > 0 && (
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Shop overrides:</span>{" "}
                          {Object.entries(rate.shopOverrides).map(([shopId, cents]) => {
                            const shop = SHOPS.find(s => s.id === shopId);
                            return (
                              <span key={shopId} className="mr-2">
                                {shop?.name}: {formatRate(cents)}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditClick(rate)}
                        data-testid={`button-edit-${rate.id}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirmRate(rate)}
                        data-testid={`button-delete-${rate.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>1. Create job rates with keywords that match common job names (e.g., "cabin filter", "wiper blade")</p>
            <p>2. Set a default rate that applies to all shops, or customize per-shop rates</p>
            <p>3. When a job name in Tekmetric contains any of your keywords, the fixed rate applies</p>
            <p>4. This is different from make-based labor rates - these apply a fixed dollar amount, not hourly</p>
            <p className="font-medium text-foreground pt-2">
              Use this for quick services with predictable labor costs across all vehicle types.
            </p>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteConfirmRate} onOpenChange={(open) => !open && setDeleteConfirmRate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job Labor Rate?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the "{deleteConfirmRate?.name}" rate. 
              Jobs matching "{deleteConfirmRate?.keywords.join(", ")}" will no longer have automatic pricing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmRate && deleteMutation.mutate(deleteConfirmRate.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
