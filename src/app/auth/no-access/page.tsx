import Link from "next/link";

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#dc2626"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
        </div>

        <h1 className="text-center font-heading text-xl font-bold text-engenius-dark">
          No Access
        </h1>

        <p className="mt-3 text-center text-sm text-engenius-gray">
          Your Google account is not authorized to use Product SpecHub. Please
          contact your admin to request access.
        </p>

        <div className="mt-8">
          <Link
            href="/auth/sign-in"
            className="block w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Try a different account
          </Link>
        </div>
      </div>
    </div>
  );
}
