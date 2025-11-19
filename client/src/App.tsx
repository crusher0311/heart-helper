import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import Home from "@/pages/home";
import ImportPage from "@/pages/import";
import NotFound from "@/pages/not-found";
import { Search, Upload } from "lucide-react";

function Router() {
  const [location] = useLocation();
  
  return (
    <>
      <nav className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-2 flex gap-2">
          <Link href="/">
            <Button 
              variant={location === "/" ? "default" : "ghost"} 
              size="sm"
              data-testid="nav-search"
            >
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </Link>
          <Link href="/import">
            <Button 
              variant={location === "/import" ? "default" : "ghost"} 
              size="sm"
              data-testid="nav-import"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import Data
            </Button>
          </Link>
        </div>
      </nav>
      <Switch>
        <Route path="/" component={Home}/>
        <Route path="/import" component={ImportPage} />
        <Route component={NotFound} />
      </Switch>
    </>
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
