/**
 * The auth pages both apps render, differing only in branding.
 *
 * They were copied when EnGenie was split out of SpecHub and drifted by
 * exactly two strings in two years — which is the argument for sharing
 * them: a fix to the OAuth flow has to land in both or it has landed in
 * neither. Each app's route file is now a one-line wrapper passing its
 * own name. (The ui/ kit is deliberately NOT shared: branding may diverge.)
 */
export { SignInPage } from "./sign-in-page";
export { SignInForm, NEXT_KEY, type SignInBranding } from "./sign-in-form";
export { NoAccessPage } from "./no-access";
export { RedirectingPage } from "./redirecting";
