import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SearchInterface } from "@/components/search-interface";
import { JobCard } from "@/components/job-card";
import { JobDetailPanel } from "@/components/job-detail-panel";
import { EmptyState } from "@/components/empty-state";
import { JobCardSkeleton, JobDetailSkeleton } from "@/components/loading-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Settings } from "lucide-react";
import { Link } from "wouter";
import type { SearchJobRequest, SearchResult } from "@shared/schema";

export default function Home() {
  const [searchParams, setSearchParams] = useState<SearchJobRequest | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [results, setResults] = useState<SearchResult[] | null>(null);

  const searchMutation = useMutation({
    mutationFn: async (params: SearchJobRequest) => {
      const response = await apiRequest("POST", "/api/search", params);
      return await response.json() as SearchResult[];
    },
    onSuccess: (data) => {
      console.log("Search response data:", data);
      console.log("Is array:", Array.isArray(data));
      // Ensure data is an array before setting results
      const resultsArray = Array.isArray(data) ? data : [];
      console.log("Setting results to:", resultsArray);
      setResults(resultsArray);
      queryClient.invalidateQueries({ queryKey: ["/api/search"] });
    },
  });

  const isLoading = searchMutation.isPending;
  const error = searchMutation.error;

  const selectedResult = Array.isArray(results) 
    ? results.find((r) => r.job.id === selectedJobId)
    : undefined;

  const handleSearch = (params: SearchJobRequest) => {
    setSearchParams(params);
    setSelectedJobId(null);
    searchMutation.mutate(params);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold" data-testid="text-app-title">
                Repair Order Search
              </h1>
              <p className="text-xs text-muted-foreground">AI-Powered Job History</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {Array.isArray(results) && results.length > 0 && (
              <div className="text-sm text-muted-foreground" data-testid="text-results-count">
                {results.length} {results.length === 1 ? "result" : "results"} found
              </div>
            )}
            <Link href="/settings">
              <Button variant="ghost" size="icon" data-testid="button-settings">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Search Sidebar - Left Column */}
          <div className="lg:col-span-3">
            <SearchInterface onSearch={handleSearch} isLoading={isLoading} />
          </div>

          {/* Results - Middle Column */}
          <div className="lg:col-span-5">
            {!searchParams ? (
              <EmptyState type="no-search" />
            ) : isLoading ? (
              <div className="space-y-4" data-testid="loading-results">
                <JobCardSkeleton />
                <JobCardSkeleton />
                <JobCardSkeleton />
                <JobCardSkeleton />
              </div>
            ) : error ? (
              <EmptyState
                type="error"
                message={error instanceof Error ? error.message : "An error occurred"}
              />
            ) : !Array.isArray(results) || results.length === 0 ? (
              <EmptyState type="no-results" />
            ) : (
              <div className="space-y-3" data-testid="results-list">
                {results.map((result) => (
                  <JobCard
                    key={result.job.id}
                    result={result}
                    isSelected={selectedJobId === result.job.id}
                    onClick={() => setSelectedJobId(result.job.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Job Detail - Right Column */}
          <div className="lg:col-span-4">
            {selectedResult ? (
              <JobDetailPanel
                job={selectedResult.job}
                matchScore={selectedResult.matchScore}
              />
            ) : Array.isArray(results) && results.length > 0 ? (
              <Card className="sticky top-24">
                <CardContent className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">Select a job to view details</p>
                </CardContent>
              </Card>
            ) : isLoading ? (
              <div data-testid="loading-detail">
                <JobDetailSkeleton />
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
