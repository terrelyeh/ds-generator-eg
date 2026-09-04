import { Suspense } from "react";
import { SignInForm, type SignInBranding } from "./sign-in-form";

/** The sign-in page. `useSearchParams` needs a Suspense boundary above it. */
export function SignInPage(props: SignInBranding) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="text-sm text-engenius-gray">Loading…</div>
        </div>
      }
    >
      <SignInForm {...props} />
    </Suspense>
  );
}
