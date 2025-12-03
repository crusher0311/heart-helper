import { ArrowLeft, Phone, Clock, Calendar, User, ChevronRight, Loader2, PhoneIncoming, PhoneOutgoing, Star, Filter, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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

  const { data: calls, isLoading, refetch, isFetching } = useQuery<CallRecording[]>({
    queryKey: ["/api/calls", dateFrom, dateTo, directionFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
      if (dateTo) params.set("dateTo", new Date(dateTo + "T23:59:59").toISOString());
      if (directionFilter !== "all") {
        params.set("direction", directionFilter === "inbound" ? "Inbound" : "Outbound");
      }
      params.set("limit", "100");
      
      const response = await fetch(`/api/calls?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch calls");
      return response.json();
    },
  });

  // Calls are already filtered by the backend now
  const filteredCalls = calls;

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
      </header>

      <div className="container mx-auto max-w-6xl py-8 px-4">
        {/* Filters */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Filters</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <CardTitle>Call Recordings</CardTitle>
            <CardDescription>
              {filteredCalls?.length || 0} calls found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
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
