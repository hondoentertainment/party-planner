import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DEFAULT_DOCUMENT_TITLE } from "../lib/documentMeta";

export function TermsPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = "Terms · Party Planner";
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
          <h1 className="font-display text-2xl font-bold text-slate-900">Terms of service</h1>
          <p className="text-slate-500 text-sm">
            Last updated: May 2026. By using Party Planner, you agree to these terms.
          </p>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">The service</h2>
          <p>
            Party Planner is a collaborative planning tool for personal and social events. Features
            and availability may change. We strive for reliability but do not guarantee
            uninterrupted access.
          </p>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">Your account</h2>
          <p>
            You are responsible for your login credentials and for activity under your account.
            You must provide accurate registration information and be old enough to enter a binding
            agreement where you live.
          </p>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">Acceptable use</h2>
          <p>You agree not to misuse Party Planner, including by:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Violating laws or others&apos; rights.</li>
            <li>Attempting to break, scan, or overload the service.</li>
            <li>Uploading malware or harassing other users.</li>
            <li>Scraping or reselling access without permission.</li>
          </ul>
          <p>
            The site operator may suspend or terminate access for conduct that risks the service or
            other users.
          </p>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">Content</h2>
          <p>
            You retain rights to content you create. You grant the operator a license to host,
            process, and display that content solely to run Party Planner (including sharing with
            collaborators and guests you invite). You are responsible for having the rights to the
            content you add.
          </p>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">Disclaimer</h2>
          <p>
            The service is provided &quot;as is&quot; without warranties of any kind, express or
            implied, including merchantability, fitness for a particular purpose, and
            non-infringement.
          </p>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">
            Limitation of liability
          </h2>
          <p>
            To the fullest extent permitted by law, the operator and its suppliers will not be
            liable for indirect, incidental, special, consequential, or exemplary damages, or loss of
            profits, data, or goodwill. Aggregate liability for claims relating to the service will
            not exceed the greater of fifty dollars (USD) or what you paid to use the service in the
            twelve months before the claim.
          </p>

          <h2 className="font-display text-lg font-semibold text-slate-900 pt-2">General</h2>
          <p>
            These terms are governed by the laws applicable to the site operator&apos;s
            jurisdiction, without regard to conflict-of-law rules. If a provision is unenforceable,
            the remaining provisions stay in effect.
          </p>

          <p className="text-sm text-slate-500 border-t border-slate-100 pt-4">
            See also our{" "}
            <Link to="/privacy" className="text-brand-700 font-medium hover:underline">
              Privacy policy
            </Link>{" "}
            (including subprocessors and analytics).
          </p>
        </article>
      </div>
    </div>
  );
}
