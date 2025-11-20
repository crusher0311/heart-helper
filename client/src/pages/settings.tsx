import { Download, Chrome, CheckCircle2, Circle, ArrowLeft, Sparkles, Search, Send, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function Settings() {
  const { toast } = useToast();

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
                <h1 className="text-lg font-semibold">Settings</h1>
                <p className="text-xs text-muted-foreground">Configure your tools</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-4xl py-8 px-4">
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
