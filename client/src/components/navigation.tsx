import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Phone, BarChart3, ShieldCheck, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import heartLogo from "@assets/HCAC_1764080802250.png";

async function handleLogout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch (error) {
    console.error("Logout error:", error);
  }
  window.location.href = "/";
}

interface NavigationProps {
  children?: React.ReactNode;
}

export function Navigation({ children }: NavigationProps) {
  const { user } = useAuth();
  const [location] = useLocation();

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
  });

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <header className="border-b bg-card sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <img 
                src={heartLogo} 
                alt="HEART Certified Auto Care" 
                className="h-10 w-auto"
                data-testid="img-heart-logo"
              />
              <div className="hidden sm:block">
                <h1 className="text-base font-semibold leading-tight" data-testid="text-app-title">
                  Helper
                </h1>
                <p className="text-[10px] text-muted-foreground leading-tight">AI-Powered Repair History</p>
              </div>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-1">
          {children}
          
          {children && <div className="w-px h-6 bg-border mx-1" />}
          
          <nav className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/">
                  <Button 
                    variant={isActive("/") && !isActive("/calls") && !isActive("/coaching") && !isActive("/admin") && !isActive("/settings") ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-1.5 px-2 sm:px-3"
                    data-testid="nav-search"
                  >
                    <Search className="w-4 h-4" />
                    <span className="hidden sm:inline">Search</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">Search Jobs</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/calls">
                  <Button 
                    variant={isActive("/calls") ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-1.5 px-2 sm:px-3"
                    data-testid="nav-calls"
                  >
                    <Phone className="w-4 h-4" />
                    <span className="hidden sm:inline">Calls</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">Call History</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/coaching">
                  <Button 
                    variant={isActive("/coaching") ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-1.5 px-2 sm:px-3"
                    data-testid="nav-coaching"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span className="hidden sm:inline">Coaching</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">Coaching Dashboard</TooltipContent>
            </Tooltip>

            {adminCheck?.isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/admin">
                    <Button 
                      variant={isActive("/admin") ? "secondary" : "ghost"}
                      size="sm"
                      className="gap-1.5 px-2 sm:px-3"
                      data-testid="nav-admin"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span className="hidden md:inline">Admin</span>
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent className="md:hidden">Admin Panel</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/settings">
                  <Button 
                    variant={isActive("/settings") ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-1.5 px-2 sm:px-3"
                    data-testid="nav-settings"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="hidden md:inline">Settings</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent className="md:hidden">Settings</TooltipContent>
            </Tooltip>

            <div className="w-px h-6 bg-border mx-1" />

            {user && (
              <div className="flex items-center gap-1.5">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
                  <AvatarFallback className="text-xs">
                    {user.firstName?.[0] || user.email?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium hidden lg:inline max-w-[80px] truncate">
                  {user.firstName || user.email?.split('@')[0]}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleLogout}
                      data-testid="button-logout"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <LogOut className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Log out</TooltipContent>
                </Tooltip>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
