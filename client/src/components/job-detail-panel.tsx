import { Copy, Check, Calendar, Gauge, FileText, Send, Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { JobWithDetails } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  updatedAt: string;
};

interface JobDetailPanelProps {
  job: JobWithDetails;
  matchScore?: number;
  repairOrderId?: string;
}

function formatCurrency(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function JobDetailPanel({ job, matchScore, repairOrderId }: JobDetailPanelProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedShop, setSelectedShop] = useState<ShopLocation | null>(null);

  const vehicle = job.vehicle;
  const repairOrder = job.repairOrder;

  const { data: status } = useQuery<TekmetricStatus>({
    queryKey: ["/api/tekmetric/status"],
  });

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const createEstimateMutation = useMutation({
    mutationFn: async (shopLocation: ShopLocation) => {
      const response = await apiRequest("POST", "/api/tekmetric/create-estimate", {
        jobId: job.id,
        shopLocation,
        repairOrderId,
      });
      return await response.json() as { repairOrderId: string; url: string };
    },
    onSuccess: (data: { repairOrderId: string; url: string }) => {
      toast({
        title: repairOrderId ? "Job added to repair order" : "Estimate created",
        description: (
          <div className="flex items-center gap-2">
            <span>Created in Tekmetric</span>
            <a 
              href={data.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary underline flex items-center gap-1"
            >
              Open <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ),
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating estimate",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const refreshPricingMutation = useMutation({
    mutationFn: async (shopLocation: ShopLocation) => {
      const partNumbers = job.parts
        .map(part => part.partNumber)
        .filter((pn): pn is string => !!pn);

      if (partNumbers.length === 0) {
        return {};
      }

      const response = await apiRequest("POST", "/api/tekmetric/refresh-pricing", {
        partNumbers,
        shopLocation,
      });
      
      return await response.json() as Record<string, { cost: number; retail: number }>;
    },
    onSuccess: (data: Record<string, { cost: number; retail: number }>) => {
      const updatedCount = Object.keys(data).length;
      if (updatedCount === 0) {
        toast({
          title: "No pricing updates",
          description: "Could not find current pricing for any parts",
        });
      } else {
        toast({
          title: "Pricing refreshed",
          description: `Retrieved current pricing for ${updatedCount} part${updatedCount === 1 ? '' : 's'}. Note: Prices shown are historical from the original job.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error refreshing pricing",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const shopToUse = selectedShop || settings?.defaultShopId;
  
  const partNumbersCount = job.parts.filter(part => !!part.partNumber).length;
  const canRefreshPricing = status?.configured && shopToUse && partNumbersCount > 0;

  const handleCopyToClipboard = () => {
    const laborDetails = job.laborItems
      .map((item) => `${item.name}: ${item.hours}h @ ${formatCurrency(item.rate)}/h`)
      .join("\n");

    const partsDetails = job.parts
      .map((item) => `${item.quantity}x ${item.brand || ""} ${item.name} (${item.partNumber || "N/A"}): ${formatCurrency(item.retail)}`)
      .join("\n");

    const text = `
JOB: ${job.name}
${vehicle ? `VEHICLE: ${vehicle.year} ${vehicle.make} ${vehicle.model}` : ""}

LABOR:
${laborDetails}
Total Labor: ${formatCurrency(job.laborTotal)} (${job.laborHours} hours)

PARTS:
${partsDetails}
Total Parts: ${formatCurrency(job.partsTotal)}

TOTAL: ${formatCurrency(job.subtotal)}
`.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({
      title: "Copied to clipboard",
      description: "Job details copied successfully",
    });

    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToTekmetric = () => {
    setSending(true);

    const jobData = {
      action: "SEND_TO_TEKMETRIC",
      payload: {
        jobName: job.name,
        vehicle: vehicle ? {
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          engine: vehicle.engine,
          vin: vehicle.vin,
        } : null,
        laborItems: job.laborItems.map((item) => ({
          name: item.name,
          hours: Number(item.hours),
          rate: item.rate / 100,
        })),
        parts: job.parts.map((part) => ({
          name: part.name,
          brand: part.brand,
          partNumber: part.partNumber,
          quantity: part.quantity,
          cost: (part.cost || 0) / 100,
          retail: (part.retail || 0) / 100,
        })),
        totals: {
          labor: job.laborTotal / 100,
          parts: job.partsTotal / 100,
          total: job.subtotal / 100,
        },
      },
    };

    // Debug logging
    console.log('[HEART Helper Web] Sending job data to extension:', {
      jobName: jobData.payload.jobName,
      laborItems: jobData.payload.laborItems.length,
      parts: jobData.payload.parts.length,
      origin: window.location.origin,
    });

    // Try to send via Chrome extension (cross-tab)
    window.postMessage(jobData, window.location.origin);

    toast({
      title: "Sent to extension",
      description: repairOrderId 
        ? `Job will be added to RO #${repairOrderId}. Switch back to the Tekmetric tab.`
        : "Switch to your Tekmetric repair order tab to see the job auto-fill",
    });

    setTimeout(() => setSending(false), 2000);
  };

  const handleViewInTekmetric = async () => {
    if (!job.repairOrderId) return;
    
    try {
      const response = await fetch(`/api/tekmetric/ro-url/${job.repairOrderId}`);
      const data = await response.json();
      
      if (response.ok && data.url) {
        window.open(data.url, '_blank');
      } else {
        toast({
          title: "Error",
          description: "Could not generate Tekmetric URL",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to open Tekmetric RO",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4 sticky top-4" data-testid="job-detail-panel">
      {/* Vehicle Summary */}
      {vehicle && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Vehicle Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Vehicle</p>
              <p className="font-medium" data-testid="text-vehicle-info">
                {vehicle.year} {vehicle.make} {vehicle.model}
              </p>
            </div>
            {vehicle.engine && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Engine</p>
                <p className="font-mono text-sm">{vehicle.engine}</p>
              </div>
            )}
            {repairOrder && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Completed
                  </p>
                  <p className="text-sm font-medium">{formatDate(repairOrder.completedDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Gauge className="w-3 h-3" />
                    Mileage
                  </p>
                  <p className="text-sm font-mono font-semibold">
                    {(repairOrder as any).milesIn?.toLocaleString() || "N/A"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Job Info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold">Job Details</CardTitle>
            {matchScore !== undefined && (
              <Badge variant="default" className="font-mono font-bold">
                {matchScore}% Match
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Job Name</p>
            <p className="font-medium" data-testid="text-job-name-detail">
              {job.name}
            </p>
          </div>
          {job.jobCategoryName && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Category</p>
              <Badge variant="secondary">{job.jobCategoryName}</Badge>
            </div>
          )}
          {job.note && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Notes
              </p>
              <p className="text-sm">{job.note}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Labor Breakdown */}
      {job.laborItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Labor</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs text-right">Hours</TableHead>
                  <TableHead className="text-xs text-right">Rate</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.laborItems.map((item) => (
                  <TableRow key={item.id} data-testid={`row-labor-${item.id}`}>
                    <TableCell className="text-sm">{item.name}</TableCell>
                    <TableCell className="text-sm font-mono font-semibold text-right">
                      {Number(item.hours).toFixed(1)}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-right">
                      {formatCurrency(item.rate)}
                    </TableCell>
                    <TableCell className="text-sm font-mono font-semibold text-right">
                      {formatCurrency(item.rate * Number(item.hours))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-between items-center pt-3 border-t mt-2">
              <span className="text-sm font-medium">Labor Total</span>
              <span className="font-mono font-bold text-base" data-testid="text-labor-total">
                {formatCurrency(job.laborTotal)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parts List */}
      {job.parts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Parts</CardTitle>
              {canRefreshPricing && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => shopToUse && refreshPricingMutation.mutate(shopToUse)}
                  disabled={refreshPricingMutation.isPending}
                  data-testid="button-refresh-pricing"
                  title="Fetch current Tekmetric pricing for parts with part numbers"
                >
                  {refreshPricingMutation.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  Refresh
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Part</TableHead>
                  <TableHead className="text-xs text-center">Qty</TableHead>
                  <TableHead className="text-xs text-right">Retail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.parts.map((part) => (
                  <TableRow key={part.id} data-testid={`row-part-${part.id}`}>
                    <TableCell className="text-sm">
                      <div>
                        <p className="font-medium">{part.name}</p>
                        {part.brand && (
                          <p className="text-xs text-muted-foreground">{part.brand}</p>
                        )}
                        {part.partNumber && (
                          <p className="text-xs font-mono text-muted-foreground">
                            {part.partNumber}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-mono font-semibold text-center">
                      {part.quantity}
                    </TableCell>
                    <TableCell className="text-sm font-mono font-semibold text-right">
                      {formatCurrency((part.retail || 0) * (part.quantity || 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-between items-center pt-3 border-t mt-2">
              <span className="text-sm font-medium">Parts Total</span>
              <span className="font-mono font-bold text-base" data-testid="text-parts-total">
                {formatCurrency(job.partsTotal)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grand Total */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Labor</span>
              <span className="font-mono">{formatCurrency(job.laborTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Parts</span>
              <span className="font-mono">{formatCurrency(job.partsTotal)}</span>
            </div>
            {(job.feeTotal || 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fees</span>
                <span className="font-mono">{formatCurrency(job.feeTotal || 0)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between items-center pt-2">
              <span className="font-semibold text-lg">Total</span>
              <span className="font-mono font-bold text-2xl text-primary" data-testid="text-grand-total">
                {formatCurrency(job.subtotal)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          {job.repairOrderId && (
            <Button
              onClick={handleViewInTekmetric}
              variant="secondary"
              className="w-full"
              data-testid="button-view-tekmetric-ro"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View Full RO in Tekmetric
            </Button>
          )}
          
          <Button
            onClick={handleSendToTekmetric}
            className="w-full"
            data-testid="button-send-tekmetric-extension"
            disabled={sending}
          >
            <Send className="w-4 h-4 mr-2" />
            {sending ? "Sent!" : "Send to Extension"}
          </Button>

          <Button
            onClick={handleCopyToClipboard}
            variant="outline"
            className="w-full"
            data-testid="button-copy-clipboard"
          >
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Copied!" : "Copy Details"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
