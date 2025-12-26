import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Heart, Sparkles, Phone, FileText, TrendingUp, Users, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Landing() {
  const { toast } = useToast();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [registerFirstName, setRegisterFirstName] = useState("");
  const [registerLastName, setRegisterLastName] = useState("");
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome back!",
        description: "You have been signed in successfully.",
      });
      // Redirect to home page after successful login
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({
        title: "Sign in failed",
        description: error.message || "Please check your email and password.",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName?: string; lastName?: string }) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return await response.json();
    },
    onSuccess: (data: { user?: { isApproved?: boolean } }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      if (data.user?.isApproved) {
        toast({
          title: "Welcome!",
          description: "Your account has been created and you're ready to go.",
        });
        // Redirect approved users to home page
        window.location.href = "/";
      } else {
        toast({
          title: "Account created!",
          description: "Your account is pending admin approval. You'll be notified when approved.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: { email: string }) => {
      const response = await apiRequest("POST", "/api/auth/forgot-password", data);
      return await response.json();
    },
    onSuccess: (data: { message: string }) => {
      toast({
        title: "Check your email",
        description: data.message || "If an account exists, a password reset link has been sent.",
      });
      setForgotPasswordOpen(false);
      setForgotPasswordEmail("");
    },
    onError: (error: Error) => {
      toast({
        title: "Request failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPasswordEmail) {
      toast({
        title: "Missing information",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }
    forgotPasswordMutation.mutate({ email: forgotPasswordEmail });
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast({
        title: "Missing information",
        description: "Please enter your email and password.",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate({ email: loginEmail, password: loginPassword });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerEmail || !registerPassword) {
      toast({
        title: "Missing information",
        description: "Please enter your email and password.",
        variant: "destructive",
      });
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }
    if (registerPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    registerMutation.mutate({
      email: registerEmail,
      password: registerPassword,
      firstName: registerFirstName || undefined,
      lastName: registerLastName || undefined,
    });
  };

  useEffect(() => {
    document.title = "HEART Helper";
    
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", "HEART Helper finds similar repair jobs, generates personalized sales scripts, and helps service advisors deliver exceptional customer service.");
    } else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = "HEART Helper finds similar repair jobs, generates personalized sales scripts, and helps service advisors deliver exceptional customer service.";
      document.head.appendChild(meta);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        <header className="flex items-center justify-center mb-12" data-testid="landing-header">
          <div className="flex items-center gap-3" data-testid="landing-brand">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Heart className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">HEART Helper</span>
          </div>
        </header>

        <main className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div className="text-left" data-testid="hero-section">
              <h1 className="text-3xl md:text-4xl font-bold mb-4">
                Welcome to <span className="text-primary">HEART Helper</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-6">
                Find similar repair jobs, generate personalized sales scripts, 
                and deliver exceptional customer service.
              </p>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Smart Job Search</h3>
                    <p className="text-sm text-muted-foreground">AI-powered matching based on your shop's history</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Concern Intake</h3>
                    <p className="text-sm text-muted-foreground">AI-guided diagnostic questions for customer calls</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Sales Scripts</h3>
                    <p className="text-sm text-muted-foreground">Context-aware scripts that learn from your success</p>
                  </div>
                </div>
              </div>
            </div>

            <Card className="w-full" data-testid="auth-card">
              <CardHeader className="pb-4">
                <CardTitle>Get Started</CardTitle>
                <CardDescription>
                  Sign in or create an account to access HEART Helper
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="login" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="login" data-testid="tab-login">Sign In</TabsTrigger>
                    <TabsTrigger value="register" data-testid="tab-register">Create Account</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="login">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="login-email">Email</Label>
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="you@example.com"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          disabled={loginMutation.isPending}
                          data-testid="input-login-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="login-password">Password</Label>
                        <Input
                          id="login-password"
                          type="password"
                          placeholder="Enter your password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          disabled={loginMutation.isPending}
                          data-testid="input-login-password"
                        />
                      </div>
                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={loginMutation.isPending}
                        data-testid="button-login"
                      >
                        {loginMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          "Sign In"
                        )}
                      </Button>
                      <div className="text-center mt-2">
                        <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              className="text-sm text-muted-foreground underline-offset-4 hover:underline p-0 h-auto"
                              type="button"
                              data-testid="link-forgot-password"
                            >
                              Forgot your password?
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <form onSubmit={handleForgotPassword}>
                              <DialogHeader>
                                <DialogTitle>Reset Password</DialogTitle>
                                <DialogDescription>
                                  Enter your email address and we'll send you a link to reset your password.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <Label htmlFor="forgot-email">Email</Label>
                                  <Input
                                    id="forgot-email"
                                    type="email"
                                    placeholder="you@example.com"
                                    value={forgotPasswordEmail}
                                    onChange={(e) => setForgotPasswordEmail(e.target.value)}
                                    disabled={forgotPasswordMutation.isPending}
                                    data-testid="input-forgot-email"
                                  />
                                </div>
                              </div>
                              <DialogFooter>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    setForgotPasswordOpen(false);
                                    setForgotPasswordEmail("");
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="submit"
                                  disabled={forgotPasswordMutation.isPending}
                                  data-testid="button-send-reset-link"
                                >
                                  {forgotPasswordMutation.isPending ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Sending...
                                    </>
                                  ) : (
                                    "Send Reset Link"
                                  )}
                                </Button>
                              </DialogFooter>
                            </form>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </form>
                  </TabsContent>
                  
                  <TabsContent value="register">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="register-first-name">First Name</Label>
                          <Input
                            id="register-first-name"
                            type="text"
                            placeholder="John"
                            value={registerFirstName}
                            onChange={(e) => setRegisterFirstName(e.target.value)}
                            disabled={registerMutation.isPending}
                            data-testid="input-register-first-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="register-last-name">Last Name</Label>
                          <Input
                            id="register-last-name"
                            type="text"
                            placeholder="Doe"
                            value={registerLastName}
                            onChange={(e) => setRegisterLastName(e.target.value)}
                            disabled={registerMutation.isPending}
                            data-testid="input-register-last-name"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-email">Email</Label>
                        <Input
                          id="register-email"
                          type="email"
                          placeholder="you@example.com"
                          value={registerEmail}
                          onChange={(e) => setRegisterEmail(e.target.value)}
                          disabled={registerMutation.isPending}
                          data-testid="input-register-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-password">Password</Label>
                        <Input
                          id="register-password"
                          type="password"
                          placeholder="At least 8 characters"
                          value={registerPassword}
                          onChange={(e) => setRegisterPassword(e.target.value)}
                          disabled={registerMutation.isPending}
                          data-testid="input-register-password"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-confirm-password">Confirm Password</Label>
                        <Input
                          id="register-confirm-password"
                          type="password"
                          placeholder="Confirm your password"
                          value={registerConfirmPassword}
                          onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                          disabled={registerMutation.isPending}
                          data-testid="input-register-confirm-password"
                        />
                      </div>
                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={registerMutation.isPending}
                        data-testid="button-register"
                      >
                        {registerMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating account...
                          </>
                        ) : (
                          "Create Account"
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        HEART Auto Care emails are auto-approved. Other emails require admin approval.
                      </p>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <div className="mt-16 text-center">
            <p className="text-muted-foreground text-sm">
              Built for HEART Certified Auto Care
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
