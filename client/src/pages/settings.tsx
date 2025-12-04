import { Download, Chrome, CheckCircle2, Circle, Sparkles, Search, Send, Zap, Settings as SettingsIcon, XCircle, Loader2, Phone, MessageSquare, FileText, DollarSign, ExternalLink, Headphones, PhoneCall, RefreshCw, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Navigation } from "@/components/navigation";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { ConcernIntakePanel } from "@/components/concern-intake-panel";

type ShopLocation = "NB" | "WM" | "EV";

type ShopInfo = {
  id: ShopLocation;
  name: string;
};

type TekmetricStatus = {
  configured: boolean;
  availableShops: ShopInfo[];
};

type Settings = {
  id: string;
  defaultShopId: ShopLocation | null;
  phoneAnswerScript: string | null;
  salesScriptTraining: string | null;
  updatedAt: string;
};

export default function Settings() {
  const { toast } = useToast();
  const [selectedShop, setSelectedShop] = useState<ShopLocation | null>(null);
  const [phoneScript, setPhoneScript] = useState("");
  const [salesScriptTraining, setSalesScriptTraining] = useState("");
  const [showConcernIntake, setShowConcernIntake] = useState(false);

  const { data: status, isLoading: statusLoading } = useQuery<TekmetricStatus>({
    queryKey: ["/api/tekmetric/status"],
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
  });

  // RingCentral state and queries (admin only)
  const [syncDateFrom, setSyncDateFrom] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [syncDateTo, setSyncDateTo] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const { data: ringcentralTest, isLoading: rcTestLoading, refetch: refetchRcTest } = useQuery<{
    success: boolean;
    message: string;
    accountInfo?: { id: string; mainNumber: string };
  }>({
    queryKey: ["/api/ringcentral/test"],
    enabled: adminCheck?.isAdmin === true,
  });

  const { data: rcExtensions, isLoading: rcExtensionsLoading } = useQuery<Array<{
    id: number;
    extensionNumber: string;
    name: string;
    contact?: { email?: string };
  }>>({
    queryKey: ["/api/ringcentral/extensions"],
    enabled: adminCheck?.isAdmin === true && ringcentralTest?.success === true,
  });

  const syncCallsMutation = useMutation({
    mutationFn: async (params: { dateFrom: string; dateTo: string }) => {
      const response = await apiRequest("POST", "/api/ringcentral/sync", {
        dateFrom: new Date(params.dateFrom).toISOString(),
        dateTo: new Date(params.dateTo + "T23:59:59").toISOString(),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to sync calls");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Call sync complete",
        description: `Synced ${data.stats.synced} calls, skipped ${data.stats.skipped} existing, ${data.stats.errors} errors.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const transcribeMutation = useMutation({
    mutationFn: async (limit: number = 25) => {
      const response = await apiRequest("POST", "/api/ringcentral/smart-transcribe", { limit });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to transcribe calls");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Transcription complete",
        description: `${data.processed} calls processed, ${data.salesCalls} sales calls found. ${data.costSaved} saved.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Transcription failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const backfillSessionIdsMutation = useMutation({
    mutationFn: async (daysBack: number = 90) => {
      const response = await apiRequest("POST", "/api/ringcentral/backfill-session-ids", { daysBack });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to backfill session IDs");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Backfill complete",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Backfill failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (settings?.phoneAnswerScript) {
      setPhoneScript(settings.phoneAnswerScript);
    }
    if (settings?.salesScriptTraining) {
      setSalesScriptTraining(settings.salesScriptTraining);
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { defaultShopId?: ShopLocation; phoneAnswerScript?: string; salesScriptTraining?: string }) => {
      const response = await apiRequest("POST", "/api/settings", data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save settings");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      if (variables.phoneAnswerScript !== undefined) {
        toast({
          title: "Phone script saved",
          description: "Your phone greeting script has been updated.",
        });
      } else if (variables.salesScriptTraining !== undefined) {
        toast({
          title: "Sales script training saved",
          description: "Your example scripts will be used to generate future sales scripts.",
        });
      } else if (variables.defaultShopId !== undefined) {
        toast({
          title: "Settings saved",
          description: "Your default shop location has been updated.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (shopLocation: ShopLocation) => {
      const response = await apiRequest("POST", "/api/tekmetric/test", { shopLocation });
      return response.json();
    },
    onSuccess: (data: { success: boolean }) => {
      if (data.success) {
        toast({
          title: "Connection successful",
          description: "Successfully connected to Tekmetric API.",
        });
      } else {
        toast({
          title: "Connection failed",
          description: "Could not connect to Tekmetric API.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveSettings = () => {
    if (selectedShop) {
      updateSettingsMutation.mutate({ defaultShopId: selectedShop });
    }
  };

  const handleSavePhoneScript = () => {
    updateSettingsMutation.mutate({ phoneAnswerScript: phoneScript });
  };

  const handleSaveSalesScriptTraining = () => {
    updateSettingsMutation.mutate({ salesScriptTraining: salesScriptTraining });
  };

  const handleTestConnection = () => {
    const shopToTest = selectedShop || settings?.defaultShopId;
    if (shopToTest) {
      testConnectionMutation.mutate(shopToTest);
    }
  };

  const currentShop = selectedShop || settings?.defaultShopId;

  const handleDownloadExtension = () => {
    window.location.href = "/api/download-extension";
    toast({
      title: "Download Started",
      description: "The Chrome extension is downloading. Follow the installation steps below.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container mx-auto max-w-4xl py-8 px-4">
        {/* Tekmetric API Configuration */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <SettingsIcon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle>Tekmetric API Integration</CardTitle>
                <CardDescription>
                  Configure your API connection to create estimates directly in Tekmetric
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {statusLoading || settingsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {status?.configured ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span className="text-sm text-muted-foreground">API credentials configured</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-destructive" />
                      <span className="text-sm text-muted-foreground">
                        API credentials not configured. Add TEKMETRIC_API_KEY and shop ID secrets in Tools → Secrets.
                      </span>
                    </>
                  )}
                </div>

                {status?.configured && status.availableShops.length > 0 && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="default-shop">Default Shop Location</Label>
                      <Select
                        value={currentShop || undefined}
                        onValueChange={(value) => setSelectedShop(value as ShopLocation)}
                      >
                        <SelectTrigger id="default-shop" data-testid="select-default-shop">
                          <SelectValue placeholder="Select a shop" />
                        </SelectTrigger>
                        <SelectContent>
                          {status.availableShops.map((shop) => (
                            <SelectItem key={shop.id} value={shop.id}>
                              {shop.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        This shop will be selected by default when creating estimates
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveSettings}
                        disabled={!selectedShop || updateSettingsMutation.isPending}
                        data-testid="button-save-settings"
                      >
                        {updateSettingsMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Save Settings
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleTestConnection}
                        disabled={!currentShop || testConnectionMutation.isPending}
                        data-testid="button-test-connection"
                      >
                        {testConnectionMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Test Connection
                      </Button>
                    </div>
                  </>
                )}

                {status?.configured && status.availableShops.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No shop IDs configured. Add TM_SHOP_ID_NB, TM_SHOP_ID_WM, or TM_SHOP_ID_EV secrets.
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Phone Answer Script Section */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Phone className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle>Phone Answer Script</CardTitle>
                <CardDescription>
                  Customize the greeting shown when taking calls with the Concern Intake tool
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone-script">Phone Greeting Script</Label>
              <Textarea
                id="phone-script"
                placeholder="Thank you for calling HEART Certified Auto Care! My name is [Name], how can I help you today?"
                value={phoneScript}
                onChange={(e) => setPhoneScript(e.target.value)}
                className="min-h-[100px]"
                data-testid="input-phone-script"
              />
              <p className="text-sm text-muted-foreground">
                This script appears at the top of the Concern Intake panel as a reminder
              </p>
            </div>

            <Button
              onClick={handleSavePhoneScript}
              disabled={updateSettingsMutation.isPending}
              data-testid="button-save-phone-script"
            >
              {updateSettingsMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Script
            </Button>
          </CardContent>
        </Card>

        {/* Sales Script Training Section */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle>Sales Script Training</CardTitle>
                <CardDescription>
                  Provide example scripts to train the AI how to generate your sales scripts
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                Add example scripts showing your preferred style. The AI will learn from these examples to generate more relevant and context-aware sales scripts. Include examples for both in-shop conversations and follow-up calls.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="sales-script-training">Example Scripts & Guidelines</Label>
              <Textarea
                id="sales-script-training"
                placeholder={`Example in-shop script:
"Hi [Customer]! Thanks for bringing in your [Year Make Model]. I just sent over your digital inspection, did you get it? Great! We're recommending [service] to keep you safe. Your total is $XX.XX. Would you like us to go ahead with that?"

Example follow-up call:
"Hi [Customer], this is [Name] from HEART Certified Auto Care. I'm calling to follow up on the digital inspection we sent for your [Year Make Model]. Did you get a chance to look it over? We recommend [service] for safety. The total would be $XX.XX. When would be a good time to schedule?"

Guidelines:
- Only mention the 3-year warranty for major repairs (brakes, engine, transmission)
- Don't mention warranty for tires, oil changes, or seasonal maintenance
- Keep it conversational and friendly`}
                value={salesScriptTraining}
                onChange={(e) => setSalesScriptTraining(e.target.value)}
                className="min-h-[200px]"
                data-testid="input-sales-script-training"
              />
              <p className="text-sm text-muted-foreground">
                These examples help the AI understand your preferred tone, what to include, and when to mention warranties
              </p>
            </div>

            <Button
              onClick={handleSaveSalesScriptTraining}
              disabled={updateSettingsMutation.isPending}
              data-testid="button-save-sales-script-training"
            >
              {updateSettingsMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Training
            </Button>
          </CardContent>
        </Card>

        {/* Concern Intake Demo Section */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle>AI Concern Intake</CardTitle>
                <CardDescription>
                  Use AI to gather diagnostic information during customer calls
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                The Concern Intake tool helps you ask the right follow-up questions when customers call about vehicle problems. It generates diagnostic questions and formats the conversation into a clean summary for the repair order.
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => setShowConcernIntake(!showConcernIntake)}
              variant={showConcernIntake ? "secondary" : "default"}
              data-testid="button-toggle-concern-intake"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              {showConcernIntake ? "Hide Demo" : "Try Concern Intake"}
            </Button>

            {showConcernIntake && (
              <div className="border rounded-lg p-4 mt-4">
                <ConcernIntakePanel
                  phoneAnswerScript={settings?.phoneAnswerScript || undefined}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chrome Extension Section */}
        <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Chrome className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle>Tekmetric Integration</CardTitle>
              <CardDescription>
                Install the Chrome extension to send jobs directly to Tekmetric estimates
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              The Chrome extension adds two powerful features: (1) A "Check History" button on Tekmetric repair orders that instantly searches for similar jobs, and (2) Auto-fill for estimate forms with labor items and parts from your search results.
            </AlertDescription>
          </Alert>

          <Button 
            onClick={handleDownloadExtension}
            size="lg"
            className="w-full sm:w-auto"
            data-testid="button-download-extension"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Chrome Extension
          </Button>

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                1
              </span>
              Installation Steps
            </h3>
            
            <div className="space-y-3 ml-8">
              <div className="flex items-start gap-3">
                <Circle className="w-4 h-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="font-medium">Download the extension</p>
                  <p className="text-sm text-muted-foreground">
                    Click the download button above to get the extension zip file
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Circle className="w-4 h-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="font-medium">Extract the zip file</p>
                  <p className="text-sm text-muted-foreground">
                    Unzip the downloaded file to a folder on your computer
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Circle className="w-4 h-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="font-medium">Open Chrome Extensions</p>
                  <p className="text-sm text-muted-foreground">
                    Go to <code className="px-1 py-0.5 bg-muted rounded text-xs">chrome://extensions/</code> in your browser
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Circle className="w-4 h-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="font-medium">Enable Developer Mode</p>
                  <p className="text-sm text-muted-foreground">
                    Toggle "Developer mode" in the top right corner
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Circle className="w-4 h-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="font-medium">Load unpacked extension</p>
                  <p className="text-sm text-muted-foreground">
                    Click "Load unpacked" and select the extracted folder
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Circle className="w-4 h-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="font-medium">Configure app URL</p>
                  <p className="text-sm text-muted-foreground">
                    Click the extension icon, copy this page's URL from your browser, paste it in the Settings section, and click Save
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 mt-1 text-green-600" />
                <div>
                  <p className="font-medium text-green-600">You're all set!</p>
                  <p className="text-sm text-muted-foreground">
                    You'll see "Tekmetric Job Importer" in your extensions list
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                2
              </span>
              How to Use
            </h3>
            
            <div className="space-y-3 ml-8">
              <div className="flex items-start gap-3">
                <Search className="w-5 h-5 mt-0.5 text-primary" />
                <div>
                  <p className="font-medium">Quick search from Tekmetric</p>
                  <p className="text-sm text-muted-foreground">
                    On any Tekmetric repair order page, click the "Check History" button to instantly search for similar jobs with pre-filled vehicle information
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Send className="w-5 h-5 mt-0.5 text-primary" />
                <div>
                  <p className="font-medium">Send to Tekmetric</p>
                  <p className="text-sm text-muted-foreground">
                    After finding a similar job, click "Send to Tekmetric" in the job detail panel
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 mt-0.5 text-primary" />
                <div>
                  <p className="font-medium">Auto-fill estimate</p>
                  <p className="text-sm text-muted-foreground">
                    Open a Tekmetric estimate page - the extension automatically fills in labor items and parts
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-2">Need Help?</h3>
            <p className="text-sm text-muted-foreground">
              Make sure you're on a Tekmetric estimate page when using the extension. 
              Check the extension popup (click the extension icon) to see pending job status.
            </p>
          </div>
        </CardContent>
        </Card>

        {/* Labor Rates Section - Admin Only */}
        {adminCheck?.isAdmin && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Labor Rate Groups</CardTitle>
                  <CardDescription>
                    Configure automatic labor rates by vehicle make and shop location
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  Labor rate groups automatically update pricing when technicians open repair orders based on the vehicle make. Configure rates for Euro, Domestic, Asian, and other vehicle categories per shop location.
                </AlertDescription>
              </Alert>

              <Link href="/admin/labor-rates">
                <Button data-testid="button-manage-labor-rates">
                  <DollarSign className="w-4 h-4 mr-2" />
                  Manage Labor Rates
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Call Coaching Criteria Section - Admin Only */}
        {adminCheck?.isAdmin && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Headphones className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Call Coaching Criteria</CardTitle>
                  <CardDescription>
                    Configure the 10-point grading system for call evaluations
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  Call coaching criteria define what the AI looks for when scoring recorded calls. Customize criteria names, descriptions, weights, and AI prompts for each scoring category.
                </AlertDescription>
              </Alert>

              <Link href="/admin/coaching-criteria">
                <Button data-testid="button-manage-coaching-criteria">
                  <Headphones className="w-4 h-4 mr-2" />
                  Manage Coaching Criteria
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* RingCentral Call Sync Section - Admin Only */}
        {adminCheck?.isAdmin && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <PhoneCall className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle>RingCentral Call Sync</CardTitle>
                  <CardDescription>
                    Sync call recordings from RingCentral for AI-powered coaching
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Connection Status */}
              {rcTestLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Testing RingCentral connection...</span>
                </div>
              ) : ringcentralTest?.success ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-sm text-muted-foreground">
                    Connected to RingCentral • Account: {ringcentralTest.accountInfo?.mainNumber}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-destructive" />
                  <span className="text-sm text-muted-foreground">
                    {ringcentralTest?.message || "RingCentral not configured. Add RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET, and RINGCENTRAL_JWT_TOKEN secrets."}
                  </span>
                </div>
              )}

              {ringcentralTest?.success && (
                <>
                  {/* Extensions Summary */}
                  {rcExtensionsLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading extensions...</span>
                    </div>
                  ) : rcExtensions && rcExtensions.length > 0 ? (
                    <Alert>
                      <Users className="h-4 w-4" />
                      <AlertDescription>
                        Found {rcExtensions.length} user extensions in RingCentral. 
                        Map extensions to HEART Helper users to enable per-advisor call tracking.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {/* Sync Controls */}
                  <div className="border rounded-lg p-4 space-y-4">
                    <h4 className="font-medium">Sync Call Recordings</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="sync-date-from">From Date</Label>
                        <input
                          type="date"
                          id="sync-date-from"
                          value={syncDateFrom}
                          onChange={(e) => setSyncDateFrom(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          data-testid="input-sync-date-from"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sync-date-to">To Date</Label>
                        <input
                          type="date"
                          id="sync-date-to"
                          value={syncDateTo}
                          onChange={(e) => setSyncDateTo(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          data-testid="input-sync-date-to"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={() => syncCallsMutation.mutate({ dateFrom: syncDateFrom, dateTo: syncDateTo })}
                      disabled={syncCallsMutation.isPending}
                      data-testid="button-sync-calls"
                    >
                      {syncCallsMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Sync Calls from RingCentral
                    </Button>
                  </div>

                  {/* Transcribe Controls */}
                  <div className="border rounded-lg p-4 space-y-4">
                    <h4 className="font-medium">Smart Transcription (Whisper AI)</h4>
                    <p className="text-sm text-muted-foreground">
                      Transcribe call recordings using OpenAI Whisper. Uses smart sampling to detect sales calls 
                      and only fully transcribe customer conversations, saving ~80% on transcription costs.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => transcribeMutation.mutate(10)}
                        disabled={transcribeMutation.isPending}
                        variant="outline"
                        data-testid="button-transcribe-10"
                      >
                        {transcribeMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4 mr-2" />
                        )}
                        Transcribe 10 Calls
                      </Button>
                      <Button
                        onClick={() => transcribeMutation.mutate(25)}
                        disabled={transcribeMutation.isPending}
                        data-testid="button-transcribe-25"
                      >
                        {transcribeMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4 mr-2" />
                        )}
                        Transcribe 25 Calls
                      </Button>
                    </div>
                  </div>

                  {/* Multi-Leg Call Linking */}
                  <div className="border rounded-lg p-4 space-y-4">
                    <h4 className="font-medium">Link Multi-Leg Calls</h4>
                    <p className="text-sm text-muted-foreground">
                      Backfill session IDs for existing calls to link related call segments together 
                      (holds, transfers). This enables viewing all parts of a conversation as a connected session.
                    </p>
                    <Button
                      onClick={() => backfillSessionIdsMutation.mutate(90)}
                      disabled={backfillSessionIdsMutation.isPending}
                      variant="outline"
                      data-testid="button-backfill-session-ids"
                    >
                      {backfillSessionIdsMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Link Calls from Last 90 Days
                    </Button>
                  </div>

                  {/* Extension Mapping Link */}
                  <div className="pt-4 border-t">
                    <Link href="/admin/extension-mapping">
                      <Button variant="outline" data-testid="button-manage-extension-mapping">
                        <Users className="w-4 h-4 mr-2" />
                        Manage Extension Mappings
                        <ExternalLink className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
