'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authService, AuthUser } from '@/lib/auth';

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthProviderProps {
  children: ReactNode;
}

// Routes that don't require authentication
const publicRoutes = ['/login'];

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check auth status on mount
    const checkAuth = () => {
      const isAuthenticated = authService.isAuthenticated();
      const currentUser = authService.getUser();
      
      setUser(currentUser);
      setIsLoading(false);

      // Redirect to login if not authenticated and not on public route
      if (!isAuthenticated && !publicRoutes.includes(pathname)) {
        router.push('/login');
      }
      
      // Redirect to home if authenticated and on login page
      if (isAuthenticated && pathname === '/login') {
        router.push('/');
      }
    };

    checkAuth();
  }, [pathname, router]);

  const logout = () => {
    authService.logout();
    setUser(null);
    router.push('/login');
  };

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center space-x-2">
          <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-600 dark:text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  // Don't render protected content if not authenticated (except public routes)
  if (!authService.isAuthenticated() && !publicRoutes.includes(pathname)) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
