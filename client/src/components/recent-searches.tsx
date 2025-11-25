import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, Clock } from "lucide-react";
import type { SearchJobRequest } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface RecentSearch {
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleEngine?: string;
  repairType: string;
  resultsCount: number;
  createdAt: Date;
}

interface RecentSearchesProps {
  onSearchSelect: (params: SearchJobRequest) => void;
}

export function RecentSearches({ onSearchSelect }: RecentSearchesProps) {
  const { data: recentSearches, isLoading } = useQuery<RecentSearch[]>({
    queryKey: ["/api/search/recent"],
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="w-4 h-4" />
            Recent Searches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!recentSearches || recentSearches.length === 0) {
    return null;
  }

  return (
    <Card data-testid="recent-searches-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="w-4 h-4" />
          Recent Searches
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {recentSearches.map((search, index) => {
          const vehicleLabel = [
            search.vehicleYear,
            search.vehicleMake,
            search.vehicleModel,
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <Button
              key={index}
              variant="ghost"
              className="w-full justify-start text-left h-auto py-2 px-3 hover-elevate"
              onClick={() =>
                onSearchSelect({
                  vehicleMake: search.vehicleMake,
                  vehicleModel: search.vehicleModel,
                  vehicleYear: search.vehicleYear,
                  vehicleEngine: search.vehicleEngine,
                  repairType: search.repairType,
                  limit: 20,
                  broadenStrategy: undefined, // Clear broadening when selecting from history
                })
              }
              data-testid={`recent-search-${index}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  {vehicleLabel && (
                    <p className="text-xs font-medium truncate">{vehicleLabel}</p>
                  )}
                  <p className="text-xs text-muted-foreground shrink-0">
                    {search.resultsCount} {search.resultsCount === 1 ? "result" : "results"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground truncate">{search.repairType}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(search.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
