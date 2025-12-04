import { Phone, Clock, Calendar, User, ChevronRight, Loader2, PhoneIncoming, PhoneOutgoing, Star, Filter, RefreshCw, Search, X, Sparkles, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Navigation } from "@/components/navigation";
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
  callType: string | null;
  isNotSalesCall: boolean | null;
  notSalesCallReason: string | null;
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
  const [transcribedFilter, setTranscribedFilter] = useState<string>("transcribed"); // Default to showing transcribed calls
  const [callTypeFilter, setCallTypeFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 50;

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
  const { data: callsData, isLoading, refetch, isFetching } = useQuery<{ calls: CallRecording[]; total: number }>({
    queryKey: ["/api/calls", dateFrom, dateTo, directionFilter, userFilter, transcribedFilter, currentPage],
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
      if (transcribedFilter !== "all") {
        params.set("transcribedFilter", transcribedFilter);
      }
      params.set("limit", String(pageSize));
      params.set("offset", String((currentPage - 1) * pageSize));
      
      const response = await fetch(`/api/calls?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch calls");
      return response.json();
    },
    enabled: !searchQuery,
  });
  
  const calls = callsData?.calls;
  const totalCalls = callsData?.total || 0;
  const totalPages = Math.ceil(totalCalls / pageSize);

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
      params.set("limit", "500");
      
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
      setCurrentPage(1);
    }
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setCurrentPage(1);
  };
  
  // Reset to page 1 when filters change
  const handleFilterChange = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  // Use search results if searching, otherwise use regular calls
  // Apply transcribed filter and call type filter, sort by date (newest first)
  const filteredCalls = useMemo(() => {
    let result = searchQuery ? searchResults : calls;
    if (!result) return [];
    
    // Apply transcribed filter
    if (transcribedFilter === "transcribed") {
      // "Ready for Review" - transcribed calls that are NOT scored and NOT archived
      result = result.filter(c => 
        c.transcriptText && 
        c.transcriptText.length > 10 && 
        !c.isNotSalesCall && 
        !c.score
      );
    } else if (transcribedFilter === "scored") {
      // "Scored" - calls that have been scored (have a score)
      result = result.filter(c => 
        c.score && 
        !c.isNotSalesCall
      );
    } else if (transcribedFilter === "not-transcribed") {
      // "Needs Transcription" - calls without transcripts
      result = result.filter(c => !c.transcriptText || c.transcriptText.length <= 10);
    } else if (transcribedFilter === "archived") {
      // "Archived (Not Sales)" - calls marked as not a sales call
      result = result.filter(c => c.isNotSalesCall === true);
    }
    // "all" shows everything including archived
    
    // Apply call type filter
    if (callTypeFilter !== "all") {
      result = result.filter(c => {
        const type = c.callType || "sales"; // Default to sales if not set
        return type === callTypeFilter;
      });
    }
    
    // Sort by date (newest first)
    return [...result].sort((a, b) => {
      const dateA = new Date(a.callStartTime).getTime();
      const dateB = new Date(b.callStartTime).getTime();
      return dateB - dateA;
    });
  }, [searchQuery, searchResults, calls, transcribedFilter, callTypeFilter]);

  const inboundCount = calls?.filter(c => c.direction?.toLowerCase() === "inbound").length || 0;
  const outboundCount = calls?.filter(c => c.direction?.toLowerCase() === "outbound").length || 0;
  const totalDuration = calls?.reduce((acc, c) => acc + (c.durationSeconds || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      <Navigation>
        <div className="flex items-center gap-2">
          {isAdmin && unscoredCount && unscoredCount.count > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={() => batchScoreMutation.mutate(10)}
              disabled={batchScoreMutation.isPending}
              data-testid="button-score-batch"
            >
              {batchScoreMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              <span className="hidden sm:inline">Score {Math.min(unscoredCount.count, 10)}</span>
              <span className="sm:hidden">Score</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </Navigation>

      <div className="container mx-auto max-w-6xl py-8 px-4">
        {/* Search & Filters - Sticky */}
        <Card className="mb-6 sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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

            {/* Date, Direction, Transcript, Call Type, and User Filters */}
            <div className={`grid grid-cols-1 gap-4 ${isAdmin && teamMembers?.length ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
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
                <Select value={directionFilter} onValueChange={handleFilterChange(setDirectionFilter)}>
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
              <div className="space-y-2">
                <Label htmlFor="transcribed">Status</Label>
                <Select value={transcribedFilter} onValueChange={handleFilterChange(setTranscribedFilter)}>
                  <SelectTrigger id="transcribed" data-testid="select-transcribed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transcribed">Ready for Review</SelectItem>
                    <SelectItem value="scored">Scored</SelectItem>
                    <SelectItem value="not-transcribed">Needs Transcription</SelectItem>
                    <SelectItem value="archived">Archived (Not Sales)</SelectItem>
                    <SelectItem value="all">All Calls</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="call-type">Call Type</Label>
                <Select value={callTypeFilter} onValueChange={handleFilterChange(setCallTypeFilter)}>
                  <SelectTrigger id="call-type" data-testid="select-call-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="appointment_request">Appointment Request</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && teamMembers && teamMembers.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="user-filter">Team Member</Label>
                  <Select value={userFilter} onValueChange={handleFilterChange(setUserFilter)}>
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
              {searchQuery 
                ? `${filteredCalls?.length || 0} matching calls`
                : `Showing ${filteredCalls?.length || 0} of ${totalCalls} calls (Page ${currentPage} of ${totalPages || 1})`
              }
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                              {call.customerName || formatPhoneNumber(call.customerPhone)}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {call.direction?.toLowerCase() === 'inbound' ? 'Inbound' : 'Outbound'}
                            </Badge>
                            <Badge variant="outline" className={`text-xs ${
                              (call.callType || 'sales') === 'appointment_request' 
                                ? 'bg-purple-500/10 text-purple-700 border-purple-200'
                                : 'bg-blue-500/10 text-blue-700 border-blue-200'
                            }`}>
                              {(call.callType || 'sales') === 'appointment_request' ? 'Appointment' : 'Sales'}
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
            
            {/* Pagination Controls */}
            {!searchQuery && totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t mt-4">
                <div className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1 || isFetching}
                    data-testid="button-first-page"
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1 || isFetching}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages || isFetching}
                    data-testid="button-next-page"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages || isFetching}
                    data-testid="button-last-page"
                  >
                    Last
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
