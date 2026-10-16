import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { AccountPage } from './pages/AccountPage';
import { LogoutPage } from './pages/LogoutPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';

export function App(): ReactNode {
  const { pathname } = useLocation();
  useEffect(() => {
    const titles: Record<string, string> = {
      '/login': 'Sign in',
      '/signup': 'Create account',
      '/forgot-password': 'Reset password',
      '/reset-password': 'Choose a new password',
      '/verify-email': 'Verify email',
      '/account': 'Your account',
      '/logout': 'Signing out',
      '/privacy': 'Privacy',
      '/terms': 'Terms',
    };
    document.title = `${titles[pathname] ?? 'Your account'} · aidenjang accounts`;
  }, [pathname]);
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/logout" element={<LogoutPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="*" element={<Navigate to="/account" replace />} />
    </Routes>
  );
}
