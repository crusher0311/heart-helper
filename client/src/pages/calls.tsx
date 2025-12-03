import { ArrowLeft, Phone, Clock, Calendar, User, ChevronRight, Loader2, PhoneIncoming, PhoneOutgoing, Star, Filter, RefreshCw, Search, X, Sparkles, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";

type CallRecording = {
  id: string;
  ringcentralCallId: string;
  ringcentralRecordingId: string | null;
  userId: string | null;
  shopId: string | null;
  direction: string | null;
  customerPhone: string | null;
  customerName: string | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  recordingStatus: string | null;
  transcript: string | null;
  transcriptText: string | null;
  callStartTime: string;
  callEndTime: string | null;
  createdAt: string;
  score?: {
    overallScore: number;
    maxPossibleScore: number;
  };
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatPhoneNumber(phone: string | null): string {
  if (!phone) return "Unknown";
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

type TeamMember = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export default function Calls() {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");

  // Check if user is admin
  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
  });
  const isAdmin = adminCheck?.isAdmin || false;

  // Get team members for user filter (admins and managers only)
  const { data: teamMembers } = useQuery<TeamMember[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const response = await fetch("/api/admin/users", { credentials: "include" });
      if (!response.ok) return [];
      const users = await response.json();
      return users.map((u: any) => ({
        id: u.id,
        email: u.email,
        firstName: u.preferences?.firstName || u.firstName,
        lastName: u.preferences?.lastName || u.lastName,
      }));
    },
    enabled: isAdmin,
  });

  // Get count of unscored sales calls (admin only)
  const { data: unscoredCount, refetch: refetchUnscoredCount } = useQuery<{ count: number; message: string }>({
    queryKey: ["/api/calls/unscored/count"],
    enabled: isAdmin,
  });

  // Batch score mutation
  const batchScoreMutation = useMutation({
    mutationFn: async (limit: number = 10) => {
      const response = await fetch(`/api/calls/score-batch?limit=${limit}`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to score calls");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Scoring Complete",
        description: data.message,
      });
      refetchUnscoredCount();
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Scoring Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Regular calls query (when not searching)
  const { data: calls, isLoading, refetch, isFetching } = useQuery<CallRecording[]>({
    queryKey: ["/api/calls", dateFrom, dateTo, directionFilter, userFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
      if (dateTo) params.set("dateTo", new Date(dateTo + "T23:59:59").toISOString());
      if (directionFilter !== "all") {
        params.set("direction", directionFilter === "inbound" ? "Inbound" : "Outbound");
      }
      if (userFilter !== "all") {
        params.set("userId", userFilter);
      }
      params.set("limit", "100");
      
      const response = await fetch(`/api/calls?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch calls");
      return response.json();
    },
    enabled: !searchQuery,
  });

  // Search query (when searching)
  const { data: searchResults, isLoading: isSearching } = useQuery<CallRecording[]>({
    queryKey: ["/api/calls/search", searchQuery, dateFrom, dateTo, directionFilter, userFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("query", searchQuery);
      if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
      if (dateTo) params.set("dateTo", new Date(dateTo + "T23:59:59").toISOString());
      if (directionFilter !== "all") {
        params.set("direction", directionFilter === "inbound" ? "Inbound" : "Outbound");
      }
      if (userFilter !== "all") {
        params.set("userId", userFilter);
      }
      params.set("limit", "100");
      
      const response = await fetch(`/api/calls/search?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to search calls");
      return response.json();
    },
    enabled: !!searchQuery,
  });

  const handleSearch = () => {
    if (searchInput.trim().length >= 2) {
      setSearchQuery(searchInput.trim());
    }
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
  };

  // Use search results if searching, otherwise use regular calls
  const filteredCalls = searchQuery ? searchResults : calls;

  const inboundCount = calls?.filter(c => c.direction?.toLowerCase() === "inbound").length || 0;
  const outboundCount = calls?.filter(c => c.direction?.toLowerCase() === "outbound").length || 0;
  const totalDuration = calls?.reduce((acc, c) => acc + (c.durationSeconds || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Phone className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Call History</h1>
                <p className="text-xs text-muted-foreground">Review synced call recordings</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link href="/coaching">
                <Button variant="outline" data-testid="button-dashboard">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
            )}
            {isAdmin && unscoredCount && unscoredCount.count > 0 && (
              <Button
                variant="default"
                onClick={() => batchScoreMutation.mutate(10)}
                disabled={batchScoreMutation.isPending}
                data-testid="button-score-batch"
              >
                {batchScoreMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Score {Math.min(unscoredCount.count, 10)} Sales Calls
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-6xl py-8 px-4">
        {/* Search & Filters */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Search & Filters</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Transcript Search */}
            <div className="space-y-2">
              <Label htmlFor="search">Search Transcripts</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by transcript content, customer name, or phone..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>
                <Button onClick={handleSearch} disabled={searchInput.trim().length < 2} data-testid="button-search">
                  Search
                </Button>
                {searchQuery && (
                  <Button variant="outline" onClick={clearSearch} data-testid="button-clear-search">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {searchQuery && (
                <p className="text-sm text-muted-foreground">
                  Showing results for: <span className="font-medium">"{searchQuery}"</span>
                </p>
              )}
            </div>

            {/* Date, Direction, and User Filters */}
            <div className={`grid grid-cols-1 gap-4 ${isAdmin && teamMembers?.length ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
              <div className="space-y-2">
                <Label htmlFor="date-from">From Date</Label>
                <input
                  type="date"
                  id="date-from"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  data-testid="input-date-from"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date-to">To Date</Label>
                <input
                  type="date"
                  id="date-to"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  data-testid="input-date-to"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="direction">Direction</Label>
                <Select value={directionFilter} onValueChange={setDirectionFilter}>
                  <SelectTrigger id="direction" data-testid="select-direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Calls</SelectItem>
                    <SelectItem value="inbound">Inbound Only</SelectItem>
                    <SelectItem value="outbound">Outbound Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && teamMembers && teamMembers.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="user-filter">Team Member</Label>
                  <Select value={userFilter} onValueChange={setUserFilter}>
                    <SelectTrigger id="user-filter" data-testid="select-user-filter">
                      <SelectValue placeholder="All Team Members" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Team Members</SelectItem>
                      {teamMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.firstName && member.lastName 
                            ? `${member.firstName} ${member.lastName}`
                            : member.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        {calls && calls.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <PhoneIncoming className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{inboundCount}</p>
                    <p className="text-sm text-muted-foreground">Inbound</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <PhoneOutgoing className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{outboundCount}</p>
                    <p className="text-sm text-muted-foreground">Outbound</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{formatDuration(totalDuration)}</p>
                    <p className="text-sm text-muted-foreground">Total Time</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Call List */}
        <Card>
          <CardHeader>
            <CardTitle>{searchQuery ? "Search Results" : "Call Recordings"}</CardTitle>
            <CardDescription>
              {filteredCalls?.length || 0} {searchQuery ? "matching calls" : "calls"} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(isLoading || isSearching) ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCalls && filteredCalls.length > 0 ? (
              <div className="space-y-2">
                {filteredCalls.map((call) => (
                  <Link key={call.id} href={`/calls/${call.id}`}>
                    <div
                      className="flex items-center justify-between p-4 border rounded-lg hover-elevate cursor-pointer"
                      data-testid={`call-row-${call.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          call.direction?.toLowerCase() === 'inbound' 
                            ? 'bg-green-500/10' 
                            : 'bg-blue-500/10'
                        }`}>
                          {call.direction?.toLowerCase() === 'inbound' ? (
                            <PhoneIncoming className="h-5 w-5 text-green-600" />
                          ) : (
                            <PhoneOutgoing className="h-5 w-5 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {call.customerName || formatPhoneNumber(call.customerPhone)}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {call.direction?.toLowerCase() === 'inbound' ? 'Inbound' : 'Outbound'}
                            </Badge>
                            {call.recordingStatus === 'available' && (
                              <Badge variant="secondary" className="text-xs">
                                Recording
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(call.callStartTime), 'MMM d, yyyy h:mm a')}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(call.durationSeconds)}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {call.score && (
                          <div className="flex items-center gap-1 text-amber-500">
                            <Star className="h-4 w-4 fill-current" />
                            <span className="font-medium">
                              {call.score.overallScore}/{call.score.maxPossibleScore}
                            </span>
                          </div>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">No Calls Found</h3>
                <p className="text-sm text-muted-foreground">
                  {calls && calls.length === 0 
                    ? "No calls have been synced yet. Use the Settings page to sync calls from RingCentral."
                    : "No calls match your current filters."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
