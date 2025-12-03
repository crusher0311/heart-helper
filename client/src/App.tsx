import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Home from "@/pages/home";
import Settings from "@/pages/settings";
import Admin from "@/pages/admin";
import AdminLaborRates from "@/pages/admin-labor-rates";
import AdminCoachingCriteria from "@/pages/admin-coaching-criteria";
import AdminExtensionMapping from "@/pages/admin-extension-mapping";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Home}/>
      <Route path="/settings" component={Settings}/>
      <Route path="/admin" component={Admin}/>
      <Route path="/admin/labor-rates" component={AdminLaborRates}/>
      <Route path="/admin/coaching-criteria" component={AdminCoachingCriteria}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
