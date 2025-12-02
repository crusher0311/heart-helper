import { ArrowLeft, DollarSign, Plus, Trash2, Edit2, Loader2, Save, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type LaborRateGroup = {
  id: string;
  shopId: string;
  name: string;
  makes: string[];
  laborRate: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

const SHOPS = [
  { id: "ALL", name: "All Locations" },
  { id: "NB", name: "Northbrook" },
  { id: "WM", name: "Wilmette" },
  { id: "EV", name: "Evanston" },
];

export default function AdminLaborRates() {
  const { toast } = useToast();
  const [editingGroup, setEditingGroup] = useState<LaborRateGroup | null>(null);
  const [deleteConfirmGroup, setDeleteConfirmGroup] = useState<LaborRateGroup | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  
  const [formData, setFormData] = useState({
    shopId: "ALL",
    name: "",
    makes: "",
    laborRate: "",
  });

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
  });

  const { data: groups, isLoading } = useQuery<LaborRateGroup[]>({
    queryKey: ["/api/admin/labor-rate-groups"],
    enabled: adminCheck?.isAdmin === true,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { shopId: string; name: string; makes: string[]; laborRate: number }) => {
      const response = await apiRequest("POST", "/api/admin/labor-rate-groups", data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create group");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/labor-rate-groups"] });
      toast({ title: "Group created", description: "Labor rate group has been created." });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ shopId: string; name: string; makes: string[]; laborRate: number }> }) => {
      const response = await apiRequest("PUT", `/api/admin/labor-rate-groups/${id}`, data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update group");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/labor-rate-groups"] });
      toast({ title: "Group updated", description: "Labor rate group has been updated." });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/labor-rate-groups/${id}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete group");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/labor-rate-groups"] });
      toast({ title: "Group deleted", description: "Labor rate group has been deleted." });
      setDeleteConfirmGroup(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ shopId: "ALL", name: "", makes: "", laborRate: "" });
    setEditingGroup(null);
    setIsAddMode(false);
  };

  const handleEditClick = (group: LaborRateGroup) => {
    setEditingGroup(group);
    setIsAddMode(false);
    setFormData({
      shopId: group.shopId,
      name: group.name,
      makes: group.makes.join(", "),
      laborRate: (group.laborRate / 100).toFixed(2),
    });
  };

  const handleSubmit = () => {
    const makesArray = formData.makes
      .split(",")
      .map(m => m.trim())
      .filter(m => m.length > 0);

    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Group name is required", variant: "destructive" });
      return;
    }
    if (makesArray.length === 0) {
      toast({ title: "Error", description: "At least one vehicle make is required", variant: "destructive" });
      return;
    }
    if (!formData.laborRate || isNaN(parseFloat(formData.laborRate))) {
      toast({ title: "Error", description: "Valid labor rate is required", variant: "destructive" });
      return;
    }

    const laborRateCents = Math.round(parseFloat(formData.laborRate) * 100);

    if (editingGroup) {
      updateMutation.mutate({
        id: editingGroup.id,
        data: {
          shopId: formData.shopId,
          name: formData.name.trim(),
          makes: makesArray,
          laborRate: laborRateCents,
        },
      });
    } else {
      createMutation.mutate({
        shopId: formData.shopId,
        name: formData.name.trim(),
        makes: makesArray,
        laborRate: laborRateCents,
      });
    }
  };

  const getShopName = (shopId: string) => {
    return SHOPS.find(s => s.id === shopId)?.name || shopId;
  };

  const formatRate = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}/hr`;
  };

  const groupsByShop = groups?.reduce((acc, group) => {
    if (!acc[group.shopId]) acc[group.shopId] = [];
    acc[group.shopId].push(group);
    return acc;
  }, {} as Record<string, LaborRateGroup[]>) || {};

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
              <DollarSign className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">Admin Access Required</h2>
              <p className="text-muted-foreground">
                You don't have permission to manage labor rates.
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
            <DollarSign className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-labor-rates-title">Labor Rate Groups</h1>
              <p className="text-muted-foreground">Manage automatic labor rates by vehicle make and location</p>
            </div>
          </div>
          {!isAddMode && !editingGroup && (
            <Button onClick={() => setIsAddMode(true)} data-testid="button-add-group">
              <Plus className="h-4 w-4 mr-2" />
              Add Group
            </Button>
          )}
        </div>

        {/* Add/Edit Form */}
        {(isAddMode || editingGroup) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{editingGroup ? "Edit Group" : "Add New Group"}</CardTitle>
              <CardDescription>
                {editingGroup 
                  ? "Update the labor rate group settings" 
                  : "Create a new labor rate group for automatic rate assignment"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shopId">Location</Label>
                  <Select value={formData.shopId} onValueChange={(v) => setFormData({ ...formData, shopId: v })}>
                    <SelectTrigger data-testid="select-shop">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {SHOPS.map((shop) => (
                        <SelectItem key={shop.id} value={shop.id}>{shop.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Group Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Euro, Domestic, Asian"
                    data-testid="input-group-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="makes">Vehicle Makes (comma-separated)</Label>
                <Input
                  id="makes"
                  value={formData.makes}
                  onChange={(e) => setFormData({ ...formData, makes: e.target.value })}
                  placeholder="e.g., BMW, Mercedes-Benz, Audi, Volkswagen"
                  data-testid="input-makes"
                />
                <p className="text-xs text-muted-foreground">
                  Enter all vehicle makes that should use this labor rate
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="laborRate">Labor Rate ($/hr)</Label>
                <Input
                  id="laborRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.laborRate}
                  onChange={(e) => setFormData({ ...formData, laborRate: e.target.value })}
                  placeholder="e.g., 175.00"
                  data-testid="input-labor-rate"
                />
              </div>
              <div className="flex gap-3">
                <Button 
                  onClick={handleSubmit} 
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-group"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" /> {editingGroup ? "Update" : "Create"} Group</>
                  )}
                </Button>
                <Button variant="outline" onClick={resetForm} data-testid="button-cancel">
                  <X className="h-4 w-4 mr-2" /> Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Groups List */}
        {isLoading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading labor rate groups...</p>
            </CardContent>
          </Card>
        ) : Object.keys(groupsByShop).length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <DollarSign className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h2 className="text-lg font-semibold mb-2">No Labor Rate Groups</h2>
              <p className="text-muted-foreground mb-4">
                Create labor rate groups to automatically set rates when opening repair orders.
              </p>
              {!isAddMode && (
                <Button onClick={() => setIsAddMode(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Add First Group
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupsByShop).map(([shopId, shopGroups]) => (
              <Card key={shopId}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Badge variant={shopId === "ALL" ? "default" : "secondary"}>{getShopName(shopId)}</Badge>
                    <span className="text-sm text-muted-foreground font-normal">
                      {shopGroups.length} group{shopGroups.length !== 1 ? 's' : ''}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {shopGroups.map((group) => (
                    <div 
                      key={group.id} 
                      className="flex items-start gap-4 p-4 rounded-lg bg-muted"
                      data-testid={`group-${group.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold">{group.name}</span>
                          <Badge variant="outline" className="text-primary">
                            {formatRate(group.laborRate)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium">Makes:</span> {group.makes.join(", ")}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEditClick(group)}
                          data-testid={`button-edit-${group.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirmGroup(group)}
                          data-testid={`button-delete-${group.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* How it works */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>1. Create labor rate groups by vehicle make (e.g., "Euro" for BMW, Mercedes, Audi)</p>
            <p>2. Assign each group to a specific location or "All Locations" for company-wide rates</p>
            <p>3. When a technician opens a repair order in Tekmetric, the extension automatically detects the vehicle make</p>
            <p>4. If the make matches a group, the labor rate is updated automatically</p>
            <p className="font-medium text-foreground pt-2">
              Rates set here apply to all users at that location - no individual setup needed.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmGroup} onOpenChange={(open) => !open && setDeleteConfirmGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Labor Rate Group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the "{deleteConfirmGroup?.name}" group. 
              Technicians will no longer have automatic rate updates for {deleteConfirmGroup?.makes.join(", ")}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmGroup && deleteMutation.mutate(deleteConfirmGroup.id)}
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
