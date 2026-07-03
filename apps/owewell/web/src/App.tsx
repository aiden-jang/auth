import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { GroupDetailPage } from './pages/GroupDetailPage';
import { InvitePage } from './pages/InvitePage';
import { QuickSplitPage } from './pages/QuickSplitPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { BrandMark } from './components/BrandMark';
import { SiteFooter } from './components/SiteFooter';

export function App(): ReactNode {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-muted">
        <span className="animate-pulse">
          <BrandMark size={40} />
        </span>
        <span className="text-sm">Counting the receipts...</span>
      </div>
    );
  }

  // Login, signup, and password flows all live on the shared auth service now; owewell
  // only redirects out to them (see AuthContext).
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/split" element={<QuickSplitPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/groups/:id" element={<GroupDetailPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
      <SiteFooter />
    </div>
  );
}
