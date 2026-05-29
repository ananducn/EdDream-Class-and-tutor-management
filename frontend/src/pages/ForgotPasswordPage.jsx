import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import client from '@/api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await client.post('/auth/forgot-password', { email });
    } catch {
      // Silently ignore — always show success message
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <Card className="w-full max-w-sm shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-semibold text-slate-900 dark:text-slate-100 text-center">Reset Password</CardTitle>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <p className="text-sm text-center text-slate-500 dark:text-slate-400">
              If that email is registered, you'll receive a reset link shortly.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </form>
          )}
          <p className="mt-4 text-sm text-center">
            <Link to="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">
              Back to login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
