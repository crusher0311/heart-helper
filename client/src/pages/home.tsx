import { useState, useEffect, startTransition } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SearchInterface } from "@/components/search-interface";
import { JobCard } from "@/components/job-card";
import { JobDetailPanel } from "@/components/job-detail-panel";
import { EmptyState } from "@/components/empty-state";
import { JobCardSkeleton, JobDetailSkeleton } from "@/components/loading-skeleton";
import { RecentSearches } from "@/components/recent-searches";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Settings, RefreshCw, Clock } from "lucide-react";
import { Link } from "wouter";
import type { SearchJobRequest, SearchResult } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

export default function Home() {
  const [searchParams, setSearchParams] = useState<SearchJobRequest | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [repairOrderId, setRepairOrderId] = useState<string | null>(null);
  const [matchesFound, setMatchesFound] = useState<number>(0);
  const [isCached, setIsCached] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roId = urlParams.get('roId');
    if (roId) {
      setRepairOrderId(roId);
      console.log("Extracted RO ID from URL:", roId);
    }
  }, []);

  const searchMutation = useMutation({
    mutationFn: async (params: SearchJobRequest & { bypassCache?: boolean }) => {
      const response = await apiRequest("POST", "/api/search", params);
      return await response.json() as { results: SearchResult[]; cached: boolean; cachedAt: string };
    },
    onSuccess: (data) => {
      console.log("Search response data:", data);
      console.log("Type of data:", typeof data, "Is array?", Array.isArray(data));
      console.log("data.results:", data.results);
      console.log("data.cached:", data.cached);
      console.log("data.cachedAt:", data.cachedAt);
      
      const resultsArray = data.results || [];
      const cached = data.cached || false;
      const cachedAt = data.cachedAt || null;
      
      console.log(`Setting isCached=${cached}, cachedAt=${cachedAt}`);
      setIsCached(cached);
      setCachedAt(cachedAt);
      
      console.log(`Got ${resultsArray.length} results (cached: ${cached})`);
      
      // Update counter immediately (high priority)
      setMatchesFound(resultsArray.length);
      
      // Defer rendering cards to avoid blocking UI (low priority)
      startTransition(() => {
        setResults(resultsArray);
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/search"] });
    },
  });

  const isLoading = searchMutation.isPending;
  const error = searchMutation.error;

  useEffect(() => {
    if (isLoading) {
      setMatchesFound(0);
    }
  }, [isLoading]);

  const selectedResult = Array.isArray(results) 
    ? results.find((r) => r.job.id === selectedJobId)
    : undefined;

  const handleSearch = (params: SearchJobRequest, bypassCache: boolean = false) => {
    setSearchParams(params);
    setSelectedJobId(null);
    searchMutation.mutate({ ...params, bypassCache });
  };

  const handleRefresh = () => {
    if (searchParams) {
      handleSearch(searchParams, true);
    }
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
              <>
                <div className="text-sm text-muted-foreground" data-testid="text-results-count">
                  {results.length} {results.length === 1 ? "result" : "results"} found
                </div>
                {isCached && cachedAt && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="cache-indicator">
                    <Clock className="w-3 h-3" />
                    Cached {formatDistanceToNow(new Date(cachedAt), { addSuffix: true })}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleRefresh}
                      data-testid="button-refresh-cache"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </>
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
          <div className="lg:col-span-3 space-y-4">
            <SearchInterface onSearch={handleSearch} isLoading={isLoading} />
            <RecentSearches onSearchSelect={handleSearch} />
          </div>

          {/* Results - Middle Column */}
          <div className="lg:col-span-5">
            {!searchParams ? (
              <EmptyState type="no-search" />
            ) : isLoading ? (
              <div className="space-y-4" data-testid="loading-results">
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">Searching job history...</h3>
                        <p className="text-sm text-muted-foreground">AI is analyzing similar repairs</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-primary tabular-nums" data-testid="text-matches-counter">
                        {isLoading ? "—" : matchesFound}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">
                        {isLoading ? "Searching..." : "Matches Found"}
                      </div>
                    </div>
                  </div>
                </Card>
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
                repairOrderId={repairOrderId || undefined}
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
