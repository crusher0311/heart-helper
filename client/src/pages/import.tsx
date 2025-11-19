import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Database, FileJson, Code } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ImportPage() {
  const { toast } = useToast();
  const [vehicleJson, setVehicleJson] = useState("");
  const [repairOrderJson, setRepairOrderJson] = useState("");

  const vehicleMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/import/vehicle", data);
    },
    onSuccess: () => {
      toast({
        title: "Vehicle imported successfully",
        description: "Vehicle data has been added to the database",
      });
      setVehicleJson("");
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error?.message || "Failed to import vehicle",
        variant: "destructive",
      });
    },
  });

  const repairOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/import/repair-order", data);
    },
    onSuccess: (data: any) => {
      toast({
        title: "Repair order imported successfully",
        description: `Imported ${data.jobsImported || 0} jobs`,
      });
      setRepairOrderJson("");
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error?.message || "Failed to import repair order",
        variant: "destructive",
      });
    },
  });

  const handleVehicleImport = () => {
    try {
      const data = JSON.parse(vehicleJson);
      vehicleMutation.mutate(data);
    } catch (error) {
      toast({
        title: "Invalid JSON",
        description: "Please enter valid JSON data",
        variant: "destructive",
      });
    }
  };

  const handleRepairOrderImport = () => {
    try {
      const data = JSON.parse(repairOrderJson);
      repairOrderMutation.mutate(data);
    } catch (error) {
      toast({
        title: "Invalid JSON",
        description: "Please enter valid JSON data",
        variant: "destructive",
      });
    }
  };

  const vehicleExample = `{
  "id": 127646828,
  "make": "Ford",
  "model": "F-150",
  "year": 2012,
  "engine": "5.0L V8",
  "vin": "1FTFW1ET8CFA12345",
  "customerId": 89025969
}`;

  const repairOrderExample = `{
  "id": 274781172,
  "repairOrderNumber": 141258,
  "shopId": 469,
  "vehicleId": 127646828,
  "customerId": 89025969,
  "technicianId": 4175,
  "serviceWriterId": 4156,
  "repairOrderStatus": { "name": "Posted" },
  "color": "#77909C",
  "milesIn": 80594,
  "milesOut": 80594,
  "completedDate": "2025-11-19T21:16:01.000Z",
  "postedDate": "2025-11-19T21:16:33.000Z",
  "laborSales": 32083,
  "partsSales": 13318,
  "totalSales": 48998,
  "jobs": [{
    "id": 937418827,
    "name": "FRONT STRUT ASSEMBLIES & SWAY BAR LINKS",
    "jobCategoryName": "SUSPENSION",
    "authorized": false,
    "selected": true,
    "laborHours": "3.50",
    "partsTotal": 97350,
    "laborTotal": 80455,
    "subtotal": 177805,
    "createdDate": "2025-11-19T15:02:40.000Z",
    "labor": [{
      "id": 748678951,
      "name": "REMOVE & REPLACE FRONT STRUT ASSEMBLIES",
      "rate": 22987,
      "hours": "3.50",
      "technicianId": 4175
    }],
    "parts": [{
      "id": 861699868,
      "quantity": 1,
      "brand": "KYB",
      "name": "Suspension Strut Assembly",
      "partNumber": "SR4176",
      "cost": 19853,
      "retail": 39853,
      "partType": { "name": "Part" },
      "partStatus": { "name": "Quoted" }
    }]
  }]
}`;

  const curlVehicle = `curl -X POST https://your-app.replit.dev/api/import/vehicle \\
  -H "Content-Type: application/json" \\
  -d '${vehicleExample.replace(/\n/g, " ").replace(/\s+/g, " ")}'`;

  const curlRepairOrder = `curl -X POST https://your-app.replit.dev/api/import/repair-order \\
  -H "Content-Type: application/json" \\
  -d @repair-order.json`;

  const nodeExample = `// Import from your Tekmetric integration
const fetch = require('node-fetch');

// 1. Fetch vehicle from Tekmetric
const vehicle = await tekmetricAPI.get('/api/v1/vehicles/127646828');

// 2. Import to search database
await fetch('https://your-app.replit.dev/api/import/vehicle', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(vehicle)
});

// 3. Fetch and import repair orders
const repairOrder = await tekmetricAPI.get('/api/v1/repair-orders/274781172');
await fetch('https://your-app.replit.dev/api/import/repair-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(repairOrder)
});`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Database className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Data Import</h1>
              <p className="text-xs text-muted-foreground">Import Tekmetric Data</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Import vehicles <strong>before</strong> repair orders. Repair orders reference vehicle IDs.
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="ui" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="ui">
                <FileJson className="w-4 h-4 mr-2" />
                Import UI
              </TabsTrigger>
              <TabsTrigger value="api">
                <Code className="w-4 h-4 mr-2" />
                API Docs
              </TabsTrigger>
              <TabsTrigger value="code">
                <Code className="w-4 h-4 mr-2" />
                Code Examples
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ui" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Vehicle Import */}
                <Card>
                  <CardHeader>
                    <CardTitle>Import Vehicle</CardTitle>
                    <CardDescription>
                      Paste Tekmetric vehicle JSON data
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      value={vehicleJson}
                      onChange={(e) => setVehicleJson(e.target.value)}
                      placeholder={vehicleExample}
                      className="font-mono text-xs h-64"
                      data-testid="input-vehicle-json"
                    />
                    <Button
                      onClick={handleVehicleImport}
                      disabled={!vehicleJson || vehicleMutation.isPending}
                      className="w-full"
                      data-testid="button-import-vehicle"
                    >
                      {vehicleMutation.isPending ? "Importing..." : "Import Vehicle"}
                    </Button>
                    {vehicleMutation.isSuccess && (
                      <Alert>
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertDescription>Vehicle imported successfully!</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>

                {/* Repair Order Import */}
                <Card>
                  <CardHeader>
                    <CardTitle>Import Repair Order</CardTitle>
                    <CardDescription>
                      Paste Tekmetric repair order JSON data
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      value={repairOrderJson}
                      onChange={(e) => setRepairOrderJson(e.target.value)}
                      placeholder={repairOrderExample}
                      className="font-mono text-xs h-64"
                      data-testid="input-repair-order-json"
                    />
                    <Button
                      onClick={handleRepairOrderImport}
                      disabled={!repairOrderJson || repairOrderMutation.isPending}
                      className="w-full"
                      data-testid="button-import-repair-order"
                    >
                      {repairOrderMutation.isPending ? "Importing..." : "Import Repair Order"}
                    </Button>
                    {repairOrderMutation.isSuccess && (
                      <Alert>
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertDescription>
                          Repair order imported with {(repairOrderMutation.data as any)?.jobsImported || 0} jobs!
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="api" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>API Endpoints</CardTitle>
                  <CardDescription>
                    Use these endpoints from your Tekmetric integration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="font-semibold mb-2">POST /api/import/vehicle</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Import a single vehicle record. Required before importing repair orders.
                    </p>
                    <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                      <code>{curlVehicle}</code>
                    </pre>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">POST /api/import/repair-order</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Import a repair order with all jobs, labor items, and parts.
                    </p>
                    <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                      <code>{curlRepairOrder}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="code" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Integration Example</CardTitle>
                  <CardDescription>
                    Use this code in your existing Tekmetric integration app
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                    <code>{nodeExample}</code>
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Bulk Import Strategy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <h4 className="font-semibold mb-1">1. Get Unique Vehicle IDs</h4>
                    <p className="text-muted-foreground">
                      Query your Tekmetric repair orders to get all unique vehicleId values
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">2. Fetch & Import Vehicles</h4>
                    <p className="text-muted-foreground">
                      For each vehicleId, fetch from Tekmetric API and POST to /api/import/vehicle
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">3. Import Repair Orders</h4>
                    <p className="text-muted-foreground">
                      Fetch repair orders with jobs/labor/parts and POST to /api/import/repair-order
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
