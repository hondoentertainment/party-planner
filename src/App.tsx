import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { AuthPage } from "./pages/AuthPage";
import { Dashboard } from "./pages/Dashboard";
import { CalendarPage } from "./pages/CalendarPage";
import { EventPage } from "./pages/EventPage";
import { AppShell } from "./components/AppShell";
import { SetupNotice } from "./components/SetupNotice";

export function App() {
  const { configured, loading, user } = useAuth();

  if (!configured) return <SetupNotice />;
  if (loading)
    return (
      <div className="h-full flex items-center justify-center text-slate-500">Loading…</div>
    );

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/events/:eventId/*" element={<EventPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
