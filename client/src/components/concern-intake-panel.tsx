import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Sparkles, MessageSquare, FileText, Copy, Check, ChevronRight, Phone } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  GenerateConcernQuestionsResponse,
  ReviewConcernConversationResponse,
  CleanConversationResponse,
  ConcernQuestionResponse
} from "@shared/schema";

interface VehicleInfo {
  year?: number;
  make?: string;
  model?: string;
}

interface ConcernIntakePanelProps {
  initialConcern?: string;
  vehicleInfo?: VehicleInfo;
  phoneAnswerScript?: string;
  onSendToTekmetric?: (cleanedText: string) => void;
  compact?: boolean;
}

export function ConcernIntakePanel({ 
  initialConcern = "", 
  vehicleInfo,
  phoneAnswerScript,
  onSendToTekmetric,
  compact = false 
}: ConcernIntakePanelProps) {
  const { toast } = useToast();
  
  const [customerConcern, setCustomerConcern] = useState(initialConcern);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [answeredQuestions, setAnsweredQuestions] = useState<ConcernQuestionResponse[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [conversationNotes, setConversationNotes] = useState("");
  const [cleanedConversation, setCleanedConversation] = useState("");
  const [currentStep, setCurrentStep] = useState<"initial" | "questions" | "finalized">("initial");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialConcern) {
      setCustomerConcern(initialConcern);
    }
  }, [initialConcern]);

  const generateQuestionsMutation = useMutation({
    mutationFn: async (concern: string) => {
      const response = await apiRequest("POST", "/api/concerns/generate-questions", {
        customerConcern: concern,
        vehicleInfo
      });
      return await response.json() as GenerateConcernQuestionsResponse;
    },
    onSuccess: (data) => {
      if (!data.questions || data.questions.length === 0) {
        toast({
          title: "No Questions Generated",
          description: "AI could not generate questions. Try adding more detail to the concern.",
          variant: "destructive",
        });
        return;
      }
      setFollowUpQuestions(data.questions);
      setCurrentStep("questions");
      setCurrentQuestionIndex(0);
      toast({
        title: "Questions Ready",
        description: `${data.questions.length} follow-up questions generated`,
      });
    },
    onError: (error) => {
      console.error("Failed to generate questions:", error);
      toast({
        title: "AI Unavailable",
        description: "Could not connect to AI service. Check your connection and try again.",
        variant: "destructive",
      });
    },
  });

  const reviewConversationMutation = useMutation({
    mutationFn: async (payload: {
      customerConcern: string;
      answeredQuestions: ConcernQuestionResponse[];
    }) => {
      const response = await apiRequest("POST", "/api/concerns/review", {
        ...payload,
        vehicleInfo
      });
      return await response.json() as ReviewConcernConversationResponse;
    },
    onSuccess: (data) => {
      if (data.additionalQuestions.length > 0) {
        setFollowUpQuestions(data.additionalQuestions);
        setCurrentQuestionIndex(0);
        setCurrentAnswer("");
        toast({
          title: "Additional Questions",
          description: `${data.additionalQuestions.length} more questions suggested`,
        });
      } else {
        cleanConversationMutation.mutate({
          customerConcern,
          answeredQuestions,
          conversationNotes
        });
      }
    },
    onError: (error) => {
      console.error("Failed to review conversation:", error);
      toast({
        title: "Review Failed",
        description: "Unable to review. Finalizing anyway.",
        variant: "destructive",
      });
      cleanConversationMutation.mutate({
        customerConcern,
        answeredQuestions,
        conversationNotes
      });
    },
  });

  const cleanConversationMutation = useMutation({
    mutationFn: async (payload: {
      customerConcern: string;
      answeredQuestions: ConcernQuestionResponse[];
      conversationNotes?: string;
    }) => {
      const response = await apiRequest("POST", "/api/concerns/clean-conversation", payload);
      return await response.json() as CleanConversationResponse;
    },
    onSuccess: (data) => {
      setCleanedConversation(data.cleanedText);
      setCurrentStep("finalized");
      toast({
        title: "Conversation Finalized",
        description: "Ready to copy or send to Tekmetric",
      });
    },
    onError: (error) => {
      console.error("Failed to clean conversation:", error);
      const fallbackText = `Customer reports: ${customerConcern}. ${answeredQuestions.map(qa => qa.answer).join('. ')}`;
      setCleanedConversation(fallbackText);
      setCurrentStep("finalized");
      toast({
        title: "AI Formatting Unavailable",
        description: "Used basic formatting instead. You can edit the summary manually.",
        variant: "destructive",
      });
    },
  });

  const handleStartQuestions = () => {
    if (!customerConcern.trim()) {
      toast({
        title: "Enter Concern",
        description: "Please enter the customer's concern first",
        variant: "destructive",
      });
      return;
    }
    generateQuestionsMutation.mutate(customerConcern);
  };

  const handleNextQuestion = () => {
    if (!currentAnswer.trim()) {
      toast({
        title: "Enter Answer",
        description: "Please record the customer's answer",
        variant: "destructive",
      });
      return;
    }

    const newAnswered = [
      ...answeredQuestions,
      { question: followUpQuestions[currentQuestionIndex], answer: currentAnswer }
    ];
    setAnsweredQuestions(newAnswered);
    setCurrentAnswer("");

    if (currentQuestionIndex < followUpQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      reviewConversationMutation.mutate({
        customerConcern,
        answeredQuestions: newAnswered
      });
    }
  };

  const handleSkipQuestion = () => {
    if (currentQuestionIndex < followUpQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      reviewConversationMutation.mutate({
        customerConcern,
        answeredQuestions
      });
    }
  };

  const handleFinalize = () => {
    cleanConversationMutation.mutate({
      customerConcern,
      answeredQuestions,
      conversationNotes
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanedConversation);
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Unable to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleSendToTekmetric = () => {
    if (onSendToTekmetric) {
      onSendToTekmetric(cleanedConversation);
    }
  };

  const handleRestart = () => {
    setCustomerConcern("");
    setFollowUpQuestions([]);
    setAnsweredQuestions([]);
    setCurrentQuestionIndex(0);
    setCurrentAnswer("");
    setConversationNotes("");
    setCleanedConversation("");
    setCurrentStep("initial");
  };

  const isLoading = generateQuestionsMutation.isPending || 
                    reviewConversationMutation.isPending || 
                    cleanConversationMutation.isPending;

  return (
    <div className={`space-y-4 ${compact ? 'p-2' : ''}`} data-testid="concern-intake-panel">
      {phoneAnswerScript && currentStep === "initial" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Phone Greeting
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2 px-4">
            <p className="text-sm italic" data-testid="text-phone-script">{phoneAnswerScript}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            {currentStep === "initial" && "Customer Concern"}
            {currentStep === "questions" && `Follow-up Questions (${currentQuestionIndex + 1}/${followUpQuestions.length})`}
            {currentStep === "finalized" && "Formatted Concern"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 py-2 px-4">
          {currentStep === "initial" && (
            <>
              {vehicleInfo && (vehicleInfo.year || vehicleInfo.make || vehicleInfo.model) && (
                <div className="text-sm text-muted-foreground mb-2" data-testid="text-vehicle-info">
                  Vehicle: {vehicleInfo.year} {vehicleInfo.make} {vehicleInfo.model}
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="concern">What is the customer's concern?</Label>
                <Textarea
                  id="concern"
                  placeholder="e.g., Car makes a squeaking noise when braking..."
                  value={customerConcern}
                  onChange={(e) => setCustomerConcern(e.target.value)}
                  className="min-h-[100px]"
                  data-testid="input-customer-concern"
                />
              </div>

              <Button
                onClick={handleStartQuestions}
                disabled={!customerConcern.trim() || isLoading}
                className="w-full"
                data-testid="button-generate-questions"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Follow-up Questions
                  </>
                )}
              </Button>
            </>
          )}

          {currentStep === "questions" && (
            <>
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="font-medium text-sm" data-testid="text-current-question">
                      {followUpQuestions[currentQuestionIndex]}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="answer">Customer's Answer</Label>
                    <Textarea
                      id="answer"
                      placeholder="Record what the customer says..."
                      value={currentAnswer}
                      onChange={(e) => setCurrentAnswer(e.target.value)}
                      className="min-h-[80px]"
                      data-testid="input-answer"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleNextQuestion}
                      disabled={!currentAnswer.trim()}
                      className="flex-1"
                      data-testid="button-next-question"
                    >
                      {currentQuestionIndex < followUpQuestions.length - 1 ? (
                        <>
                          Next <ChevronRight className="h-4 w-4 ml-1" />
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 mr-2" />
                          Finalize
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleSkipQuestion}
                      variant="outline"
                      data-testid="button-skip-question"
                    >
                      Skip
                    </Button>
                  </div>

                  {answeredQuestions.length > 0 && (
                    <div className="border-t pt-3 mt-3">
                      <p className="text-xs text-muted-foreground mb-2">
                        Recorded ({answeredQuestions.length})
                      </p>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {answeredQuestions.map((qa, i) => (
                          <div key={i} className="text-xs bg-muted/30 rounded p-2">
                            <p className="font-medium">{qa.question}</p>
                            <p className="text-muted-foreground">{qa.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 border-t pt-3">
                    <Label htmlFor="notes" className="text-xs">Additional Notes (optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Any other observations..."
                      value={conversationNotes}
                      onChange={(e) => setConversationNotes(e.target.value)}
                      className="min-h-[60px] text-sm"
                      data-testid="input-notes"
                    />
                  </div>

                  <Button
                    onClick={handleFinalize}
                    variant="secondary"
                    className="w-full"
                    data-testid="button-finalize-early"
                  >
                    Finalize Now
                  </Button>
                </>
              )}
            </>
          )}

          {currentStep === "finalized" && (
            <>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm whitespace-pre-wrap" data-testid="text-cleaned-conversation">
                  {cleanedConversation}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  className="flex-1"
                  data-testid="button-copy"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
                
                {onSendToTekmetric && (
                  <Button
                    onClick={handleSendToTekmetric}
                    className="flex-1"
                    data-testid="button-send-tekmetric"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Send to Tekmetric
                  </Button>
                )}
              </div>

              <Button
                onClick={handleRestart}
                variant="ghost"
                className="w-full"
                data-testid="button-restart"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Start New Concern
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {currentStep !== "initial" && currentStep !== "finalized" && (
        <Button
          onClick={handleRestart}
          variant="ghost"
          size="sm"
          className="w-full"
          data-testid="button-cancel"
        >
          Cancel and Start Over
        </Button>
      )}
    </div>
  );
}
