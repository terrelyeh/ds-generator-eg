import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="text-sm text-engenius-gray">Loading…</div>
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
