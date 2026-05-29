import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await client.post('/auth/login', { email, password });
      login(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <Card className="w-full max-w-sm shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <CardHeader className="pb-2">
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center uppercase tracking-wider">EdDream Institute</p>
          <CardTitle className="text-xl font-semibold text-slate-900 dark:text-slate-100 text-center">Class Management</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@classapp.com"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Logging in...' : 'Log In'}
            </Button>
            <p className="text-sm text-center text-slate-500 dark:text-slate-400">
              <Link to="/forgot-password" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                Forgot password?
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
