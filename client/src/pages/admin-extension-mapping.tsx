import { ArrowLeft, Users, Loader2, CheckCircle2, XCircle, Save, Phone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";

type RCExtension = {
  id: number;
  extensionNumber: string;
  name: string;
  type: string;
  status: string;
  contact?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  };
};

type AppUser = {
  id: string;
  email: string;
  displayName: string | null;
};

type ExtensionMapping = {
  id: number;
  ringcentralExtensionId: string;
  userId: string;
  extensionNumber: string;
  extensionName: string;
};

export default function AdminExtensionMapping() {
  const { toast } = useToast();
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
  });

  const { data: extensions, isLoading: extensionsLoading } = useQuery<RCExtension[]>({
    queryKey: ["/api/ringcentral/extensions"],
    enabled: adminCheck?.isAdmin === true,
  });

  const { data: users, isLoading: usersLoading } = useQuery<AppUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: adminCheck?.isAdmin === true,
  });

  const { data: existingMappings, isLoading: mappingsLoading } = useQuery<ExtensionMapping[]>({
    queryKey: ["/api/ringcentral/mappings"],
    enabled: adminCheck?.isAdmin === true,
  });

  useEffect(() => {
    if (existingMappings) {
      const initialMappings: Record<string, string> = {};
      existingMappings.forEach(mapping => {
        initialMappings[mapping.ringcentralExtensionId] = mapping.userId;
      });
      setMappings(initialMappings);
    }
  }, [existingMappings]);

  const saveMappingsMutation = useMutation({
    mutationFn: async (mappingsToSave: Array<{ extensionId: string; userId: string; extensionNumber: string; extensionName: string }>) => {
      const response = await apiRequest("POST", "/api/ringcentral/mappings", { mappings: mappingsToSave });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to save mappings");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Mappings saved",
        description: "Extension-to-user mappings have been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ringcentral/mappings"] });
      setHasChanges(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleMappingChange = (extensionId: string, userId: string) => {
    setMappings(prev => {
      const updated = { ...prev };
      if (userId === "none") {
        delete updated[extensionId];
      } else {
        updated[extensionId] = userId;
      }
      return updated;
    });
    setHasChanges(true);
  };

  const handleSave = () => {
    if (!extensions) return;
    
    const mappingsToSave = Object.entries(mappings)
      .filter(([_, userId]) => userId)
      .map(([extensionId, userId]) => {
        const ext = extensions.find(e => e.id.toString() === extensionId);
        return {
          extensionId,
          userId,
          extensionNumber: ext?.extensionNumber || "",
          extensionName: ext?.name || "",
        };
      });
    
    saveMappingsMutation.mutate(mappingsToSave);
  };

  const isLoading = adminLoading || extensionsLoading || usersLoading || mappingsLoading;

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!adminCheck?.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <XCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Access Denied</h1>
        <p className="text-muted-foreground">You don't have permission to access this page.</p>
        <Link href="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/settings">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Users className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Extension Mapping</h1>
                <p className="text-xs text-muted-foreground">Link RingCentral extensions to users</p>
              </div>
            </div>
          </div>
          
          {hasChanges && (
            <Button
              onClick={handleSave}
              disabled={saveMappingsMutation.isPending}
              data-testid="button-save-mappings"
            >
              {saveMappingsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          )}
        </div>
      </header>

      <div className="container mx-auto max-w-4xl py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle>RingCentral Extension Mappings</CardTitle>
            <CardDescription>
              Map RingCentral phone extensions to HEART Helper user accounts. 
              This enables per-advisor call tracking and coaching scores.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : extensions && extensions.length > 0 ? (
              <div className="space-y-4">
                <div className="grid gap-4">
                  {extensions.map((ext) => {
                    const currentMapping = mappings[ext.id.toString()];
                    const mappedUser = users?.find(u => u.id === currentMapping);
                    
                    return (
                      <div
                        key={ext.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                        data-testid={`extension-row-${ext.id}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Phone className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{ext.name}</span>
                              <Badge variant="outline">Ext {ext.extensionNumber}</Badge>
                            </div>
                            {ext.contact?.email && (
                              <p className="text-sm text-muted-foreground">{ext.contact.email}</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {currentMapping && (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                          <Select
                            value={currentMapping || "none"}
                            onValueChange={(value) => handleMappingChange(ext.id.toString(), value)}
                          >
                            <SelectTrigger className="w-[220px]" data-testid={`select-user-${ext.id}`}>
                              <SelectValue placeholder="Select user..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Not mapped</SelectItem>
                              {users?.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.displayName || user.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-4 border-t text-sm text-muted-foreground">
                  <p>
                    <strong>{extensions.length}</strong> extensions found • 
                    <strong> {Object.keys(mappings).length}</strong> mapped to users
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">No Extensions Found</h3>
                <p className="text-sm text-muted-foreground">
                  Could not load RingCentral extensions. Check your connection settings.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
