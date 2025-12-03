import { Users, Trophy, TrendingUp, Target, BarChart3, Loader2, ChevronRight, Lightbulb, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Navigation } from "@/components/navigation";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from "recharts";

type TeamMember = {
  userId: string;
  userName: string;
  callCount: number;
  scoredCount: number;
  averageScore: number;
};

type TeamDashboard = {
  totalCalls: number;
  scoredCalls: number;
  averageScore: number;
  teamMembers: TeamMember[];
};

type CriteriaStat = {
  id: string;
  name: string;
  category: string | null;
  averageScore: number;
  totalEvaluations: number;
};

type CriteriaDashboard = {
  criteria: CriteriaStat[];
};

type UserStats = {
  callCount: number;
  scoredCount: number;
  averageScore: number;
  recentScores: Array<{
    callId: string;
    score: number;
    callDate: string;
    customerName: string | null;
  }>;
  criteriaAverages: Record<string, { name: string; average: number; count: number }>;
};

type TrainingRecommendation = {
  criterionId: string;
  criterionName: string;
  averageScore: number;
  priority: 'high' | 'medium' | 'low';
  recommendation: string;
  actionItems: string[];
  examplePhrases: string[];
};

type TrainingRecommendationsResponse = {
  recommendations: TrainingRecommendation[];
  overallAssessment: string;
  strengths: string[];
  nextSteps: string;
  minimumCallsRequired?: number;
  currentScoredCalls?: number;
  stats?: {
    callCount: number;
    scoredCount: number;
    averageScore: number;
    dateFrom: string;
    dateTo: string;
  };
};

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getScoreBadgeVariant(score: number): "default" | "secondary" | "destructive" {
  if (score >= 80) return "default";
  if (score >= 60) return "secondary";
  return "destructive";
}

function getCriteriaScoreColor(score: number): string {
  if (score >= 4) return "#22c55e";
  if (score >= 3) return "#eab308";
  if (score >= 2) return "#f97316";
  return "#ef4444";
}

