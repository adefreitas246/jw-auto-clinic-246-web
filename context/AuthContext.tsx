// context/AuthContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import React, { createContext, useContext, useEffect, useState } from 'react';

export type User = {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  token: string;
  phone?: string;
  avatar?: string | null;
  notificationsEnabled?: boolean;
  // accountType?: 'User' | 'Worker'; // optional if you ever want it in state
};

interface AuthContextProps {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  updateProfile: (profileData: Partial<User>) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword?: (token: string, password: string) => Promise<void>;
  // verifyResetToken?: (token: string) => Promise<boolean>; // optional
}

const AuthContext = createContext<AuthContextProps>({} as AuthContextProps);

// ---- global axios setup (new) ----
axios.defaults.baseURL =
  process.env.EXPO_PUBLIC_API_URL || 'https://jw-auto-clinic-246.onrender.com';
axios.defaults.headers.common['Accept'] = 'application/json';

// Auto-logout on 401 (new)
let isHandling401 = false;
axios.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error?.response?.status === 401 && !isHandling401) {
      isHandling401 = true;
      try {
        await AsyncStorage.removeItem('@user');
      } catch {}
      delete axios.defaults.headers.common['Authorization'];
      // We can’t use hooks here; the AuthGate will redirect when user becomes null after next app render
    }
    isHandling401 = false;
    return Promise.reject(error);
  }
);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const jsonValue = await AsyncStorage.getItem('@user');
        if (jsonValue) {
          const parsed = JSON.parse(jsonValue);
          axios.defaults.headers.common['Authorization'] = `Bearer ${parsed.token}`;
          await fetchUserProfile(parsed.token); // re-fetch on launch
        }
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    // normalise email to match backend lookups (new)
    const normalizedEmail = (email || '').trim().toLowerCase();

    const response = await axios.post('/api/auth/login', {
      email: normalizedEmail,
      password,
    });

    const userData = response.data; // includes token
    axios.defaults.headers.common['Authorization'] = `Bearer ${userData.token}`;
    await fetchUserProfile(userData.token); // pull profile after login
  };

  const logout = async () => {
    await AsyncStorage.removeItem('@user');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null); // triggers AuthGate logic
  };

  const updateProfile = async (profileData: Partial<User>) => {
    if (!user) throw new Error('No user logged in');

    try {
      const response = await axios.put('/api/profile', profileData, {
        headers: { Authorization: `Bearer ${user.token}` },
      });

      const updatedUser = { ...user, ...response.data };
      setUser(updatedUser);
      await AsyncStorage.setItem('@user', JSON.stringify(updatedUser));
    } catch (error) {
      console.error('Profile update failed:', error);
      throw error;
    }
  };

  const fetchUserProfile = async (token: string) => {
    try {
      const res = await axios.get('/api/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const updatedUser = { ...res.data, token } as User;
      setUser(updatedUser);
      await AsyncStorage.setItem('@user', JSON.stringify(updatedUser));
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
      // If profile fails (e.g., token revoked), ensure we clear stale state
      await AsyncStorage.removeItem('@user');
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
    }
  };

  const forgotPassword = async (email: string) => {
    // normalise email to match backend (new)
    const normalizedEmail = (email || '').trim().toLowerCase();

    try {
      const res = await axios.post('/api/auth/forgot-password', {
        email: normalizedEmail,
      });

      if (!res.data.message?.toLowerCase().includes('reset')) {
        throw new Error(res.data?.error || 'Unexpected response');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || 'Request failed';
      throw new Error(msg);
    }
  };

  const resetPassword = async (token: string, password: string) => {
    try {
      const res = await axios.post('/api/auth/reset-password', {
        token,
        password,
      });

      if (!res.data.message?.toLowerCase().includes('success')) {
        throw new Error(res.data?.error || 'Unexpected response');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || 'Reset failed';
      throw new Error(msg);
    }
  };

  // Optional: pre-validate tokens so your reset screen can show a nicer error state
  // const verifyResetToken = async (token: string) => {
  //   try {
  //     await axios.get(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`);
  //     return true;
  //   } catch {
  //     return false;
  //   }
  // };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        loading,
        updateProfile,
        forgotPassword,
        resetPassword,
        // verifyResetToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
