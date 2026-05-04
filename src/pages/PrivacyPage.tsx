import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DEFAULT_DOCUMENT_TITLE } from "../lib/documentMeta";

export function PrivacyPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = "Privacy · Party Planner";
    return () => {
      document.title = prev || DEFAULT_DOCUMENT_TITLE;
    };
  }, []);

  return (
    <div className="min-h-full bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline mb-6"
        >
          <ArrowLeft size={14} aria-hidden /> Back
        </Link>
        <article className="card p-6 sm:p-8 max-w-none text-slate-700 text-sm leading-relaxed space-y-5">
          <h1 className="font-display text-2xl font-bold text-slate-900">Privacy policy</h1>
          <p className="text-slate-500 text-sm">
            Last updated: May 2026. This describes how Party Planner handles information when you
            use the service.
          </p>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">What we collect</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Account data.</strong> Email address, display name, and credentials you
              provide when you sign up. Authentication is processed by Supabase Auth.
            </li>
            <li>
              <strong>Party content.</strong> Events, lists, guest RSVPs, activity, and other data
              you and collaborators add to the product. Guest submissions through public invite links
              are stored so hosts can run the event.
            </li>
            <li>
              <strong>Technical data.</strong> Browser type, approximate timestamps, and similar
              diagnostics when you use optional error reporting (for example Sentry) or product
              analytics if enabled by the site operator.
            </li>
          </ul>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">How we use it</h2>
          <p>
            We use this information to operate Party Planner: sync your work in real time, send
            emails you opt into (such as reminders or assignments), and improve reliability. We do
            not sell your personal information.
          </p>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">
            Optional analytics
          </h2>
          <p>
            The site operator may enable privacy-oriented, cookieless page analytics (for example{" "}
            <a
              className="text-brand-700 font-medium hover:underline"
              href="https://plausible.io"
              target="_blank"
              rel="noreferrer"
            >
              Plausible
            </a>
            ) to understand traffic in aggregate. Those tools are configured not to use advertising
            cookies. If analytics is off, no analytics script is loaded.
          </p>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">Where it lives</h2>
          <p>
            Data is stored with our infrastructure providers, including Supabase (database and auth)
            and the hosting platform (for example Vercel). Providers process data under their own
            terms and privacy policies. The site operator is responsible for the deployment and
            configuration of those services.
          </p>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">Subprocessors</h2>
          <p>
            Depending on how the operator configures Party Planner, subprocessors may include:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Supabase</strong> — database, authentication, and realtime sync.
            </li>
            <li>
              <strong>Vercel</strong> (or another host) — serving the web application and edge
              middleware.
            </li>
            <li>
              <strong>Resend</strong> (or another email provider) — transactional email when that
              integration is enabled.
            </li>
            <li>
              <strong>Sentry</strong> — optional error monitoring for client crashes.
            </li>
            <li>
              <strong>Plausible</strong> (or similar) — optional cookieless analytics when enabled.
            </li>
          </ul>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">Retention</h2>
          <p>
            We keep information while your account is active and as needed to provide the service.
            You can delete content you control within the app; account deletion and broader deletion
            practices depend on how the operator configures Supabase and backups.
          </p>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">Your choices</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Adjust email preferences in Settings when signed in.</li>
            <li>Use notification and push controls in the app where available.</li>
            <li>Contact the site operator if you need access, correction, or deletion help.</li>
          </ul>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">Children</h2>
          <p>
            Party Planner is not directed at children under 13, and we do not knowingly collect
            their personal information.
          </p>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">Changes</h2>
          <p>
            We may update this policy as the product evolves. Continued use after changes means you
            accept the updated policy.
          </p>

          <p className="text-sm text-slate-500 border-t border-slate-100 pt-4">
            For product issues, use <strong>Report a bug</strong> in the app when signed in.
          </p>
        </article>
      </div>
    </div>
  );
}
