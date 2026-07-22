import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <div className="max-w-md rounded-md border border-slate-200 bg-white p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <ShieldAlert className="h-6 w-6 text-amber-600" />
        </div>
        <h1 className="font-heading text-xl font-bold text-navy">
          Access restricted
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Your role doesn&apos;t have permission to view this page. Contact your
          administrator if you believe this is a mistake.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Return to dashboard
        </Link>
      </div>
    </div>
  );
}
