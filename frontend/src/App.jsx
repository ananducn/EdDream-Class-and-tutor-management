import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AppLayout from '@/components/AppLayout';
import LoginPage from '@/pages/LoginPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import AcceptInvitePage from '@/pages/AcceptInvitePage';
import UniversitiesPage from '@/pages/master/UniversitiesPage';
import StreamsPage from '@/pages/master/StreamsPage';
import BatchesPage from '@/pages/master/BatchesPage';
import SubjectsPage from '@/pages/master/SubjectsPage';
import FacultyPage from '@/pages/FacultyPage';
import ClassesPage from '@/pages/ClassesPage';
import TimetablePage from '@/pages/TimetablePage';
import TimetableUniversityPage from '@/pages/timetable/TimetableUniversityPage';
import TimetableCalendarPage from '@/pages/timetable/TimetableCalendarPage';
import DashboardPage from '@/pages/DashboardPage';
import ReportsPage from '@/pages/ReportsPage';
import UsersPage from '@/pages/UsersPage';
import ActivityLogPage from '@/pages/ActivityLogPage';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isLoading, isAdmin } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin()) return <Navigate to="/dashboard" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function PublicRoute({ children }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Public routes */}
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />

          {/* Protected routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          } />
          <Route path="/classes" element={<ProtectedRoute><ClassesPage /></ProtectedRoute>} />
          <Route path="/timetable" element={<ProtectedRoute><TimetablePage /></ProtectedRoute>} />
          <Route path="/timetable/:universityId" element={<ProtectedRoute><TimetableUniversityPage /></ProtectedRoute>} />
          <Route path="/timetable/:universityId/:batchId" element={<ProtectedRoute><TimetableCalendarPage /></ProtectedRoute>} />
          <Route path="/faculty" element={<ProtectedRoute adminOnly><FacultyPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute adminOnly><UsersPage /></ProtectedRoute>} />
          <Route path="/activity-log" element={<ProtectedRoute adminOnly><ActivityLogPage /></ProtectedRoute>} />

          {/* Settings — admin only */}
          <Route path="/settings/universities" element={<ProtectedRoute adminOnly><UniversitiesPage /></ProtectedRoute>} />
          <Route path="/settings/streams" element={<ProtectedRoute adminOnly><StreamsPage /></ProtectedRoute>} />
          <Route path="/settings/batches" element={<ProtectedRoute adminOnly><BatchesPage /></ProtectedRoute>} />
          <Route path="/settings/subjects" element={<ProtectedRoute adminOnly><SubjectsPage /></ProtectedRoute>} />
        </Routes>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}
