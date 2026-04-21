import { PartyPopper } from "lucide-react";

export function SetupNotice() {
  return (
    <div className="min-h-full bg-gradient-to-br from-brand-50 via-white to-amber-50 flex items-center justify-center p-6">
      <div className="card max-w-2xl w-full p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-brand-600 text-white grid place-items-center shadow-pop">
            <PartyPopper size={24} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Almost ready to party</h1>
            <p className="text-slate-500">Connect your free Supabase project to enable collaboration.</p>
          </div>
        </div>

        <ol className="space-y-3 text-sm text-slate-700 list-decimal list-inside">
          <li>
            Create a free project at{" "}
            <a
              className="text-brand-600 underline"
              href="https://supabase.com"
              target="_blank"
              rel="noreferrer"
            >
              supabase.com
            </a>
            .
          </li>
          <li>
            In the SQL editor, paste and run{" "}
            <code className="bg-slate-100 rounded px-1">supabase/migrations/0001_init.sql</code>{" "}
            from this repo.
          </li>
          <li>
            In <strong>Project Settings → API</strong>, copy the <em>Project URL</em> and{" "}
            <em>anon public key</em>.
          </li>
          <li>
            Create a <code className="bg-slate-100 rounded px-1">.env.local</code> file in the
            project root:
            <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 mt-2 text-xs overflow-auto">
{`VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY`}
            </pre>
          </li>
          <li>Restart the dev server.</li>
        </ol>
      </div>
    </div>
  );
}
