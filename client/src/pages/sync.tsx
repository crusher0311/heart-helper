import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, CheckCircle2, AlertCircle, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SyncPage() {
  const { toast } = useToast();
  const [tekmetricApiKey, setTekmetricApiKey] = useState("");
  const [shopId, setShopId] = useState("469");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!tekmetricApiKey) throw new Error("API key required");
      
      setProgress(0);
      setLogs([]);
      addLog("Starting sync...");

      // Step 1: Fetch repair orders from Tekmetric
      addLog(`Fetching repair orders from shop ${shopId}...`);
      setStatus("Fetching repair orders from Tekmetric...");
      
      const repairOrdersResponse = await fetch(
        `https://shop.tekmetric.com/api/v1/repair-orders?shop=${shopId}`,
        {
          headers: {
            'Authorization': `Bearer ${tekmetricApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!repairOrdersResponse.ok) {
        throw new Error(`Tekmetric API error: ${repairOrdersResponse.status}`);
      }

      const repairOrders = await repairOrdersResponse.json();
      addLog(`Found ${repairOrders.length} repair orders`);
      setProgress(10);

      // Step 2: Get unique vehicle IDs
      const vehicleIds = [...new Set(repairOrders.map((ro: any) => ro.vehicleId).filter(Boolean))];
      addLog(`Found ${vehicleIds.length} unique vehicles`);
      setProgress(20);

      // Step 3: Fetch and import vehicles
      setStatus(`Importing ${vehicleIds.length} vehicles...`);
      let vehiclesImported = 0;

      for (const vehicleId of vehicleIds) {
        try {
          // Fetch vehicle from Tekmetric
          const vehicleResponse = await fetch(
            `https://shop.tekmetric.com/api/v1/vehicles/${vehicleId}`,
            {
              headers: {
                'Authorization': `Bearer ${tekmetricApiKey}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (vehicleResponse.ok) {
            const vehicle = await vehicleResponse.json();
            
            // Import to local database
            await apiRequest("POST", "/api/import/vehicle", vehicle);
            vehiclesImported++;
            
            if (vehiclesImported % 10 === 0) {
              addLog(`Imported ${vehiclesImported}/${vehicleIds.length} vehicles...`);
            }
          }
        } catch (error) {
          addLog(`Failed to import vehicle ${vehicleId}: ${error}`);
        }

        const vehicleProgress = 20 + (vehiclesImported / vehicleIds.length) * 40;
        setProgress(vehicleProgress);
      }

      addLog(`✓ Imported ${vehiclesImported} vehicles`);
      setProgress(60);

      // Step 4: Import repair orders
      setStatus(`Importing ${repairOrders.length} repair orders...`);
      let ordersImported = 0;
      let totalJobsImported = 0;

      for (const repairOrder of repairOrders) {
        try {
          const result: any = await apiRequest("POST", "/api/import/repair-order", repairOrder);
          ordersImported++;
          totalJobsImported += result.jobsImported || 0;

          if (ordersImported % 10 === 0) {
            addLog(`Imported ${ordersImported}/${repairOrders.length} repair orders...`);
          }
        } catch (error) {
          addLog(`Failed to import RO ${repairOrder.id}: ${error}`);
        }

        const orderProgress = 60 + (ordersImported / repairOrders.length) * 40;
        setProgress(orderProgress);
      }

      addLog(`✓ Imported ${ordersImported} repair orders`);
      addLog(`✓ Imported ${totalJobsImported} jobs`);
      setProgress(100);
      setStatus("Sync complete!");

      return {
        vehiclesImported,
        ordersImported,
        totalJobsImported
      };
    },
    onSuccess: (data) => {
      toast({
        title: "Sync completed successfully!",
        description: `Imported ${data.vehiclesImported} vehicles, ${data.ordersImported} repair orders, ${data.totalJobsImported} jobs`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error?.message || "Failed to sync with Tekmetric",
        variant: "destructive",
      });
      addLog(`❌ Error: ${error?.message}`);
      setStatus("Sync failed");
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Tekmetric Sync</h1>
              <p className="text-xs text-muted-foreground">Bulk Import Data</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-6">
          <Alert>
            <Database className="h-4 w-4" />
            <AlertDescription>
              This will fetch all repair orders from your Tekmetric shop and import them into your local search database.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Tekmetric API Configuration</CardTitle>
              <CardDescription>
                Enter your Tekmetric API credentials
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey">Tekmetric API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={tekmetricApiKey}
                  onChange={(e) => setTekmetricApiKey(e.target.value)}
                  placeholder="Enter your Tekmetric API key"
                  data-testid="input-api-key"
                />
                <p className="text-xs text-muted-foreground">
                  Get your API key from Tekmetric Settings → Integrations → API Keys
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shopId">Shop ID</Label>
                <Input
                  id="shopId"
                  value={shopId}
                  onChange={(e) => setShopId(e.target.value)}
                  placeholder="469"
                  data-testid="input-shop-id"
                />
              </div>

              <Button
                onClick={() => syncMutation.mutate()}
                disabled={!tekmetricApiKey || syncMutation.isPending}
                className="w-full"
                size="lg"
                data-testid="button-start-sync"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                {syncMutation.isPending ? "Syncing..." : "Start Sync"}
              </Button>
            </CardContent>
          </Card>

          {syncMutation.isPending && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sync Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{status}</span>
                    <span className="font-mono">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} />
                </div>

                <div className="bg-muted rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs">
                  {logs.map((log, i) => (
                    <div key={i} className="py-1">
                      {log}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {syncMutation.isSuccess && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Sync completed! Your search database is now populated with Tekmetric data.
                Go to the Search page to start finding similar jobs.
              </AlertDescription>
            </Alert>
          )}

          {syncMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {syncMutation.error instanceof Error ? syncMutation.error.message : "Sync failed"}
              </AlertDescription>
            </Alert>
          )}

          {logs.length > 0 && !syncMutation.isPending && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sync Log</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-xs">
                  {logs.map((log, i) => (
                    <div key={i} className="py-1">
                      {log}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
