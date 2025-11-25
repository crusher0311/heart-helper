import { Search, Database, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  type: "no-search" | "no-results" | "error";
  message?: string;
  onBroadenSearch?: () => void;
  canBroaden?: boolean;
}

export function EmptyState({ type, message, onBroadenSearch, canBroaden }: EmptyStateProps) {
  const configs = {
    "no-search": {
      icon: Search,
      title: "Start Your Search",
      description: "Enter a repair type to find similar jobs from your historical data. Add vehicle details for more accurate AI matching.",
    },
    "no-results": {
      icon: Database,
      title: "No Matching Jobs Found",
      description: message || (canBroaden 
        ? "No jobs found with your current filters. Click \"Broaden Search\" to find similar repairs using AI."
        : "Try adjusting your search criteria to see more results."),
    },
    error: {
      icon: Sparkles,
      title: "Something Went Wrong",
      description: message || "We encountered an error while searching. Please try again.",
    },
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <div className="flex items-center justify-center min-h-[400px]" data-testid={`empty-state-${type}`}>
      <div className="text-center max-w-md px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
          <Icon className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">{config.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{config.description}</p>
        
        {type === "no-results" && canBroaden && onBroadenSearch && (
          <Button 
            onClick={onBroadenSearch}
            variant="default"
            className="mt-4"
            data-testid="button-broaden-search"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Broaden Search
          </Button>
        )}
      </div>
    </div>
  );
}
