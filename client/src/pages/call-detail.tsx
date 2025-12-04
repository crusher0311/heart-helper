import { Phone, Clock, Calendar, User, Star, PhoneIncoming, PhoneOutgoing, Loader2, Play, FileText, AlertCircle, Sparkles, Ban, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Navigation } from "@/components/navigation";
import { InteractiveTranscript } from "@/components/interactive-transcript";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  transcript: unknown | null;
  transcriptText: string | null;
  isNotSalesCall: boolean | null;
  notSalesCallReason: string | null;
  callStartTime: string;
  callEndTime: string | null;
  createdAt: string;
  score?: {
    id: string;
    overallScore: number;
    maxPossibleScore: number;
    criteriaScores: Array<{
      criterionId: string;
      criterionName: string;
      score: number;
      maxScore: number;
      found: boolean;
      excerpts: string[];
    }>;
    summary: string;
    scoredAt: string;
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

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: call, isLoading, error, refetch } = useQuery<CallRecording>({
    queryKey: ["/api/calls", id],
    queryFn: async () => {
      const response = await fetch(`/api/calls/${id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch call");
      return response.json();
    },
  });

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
    queryFn: async () => {
      const response = await fetch("/api/admin/check", { credentials: "include" });
      if (!response.ok) return { isAdmin: false };
      return response.json();
    },
  });

  const { data: userPrefs } = useQuery<{ isManager?: boolean }>({
    queryKey: ["/api/user/preferences"],
    queryFn: async () => {
      const response = await fetch("/api/user/preferences", { credentials: "include" });
      if (!response.ok) return {};
      return response.json();
    },
  });

  const isAdminOrManager = adminCheck?.isAdmin || userPrefs?.isManager || false;

  const scoreMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/calls/${id}/score`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Call Scored",
        description: "AI scoring has been completed successfully.",
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/calls", id] });
    },
    onError: (error: any) => {
      toast({
        title: "Scoring Failed",
        description: error.message || "Failed to score call transcript",
        variant: "destructive",
      });
    },
  });

  const markNotSalesCallMutation = useMutation({
    mutationFn: async ({ isNotSalesCall, reason }: { isNotSalesCall: boolean; reason?: string }) => {
      const res = await apiRequest("PATCH", `/api/calls/${id}/not-sales-call`, { isNotSalesCall, reason });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.isNotSalesCall ? "Marked as Not Sales Call" : "Marked as Sales Call",
        description: data.isNotSalesCall 
          ? "This call won't be used for AI training or scoring." 
          : "This call is now available for AI training.",
      });
      // Invalidate the calls list so it refreshes without this call
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
      // If marking as NOT sales, redirect back to calls list
      if (data.isNotSalesCall) {
        setLocation("/calls");
      } else {
        refetch();
        queryClient.invalidateQueries({ queryKey: ["/api/calls", id] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update call status",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Call Not Found</h1>
        <p className="text-muted-foreground">This call recording could not be found.</p>
        <Link href="/calls">
          <Button>Back to Calls</Button>
        </Link>
      </div>
    );
  }

  const scorePercentage = call.score 
    ? Math.round((call.score.overallScore / call.score.maxPossibleScore) * 100)
    : null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation>
        <div className="flex items-center gap-2">
          {scorePercentage !== null && (
            <div className="flex items-center gap-2">
              <Star className={`h-5 w-5 ${scorePercentage >= 70 ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground'}`} />
              <span className="text-lg font-bold">{scorePercentage}%</span>
            </div>
          )}
          
          {adminCheck?.isAdmin && call.transcriptText && (
            <Button
              size="sm"
              onClick={() => scoreMutation.mutate()}
              disabled={scoreMutation.isPending}
              variant={call.score ? "outline" : "default"}
              data-testid="button-score-call"
            >
              {scoreMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              <span className="hidden sm:inline">{call.score ? "Re-score" : "Score"}</span>
            </Button>
          )}
          
          {/* Mark as Not Sales Call button */}
          <Button
            size="sm"
            onClick={() => markNotSalesCallMutation.mutate({ 
              isNotSalesCall: !call.isNotSalesCall,
              reason: 'other'
            })}
            disabled={markNotSalesCallMutation.isPending}
            variant={call.isNotSalesCall ? "default" : "outline"}
            className={call.isNotSalesCall ? "bg-amber-600 hover:bg-amber-700" : ""}
            data-testid="button-not-sales-call"
          >
            {markNotSalesCallMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : call.isNotSalesCall ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Ban className="h-4 w-4 mr-2" />
            )}
            <span className="hidden sm:inline">
              {call.isNotSalesCall ? "Is Not Sales" : "Not Sales?"}
            </span>
          </Button>
        </div>
      </Navigation>

      <div className="container mx-auto max-w-4xl py-8 px-4 space-y-6">
        {/* Call Info */}
        <Card>
          <CardHeader>
            <CardTitle>Call Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Direction</p>
                <div className="flex items-center gap-2">
                  {call.direction?.toLowerCase() === 'inbound' ? (
                    <>
                      <PhoneIncoming className="h-4 w-4 text-green-600" />
                      <span className="font-medium">Inbound</span>
                    </>
                  ) : (
                    <>
                      <PhoneOutgoing className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">Outbound</span>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Duration</p>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{formatDuration(call.durationSeconds)}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Customer</p>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{formatPhoneNumber(call.customerPhone)}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Recording</p>
                <Badge variant={call.recordingStatus === 'available' ? 'default' : 'secondary'}>
                  {call.recordingStatus === 'available' ? 'Available' : 'Not Available'}
                </Badge>
              </div>
            </div>

            {call.ringcentralRecordingId && (
              <div className="mt-6 pt-6 border-t">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Call Recording</span>
                  </div>
                  <audio 
                    controls 
                    className="w-full"
                    src={`/api/calls/${call.id}/recording`}
                    data-testid="audio-player"
                  >
                    Your browser does not support the audio element.
                  </audio>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Coaching Score */}
        {call.score && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Coaching Score</CardTitle>
                  <CardDescription>
                    AI-powered evaluation based on coaching criteria
                  </CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold">{call.score.overallScore}/{call.score.maxPossibleScore}</p>
                  <p className="text-sm text-muted-foreground">points</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Overall Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Overall Score</span>
                  <span className="font-medium">{scorePercentage}%</span>
                </div>
                <Progress value={scorePercentage || 0} className="h-3" />
              </div>

              {/* Criteria Breakdown */}
              {call.score.criteriaScores && call.score.criteriaScores.length > 0 && (
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="font-medium">Criteria Breakdown</h4>
                  <div className="space-y-3">
                    {call.score.criteriaScores.map((criterion, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{criterion.criterionName}</span>
                            {criterion.found ? (
                              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-200">
                                Found
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 border-amber-200">
                                Missing
                              </Badge>
                            )}
                          </div>
                          <span className="text-sm font-medium">{criterion.score}/{criterion.maxScore}</span>
                        </div>
                        <Progress 
                          value={(criterion.score / criterion.maxScore) * 100} 
                          className="h-1.5" 
                        />
                        {criterion.excerpts && criterion.excerpts.length > 0 && (
                          <div className="pl-4 border-l-2 border-muted">
                            {criterion.excerpts.map((excerpt, i) => (
                              <p key={i} className="text-xs text-muted-foreground italic">"{excerpt}"</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              {call.score.summary && (
                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">AI Summary</h4>
                  <p className="text-sm text-muted-foreground">{call.score.summary}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Transcript with Interactive Annotations */}
        {call.transcriptText && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Transcript</CardTitle>
                </div>
                {adminCheck?.isAdmin && !call.score && (
                  <Button
                    onClick={() => scoreMutation.mutate()}
                    disabled={scoreMutation.isPending}
                    data-testid="button-score-transcript"
                  >
                    {scoreMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Score This Call
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <InteractiveTranscript 
                callId={call.id}
                transcriptText={call.transcriptText}
                isAdminOrManager={isAdminOrManager}
              />
            </CardContent>
          </Card>
        )}

        {/* No Score Yet */}
        {!call.score && (
          <Card>
            <CardContent className="py-8 text-center">
              <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">Not Scored Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                This call has not been scored by the AI coaching system yet.
                {!call.transcriptText && " A transcript is required for scoring."}
              </p>
              {adminCheck?.isAdmin && call.transcriptText && (
                <Button
                  onClick={() => scoreMutation.mutate()}
                  disabled={scoreMutation.isPending}
                  size="lg"
                  data-testid="button-score-now"
                >
                  {scoreMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Score This Call Now
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
