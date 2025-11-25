import { Calendar, Gauge, Wrench, DollarSign, TrendingUp, MapPin, FileText } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SearchResult, ShopLocation } from "@shared/schema";
import { SHOP_NAMES } from "@shared/schema";

interface JobCardProps {
  result: SearchResult;
  isSelected?: boolean;
  onClick: () => void;
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

export function JobCard({ result, isSelected, onClick }: JobCardProps) {
  const { job, matchScore, matchReason } = result;
  const vehicle = job.vehicle;
  const laborHours = job.laborItems.reduce((sum, item) => sum + Number(item.hours), 0);
  const partsCount = job.parts.length;
  const shopId = job.repairOrder?.shopId as ShopLocation | undefined;
  const shopName = shopId ? SHOP_NAMES[shopId] : null;
  const roNumber = job.repairOrderId;

  return (
    <Card
      className={`cursor-pointer transition-all hover-elevate active-elevate-2 ${
        isSelected ? "ring-2 ring-primary" : ""
      }`}
      onClick={onClick}
      data-testid={`card-job-${job.id}`}
    >
      <CardHeader className="pb-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {vehicle && (
                <p className="text-sm font-medium text-muted-foreground truncate">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </p>
              )}
            </div>
            <h3 className="font-medium text-base leading-tight" data-testid={`text-job-name-${job.id}`}>
              {job.name}
            </h3>
          </div>
          <Badge
            className="shrink-0 font-mono font-bold text-xs"
            variant={matchScore >= 80 ? "default" : matchScore >= 60 ? "secondary" : "outline"}
            data-testid={`badge-match-score-${job.id}`}
          >
            {matchScore}% Match
          </Badge>
        </div>

        {matchReason && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            <TrendingUp className="w-3 h-3 inline mr-1" />
            {matchReason}
          </p>
        )}
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="font-mono font-semibold">{laborHours.toFixed(1)}h</span>
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="font-mono font-semibold">{partsCount} parts</span>
          </div>
          <div className="flex items-center gap-1.5 justify-end">
            <span className="font-mono font-semibold text-primary">
              {formatCurrency(job.subtotal)}
            </span>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3 shrink-0" />
              <span>{formatDate(job.completedDate || job.createdDate)}</span>
            </div>
            {job.repairOrder && (
              <div className="flex items-center gap-1.5">
                <Gauge className="w-3 h-3 shrink-0" />
                <span className="font-mono">
                  {job.repairOrder.milesIn?.toLocaleString() || "N/A"} mi
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-xs gap-2">
            {shopName && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="font-medium">{shopName}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-muted-foreground ml-auto">
              <FileText className="w-3 h-3 shrink-0" />
              <span className="font-mono">RO #{roNumber}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
