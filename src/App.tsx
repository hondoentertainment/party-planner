import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { AppShell } from "./components/AppShell";
import { SetupNotice } from "./components/SetupNotice";

const AuthPage = lazy(() => import("./pages/AuthPage").then((m) => ({ default: m.AuthPage })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const CalendarPage = lazy(() =>
  import("./pages/CalendarPage").then((m) => ({ default: m.CalendarPage }))
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const EventPage = lazy(() => import("./pages/EventPage").then((m) => ({ default: m.EventPage })));
const UpdatePasswordPage = lazy(() =>
  import("./pages/UpdatePasswordPage").then((m) => ({ default: m.UpdatePasswordPage }))
);
const PublicEventPage = lazy(() =>
  import("./pages/PublicEventPage").then((m) => ({ default: m.PublicEventPage }))
);
const UnsubscribeLandingPage = lazy(() =>
  import("./pages/UnsubscribeLandingPage").then((m) => ({ default: m.UnsubscribeLandingPage }))
);
const PrivacyPage = lazy(() =>
  import("./pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage }))
);
const TermsPage = lazy(() =>
  import("./pages/TermsPage").then((m) => ({ default: m.TermsPage }))
);

const Loading = () => (
  <div className="h-full min-h-72 flex items-center justify-center py-16" role="status" aria-live="polite">
    <div className="card p-5 flex items-center gap-3 text-slate-600 shadow-soft">
      <span className="h-3 w-3 rounded-full bg-brand-500 animate-pulse" aria-hidden />
      <span className="text-sm font-medium">Loading your party planner…</span>
    </div>
  </div>
);

export function App() {
  const { pathname } = useLocation();
  const { configured, loading, user, passwordRecovery } = useAuth();

  if (!configured) {
    if (pathname === "/privacy" || pathname === "/terms") {
      return (
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      );
    }
    return <SetupNotice />;
  }
  if (loading) return <Loading />;

  if (window.location.pathname.startsWith("/email/unsubscribe")) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/email/unsubscribe" element={<UnsubscribeLandingPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (window.location.pathname.startsWith("/s/")) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/s/:token" element={<PublicEventPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (user && passwordRecovery) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/update-password" element={<UpdatePasswordPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<UpdatePasswordPage />} />
        </Routes>
      </Suspense>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/forgot" element={<AuthPage startMode="forgot" />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<AuthPage />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <AppShell>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/events/:eventId/*" element={<EventPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/update-password" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
