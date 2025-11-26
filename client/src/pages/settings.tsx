import { Download, Chrome, CheckCircle2, Circle, ArrowLeft, Sparkles, Search, Send, Zap, Settings as SettingsIcon, XCircle, Loader2, Phone, MessageSquare, FileText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">HEART Helper Settings</h1>
                <p className="text-xs text-muted-foreground">Configure your tools</p>
              </div>
            </div>
          </div>
        </div>
      </header>

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
      </div>
    </div>
  );
}
