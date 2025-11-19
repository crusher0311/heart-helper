import { Copy, Check, Calendar, Gauge, FileText } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { JobWithDetails } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface JobDetailPanelProps {
  job: JobWithDetails;
  matchScore?: number;
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

export function JobDetailPanel({ job, matchScore }: JobDetailPanelProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const vehicle = job.vehicle;
  const repairOrder = job.repairOrder;

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
                    {repairOrder.milesIn?.toLocaleString() || "N/A"}
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
            <CardTitle className="text-base font-semibold">Parts</CardTitle>
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
                      {formatCurrency(part.retail * part.quantity)}
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
            {job.feeTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fees</span>
                <span className="font-mono">{formatCurrency(job.feeTotal)}</span>
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
      <div className="flex gap-2">
        <Button
          onClick={handleCopyToClipboard}
          variant="outline"
          className="flex-1"
          data-testid="button-copy-clipboard"
        >
          {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
          {copied ? "Copied!" : "Copy Details"}
        </Button>
      </div>
    </div>
  );
}
