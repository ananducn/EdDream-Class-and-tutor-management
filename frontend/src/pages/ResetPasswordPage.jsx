import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import client from '@/api/client';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get('token');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      return setError('Passwords do not match.');
    }
    setLoading(true);
    try {
      await client.post('/auth/reset-password', { token, newPassword });
      toast.success('Password updated! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <Card className="w-full max-w-sm shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-semibold text-slate-900 dark:text-slate-100 text-center">Set New Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="newPassword" className="text-sm font-medium text-slate-700 dark:text-slate-300">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700 dark:text-slate-300">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Saving...' : 'Set New Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
