import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '@ai-kindle/shared';
import { authApi } from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, role: UserRole, publisherId?: string, inviteToken?: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        // Invalid user data, clear it
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        setLoading(false);
        return;
      }
      
      // Verify token is still valid
      authApi.getMe()
        .then((result) => {
          if (result.success && result.data) {
            setUser(result.data);
            localStorage.setItem('user', JSON.stringify(result.data));
          } else {
            // Token invalid, clear storage but don't redirect (let the app handle it)
            logout();
          }
        })
        .catch((error) => {
          // Token invalid or network error
          console.error('Token validation failed:', error);
          // Clear storage but don't redirect during initial load
          logout();
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    if (result.success && result.data) {
      setUser(result.data.user);
      setToken(result.data.token);
      localStorage.setItem('token', result.data.token);
      localStorage.setItem('user', JSON.stringify(result.data.user));
    } else {
      throw new Error(result.error || 'Login failed');
    }
  };

  const signup = async (email: string, password: string, name: string, role: UserRole, publisherId?: string, inviteToken?: string) => {
    const result = await authApi.signup({ email, password, name, role, publisherId, inviteToken });
    if (result.success && result.data) {
      setUser(result.data.user);
      setToken(result.data.token);
      localStorage.setItem('token', result.data.token);
      localStorage.setItem('user', JSON.stringify(result.data.user));
    } else {
      throw new Error(result.error || 'Signup failed');
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, signup, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

