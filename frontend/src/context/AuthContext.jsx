import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (!savedToken) {
      setIsLoading(false);
      return;
    }
    client.get('/auth/me')
      .then((res) => {
        setUser(res.data);
        setToken(savedToken);
      })
      .catch(() => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  function login(newToken, userData) {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }

  function isAdmin() {
    return user?.role === 'admin';
  }

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
