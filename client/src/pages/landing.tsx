import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Sparkles, Phone, FileText, TrendingUp, Users } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
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
        <header className="flex items-center justify-between mb-16" data-testid="landing-header">
          <div className="flex items-center gap-3" data-testid="landing-brand">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Heart className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">HEART Helper</span>
          </div>
          <Button onClick={handleLogin} data-testid="button-login">
            Sign In
          </Button>
        </header>

        <main className="max-w-4xl mx-auto text-center">
          <div className="mb-12" data-testid="hero-section">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Welcome to <span className="text-primary">HEART Helper</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Find similar repair jobs, generate personalized sales scripts, 
              and deliver exceptional customer service.
            </p>
            <Button size="lg" onClick={handleLogin} className="gap-2" data-testid="button-login">
              Sign In to Get Started
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-16" data-testid="features-grid">
            <Card className="text-left" data-testid="feature-card-search">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Smart Job Search</CardTitle>
                <CardDescription>
                  Find similar past repairs instantly with AI-powered matching
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Search by vehicle, repair type, and get accurate estimates based on your shop's actual history.
                </p>
              </CardContent>
            </Card>

            <Card className="text-left" data-testid="feature-card-intake">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <Phone className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Concern Intake</CardTitle>
                <CardDescription>
                  AI-guided diagnostic questions for customer calls
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Ask the right follow-up questions and capture complete concern details for your technicians.
                </p>
              </CardContent>
            </Card>

            <Card className="text-left" data-testid="feature-card-scripts">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Sales Scripts</CardTitle>
                <CardDescription>
                  Context-aware scripts that improve over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Get personalized scripts for in-shop presentations and follow-up calls that learn from your successes.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="bg-card border rounded-xl p-8 mb-16">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Users className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold">Personal Preferences</h2>
            </div>
            <p className="text-muted-foreground mb-6">
              Each team member gets their own profile with customized settings, 
              default locations, and AI that learns from their personal selling style.
            </p>
            <div className="grid md:grid-cols-3 gap-4 text-left">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold mb-1">Your Default Shop</h3>
                <p className="text-sm text-muted-foreground">Set your home location for quick searches</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold mb-1">Personal Scripts</h3>
                <p className="text-sm text-muted-foreground">Train the AI with your best examples</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold mb-1">Track Success</h3>
                <p className="text-sm text-muted-foreground">See what's working and improve over time</p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-muted-foreground mb-4">
              Built for HEART Certified Auto Care
            </p>
            <Button variant="outline" onClick={handleLogin} data-testid="button-sign-in-footer">
              Sign In to Get Started
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