export default function CoachingDashboard() {
  const [dateRange, setDateRange] = useState("30");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  
  const getDateFrom = () => {
    const date = new Date();
    date.setDate(date.getDate() - parseInt(dateRange));
    return date.toISOString().split('T')[0];
  };

  const getDateTo = () => {
    return new Date().toISOString().split('T')[0];
  };

  const { data: teamStats, isLoading: teamLoading, isError: teamError } = useQuery<TeamDashboard>({
    queryKey: ["/api/coaching/dashboard", { dateFrom: getDateFrom(), dateTo: getDateTo() }],
    queryFn: async () => {
      const res = await fetch(`/api/coaching/dashboard?dateFrom=${getDateFrom()}&dateTo=${getDateTo()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch team stats");
      return res.json();
    },
  });

  const { data: criteriaStats, isLoading: criteriaLoading, isError: criteriaError } = useQuery<CriteriaDashboard>({
    queryKey: ["/api/coaching/dashboard/criteria", { dateFrom: getDateFrom(), dateTo: getDateTo() }],
    queryFn: async () => {
      const res = await fetch(`/api/coaching/dashboard/criteria?dateFrom=${getDateFrom()}&dateTo=${getDateTo()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch criteria stats");
      return res.json();
    },
  });

  const { data: userStats, isLoading: userLoading, isError: userError } = useQuery<UserStats>({
    queryKey: ["/api/coaching/dashboard/user", selectedUser, { dateFrom: getDateFrom(), dateTo: getDateTo() }],
    queryFn: async () => {
      const res = await fetch(`/api/coaching/dashboard/user/${selectedUser}?dateFrom=${getDateFrom()}&dateTo=${getDateTo()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch user stats");
      return res.json();
    },
    enabled: !!selectedUser,
  });

  const { data: trainingRecommendations, isLoading: recommendationsLoading, refetch: refetchRecommendations } = useQuery<TrainingRecommendationsResponse>({
    queryKey: ["/api/coaching/recommendations", selectedUser],
    queryFn: async () => {
      const res = await fetch(`/api/coaching/recommendations/${selectedUser}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch training recommendations");
      return res.json();
    },
    enabled: !!selectedUser,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes since AI calls are expensive
  });

  const isLoading = teamLoading || criteriaLoading;
  const hasError = teamError || criteriaError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">Unable to load dashboard data. You may not have permission to view this page.</p>
              <Link href="/calls">
                <Button variant="outline" className="mt-4">Back to Call History</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const criteriaChartData = criteriaStats?.criteria
    .filter(c => c.totalEvaluations > 0)
    .map(c => ({
      name: c.name.length > 20 ? c.name.substring(0, 20) + '...' : c.name,
      fullName: c.name,
      score: c.averageScore,
      evaluations: c.totalEvaluations,
    })) || [];

  const leaderboardData = teamStats?.teamMembers
    .filter(m => m.scoredCount > 0)
    .slice(0, 10) || [];

  return (
    <div className="min-h-screen bg-background">
      <Navigation>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-32" data-testid="select-date-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
          </SelectContent>
        </Select>
      </Navigation>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Coaching Dashboard</h1>
          <p className="text-muted-foreground">Team performance and training insights</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-calls">{teamStats?.totalCalls || 0}</div>
            <p className="text-xs text-muted-foreground">In selected period</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Scored Calls</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-scored-calls">{teamStats?.scoredCalls || 0}</div>
            <p className="text-xs text-muted-foreground">
              {teamStats?.totalCalls ? Math.round((teamStats.scoredCalls / teamStats.totalCalls) * 100) : 0}% of total
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Team Average</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(teamStats?.averageScore || 0)}`} data-testid="text-team-average">
              {teamStats?.averageScore || 0}%
            </div>
            <p className="text-xs text-muted-foreground">Overall score</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Team Size</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-team-size">{teamStats?.teamMembers.length || 0}</div>
            <p className="text-xs text-muted-foreground">Active advisors</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Leaderboard
            </CardTitle>
            <CardDescription>Top performers by average score</CardDescription>
          </CardHeader>
          <CardContent>
            {leaderboardData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No scored calls yet</p>
            ) : (
              <div className="space-y-3">
                {leaderboardData.map((member, index) => (
                  <div 
                    key={member.userId}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover-elevate cursor-pointer"
                    onClick={() => setSelectedUser(member.userId)}
                    data-testid={`row-member-${member.userId}`}
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background font-bold text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{member.userName}</p>
                      <p className="text-xs text-muted-foreground">{member.scoredCount} scored calls</p>
                    </div>
                    <Badge variant={getScoreBadgeVariant(member.averageScore)}>
                      {member.averageScore}%
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-500" />
              Criteria Performance
            </CardTitle>
            <CardDescription>Average scores by coaching criterion (lowest first)</CardDescription>
          </CardHeader>
          <CardContent>
            {criteriaChartData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No evaluations yet</p>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={criteriaChartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" domain={[0, 5]} tickCount={6} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip 
                      formatter={(value: number) => [value.toFixed(1) + '/5', 'Score']}
                      labelFormatter={(label) => criteriaChartData.find(c => c.name === label)?.fullName || label}
                    />
                    <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                      {criteriaChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getCriteriaScoreColor(entry.score)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedUser && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>
                {teamStats?.teamMembers.find(m => m.userId === selectedUser)?.userName || 'Team Member'} Details
              </CardTitle>
              <CardDescription>Individual performance breakdown and training recommendations</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedUser(null)}>
              Close
            </Button>
          </CardHeader>
          <CardContent>
            {userLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : userError ? (
              <p className="text-muted-foreground text-center py-8">Unable to load user stats</p>
            ) : userStats ? (
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="overview" data-testid="tab-overview">Performance</TabsTrigger>
                  <TabsTrigger value="training" data-testid="tab-training">
                    <Sparkles className="h-4 w-4 mr-1" />
                    Training
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="overview" className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="font-medium">Overview</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 rounded-lg bg-muted/50">
                          <p className="text-2xl font-bold">{userStats.callCount}</p>
                          <p className="text-xs text-muted-foreground">Total Calls</p>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/50">
                          <p className="text-2xl font-bold">{userStats.scoredCount}</p>
                          <p className="text-xs text-muted-foreground">Scored</p>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/50">
                          <p className={`text-2xl font-bold ${getScoreColor(userStats.averageScore)}`}>
                            {userStats.averageScore}%
                          </p>
                          <p className="text-xs text-muted-foreground">Average</p>
                        </div>
                      </div>
                      
                      <h4 className="font-medium mt-6">Recent Scores</h4>
                      {userStats.recentScores.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No scored calls</p>
                      ) : (
                        <div className="space-y-2">
                          {userStats.recentScores.map((score) => (
                            <Link key={score.callId} href={`/calls/${score.callId}`}>
                              <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer">
                                <div>
                                  <p className="text-sm font-medium">{score.customerName || 'Unknown'}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(score.callDate).toLocaleDateString()}
                                  </p>
                                </div>
                                <Badge variant={getScoreBadgeVariant(score.score)}>
                                  {score.score}%
                                </Badge>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-4">
                      <h4 className="font-medium">Criteria Breakdown</h4>
                      {Object.keys(userStats.criteriaAverages).length === 0 ? (
                        <p className="text-muted-foreground text-sm">No criteria data available</p>
                      ) : (
                        <div className="space-y-3">
                          {Object.entries(userStats.criteriaAverages)
                            .sort(([, a], [, b]) => a.average - b.average)
                            .map(([id, data]) => (
                              <div key={id} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="truncate">{data.name}</span>
                                  <span className="font-medium">{data.average.toFixed(1)}/5</span>
                                </div>
                                <Progress value={(data.average / 5) * 100} className="h-2" />
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="training" className="space-y-6">
                  {recommendationsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Generating AI recommendations...</p>
                      </div>
                    </div>
                  ) : trainingRecommendations?.minimumCallsRequired ? (
                    <div className="text-center py-8 space-y-4">
                      <AlertTriangle className="h-12 w-12 mx-auto text-amber-500" />
                      <div>
                        <h4 className="font-medium mb-2">Not Enough Data</h4>
                        <p className="text-muted-foreground text-sm">
                          {trainingRecommendations.overallAssessment}
                        </p>
                        <p className="text-sm mt-2">
                          Progress: <span className="font-medium">{trainingRecommendations.currentScoredCalls}</span> of {trainingRecommendations.minimumCallsRequired} scored calls needed
                        </p>
                      </div>
                    </div>
                  ) : trainingRecommendations ? (
                    <div className="space-y-6">
                      {/* Overall Assessment */}
                      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <h4 className="font-medium flex items-center gap-2">
                          <Lightbulb className="h-5 w-5 text-amber-500" />
                          AI Assessment
                        </h4>
                        <p className="text-sm">{trainingRecommendations.overallAssessment}</p>
                        
                        {trainingRecommendations.strengths.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Strengths:</p>
                            <div className="flex flex-wrap gap-2">
                              {trainingRecommendations.strengths.map((strength, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  {strength}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Next Steps */}
                      <div className="border-l-4 border-primary pl-4">
                        <h4 className="font-medium text-sm mb-1">Immediate Focus Area</h4>
                        <p className="text-sm text-muted-foreground">{trainingRecommendations.nextSteps}</p>
                      </div>
                      
                      {/* Recommendations */}
                      {trainingRecommendations.recommendations.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="font-medium">Training Recommendations</h4>
                          <Accordion type="multiple" className="w-full">
                            {trainingRecommendations.recommendations.map((rec, index) => (
                              <AccordionItem key={rec.criterionId || index} value={rec.criterionId || `rec-${index}`}>
                                <AccordionTrigger className="hover:no-underline">
                                  <div className="flex items-center gap-3 text-left">
                                    <Badge 
                                      variant={rec.priority === 'high' ? 'destructive' : rec.priority === 'medium' ? 'secondary' : 'outline'}
                                      className="shrink-0"
                                    >
                                      {rec.priority}
                                    </Badge>
                                    <div className="min-w-0">
                                      <p className="font-medium truncate">{rec.criterionName}</p>
                                      <p className="text-xs text-muted-foreground">
                                        Current: {rec.averageScore.toFixed(1)}/5
                                      </p>
                                    </div>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent className="pt-4 space-y-4">
                                  <p className="text-sm">{rec.recommendation}</p>
                                  
                                  {rec.actionItems.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-2">Action Items:</p>
                                      <ul className="space-y-2">
                                        {rec.actionItems.map((item, i) => (
                                          <li key={i} className="flex items-start gap-2 text-sm">
                                            <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                            <span>{item}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  
                                  {rec.examplePhrases.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-2">Example Phrases:</p>
                                      <div className="space-y-2">
                                        {rec.examplePhrases.map((phrase, i) => (
                                          <div key={i} className="bg-muted/50 rounded p-2 text-sm italic">
                                            "{phrase}"
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </div>
                      )}
                      
                      <div className="flex justify-end pt-4">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => refetchRecommendations()}
                          disabled={recommendationsLoading}
                          data-testid="button-refresh-recommendations"
                        >
                          <Sparkles className="h-4 w-4 mr-1" />
                          Regenerate Recommendations
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">Unable to load training recommendations</p>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <p className="text-muted-foreground text-center py-8">Failed to load user stats</p>
            )}
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
