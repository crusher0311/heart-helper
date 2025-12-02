import { useState, useEffect, startTransition } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SearchInterface } from "@/components/search-interface";
import { JobCard } from "@/components/job-card";
import { JobDetailPanel } from "@/components/job-detail-panel";
import { EmptyState } from "@/components/empty-state";
import { JobCardSkeleton, JobDetailSkeleton } from "@/components/loading-skeleton";
import { RecentSearches } from "@/components/recent-searches";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sparkles, Settings, RefreshCw, Clock, LogOut, User, ShieldCheck, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import type { SearchJobRequest, SearchResult } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import heartLogo from "@assets/HCAC_1764080802250.png";

// Logout handler
async function handleLogout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch (error) {
    console.error("Logout error:", error);
  }
  window.location.href = "/";
}

export default function Home() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useState<SearchJobRequest | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [repairOrderId, setRepairOrderId] = useState<string | null>(null);
  const [matchesFound, setMatchesFound] = useState<number>(0);
  const [isCached, setIsCached] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
  });
  
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
    onSuccess: (data, variables) => {
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
      
      // If broadening succeeded (got results), clear broadenStrategy for next search
      // This ensures next "Broaden Search" click progresses to next stage
      if (resultsArray.length > 0 && variables.broadenStrategy) {
        console.log(`Broadening succeeded with strategy '${variables.broadenStrategy}', clearing for next attempt`);
        setSearchParams(prev => prev ? { ...prev, broadenStrategy: undefined } : null);
      }
      
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

  const handleBroadenSearch = () => {
    if (!searchParams) return;
    
    // Progressive broadening strategy:
    // 1. First try: Broaden years (AI determines compatible years)
    // 2. If that was already done or no year filter, try: Find similar models (AI)
    // 3. Last resort: Remove all vehicle filters
    
    let broadenedParams: SearchJobRequest;
    
    if (searchParams.vehicleYear && !searchParams.broadenStrategy) {
      // Stage 1: Broaden year ranges using AI
      broadenedParams = {
        ...searchParams,
        broadenStrategy: 'years',
      };
    } else if ((searchParams.vehicleMake || searchParams.vehicleModel) && searchParams.broadenStrategy !== 'models') {
      // Stage 2: Find similar models using AI
      broadenedParams = {
        ...searchParams,
        broadenStrategy: 'models',
      };
    } else {
      // Stage 3: Remove all vehicle filters
      broadenedParams = {
        repairType: searchParams.repairType,
        limit: 20,
        broadenStrategy: 'all',
      };
    }
    
    handleSearch(broadenedParams, true); // Bypass cache for fresh results
  };

  // Can broaden if there are vehicle filters that can be removed
  const canBroadenSearch = searchParams && (
    searchParams.vehicleYear !== undefined ||
    searchParams.vehicleMake !== undefined ||
    searchParams.vehicleModel !== undefined ||
    searchParams.vehicleEngine !== undefined
  );

  // Check if user is pending approval
  const isPendingApproval = user?.preferences?.approvalStatus === 'pending';
  const isRejected = user?.preferences?.approvalStatus === 'rejected';

  // Show pending approval page if not approved
  if (isPendingApproval || isRejected) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-6 text-center">
            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
              isRejected ? 'bg-destructive/10' : 'bg-amber-500/10'
            }`}>
              <AlertCircle className={`w-8 h-8 ${isRejected ? 'text-destructive' : 'text-amber-500'}`} />
            </div>
            <h2 className="text-xl font-semibold mb-2" data-testid="text-approval-title">
              {isRejected ? 'Access Denied' : 'Approval Pending'}
            </h2>
            <p className="text-muted-foreground mb-6" data-testid="text-approval-message">
              {isRejected 
                ? 'Your access to HEART Helper has been denied. Please contact an administrator if you believe this is an error.'
                : 'Your account is awaiting approval from an administrator. Please check back later.'}
            </p>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Signed in as: <span className="font-medium">{user?.email}</span>
              </p>
              <Button variant="outline" className="w-full" onClick={handleLogout} data-testid="button-logout">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img 
              src={heartLogo} 
              alt="HEART Certified Auto Care" 
              className="h-12 w-auto"
              data-testid="img-heart-logo"
            />
            <div>
              <h1 className="text-lg font-semibold" data-testid="text-app-title">
                Helper
              </h1>
              <p className="text-xs text-muted-foreground">AI-Powered Repair History</p>
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
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full" data-testid="button-user-menu">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
                      <AvatarFallback>
                        {user.firstName?.[0] || user.email?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      <span>Preferences</span>
                    </Link>
                  </DropdownMenuItem>
                  {adminCheck?.isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="cursor-pointer" data-testid="link-admin">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        <span>Team Training</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="cursor-pointer text-destructive focus:text-destructive"
                    onClick={handleLogout}
                    data-testid="button-logout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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
              <EmptyState 
                type="no-results" 
                onBroadenSearch={handleBroadenSearch}
                canBroaden={!!canBroadenSearch}
              />
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
