import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { AppShell } from "./components/AppShell";
import { SetupNotice } from "./components/SetupNotice";

const AuthPage = lazy(() => import("./pages/AuthPage").then((m) => ({ default: m.AuthPage })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const CalendarPage = lazy(() =>
  import("./pages/CalendarPage").then((m) => ({ default: m.CalendarPage }))
);
const EventPage = lazy(() => import("./pages/EventPage").then((m) => ({ default: m.EventPage })));

const Loading = () => (
  <div className="h-full flex items-center justify-center text-slate-500 py-16">
    Loading…
  </div>
);

export function App() {
  const { configured, loading, user } = useAuth();

  if (!configured) return <SetupNotice />;
  if (loading) return <Loading />;

  if (!user) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
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
          <Route path="/events/:eventId/*" element={<EventPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
