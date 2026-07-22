import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface SafeUser {
  id: number;
  email: string;
  display_name: string | null;
  age: number | null;
  gender: string | null;
  looking_for: string;
  bio: string | null;
  photo_path: string | null;
  grade: number | null;
  subscription_status: string;
  subscription_updated_at: string | null;
  regrades_available: number;
  boost_until: string | null;
  likes_revealed: number;
  created_at: string;
  latitude?: number;
  longitude?: number;
  max_distance?: number;
  location_city?: string;
  location_state?: string;
  distance_km?: number;
  photos?: { id: number; photo_path: string; sort_order: number; is_primary: boolean }[];
}

interface AuthState {
  user: SafeUser | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refetch: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refetch();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
