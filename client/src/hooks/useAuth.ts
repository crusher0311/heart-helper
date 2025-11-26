import { useQuery } from "@tanstack/react-query";
import type { UserWithPreferences } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<UserWithPreferences>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
  };
}
