/**
 * Role-based permission matrix for Product SpecHub.
 *
 * Roles:
 *   admin   — full access incl. user management
 *   editor  — MKT (edit content + generate PDFs)
 *   pm      — review/approve content only (no edit, no Ask)
 *   viewer  — read-only + Ask SpecHub (sales / field)
 *
 * Permissions are enumerated explicitly so we can audit at a glance who can
 * do what. Add a permission here, then grep for it in the codebase to find
 * everywhere that gates on it.
 */

export const ROLES = ["admin", "editor", "pm", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  editor: "Editor",
  pm: "PM",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access including user management",
  editor: "Edit product content and generate PDFs (MKT)",
  pm: "Review and approve content only",
  viewer: "Read-only access plus Ask SpecHub",
};

/**
 * The full set of actions the app gates on. When adding a new gated action,
 * add it here first, then update PERMISSIONS to set who can do it.
 */
export type Permission =
  // content
  | "product.view"
  | "product.edit"
  | "product.upload_image"
  // sync
  | "sync.run"
  // translation
  | "translation.edit"
  // pdf
  | "pdf.generate"
  // review workflow (Phase 2)
  | "review.approve"
  | "review.self_approve"
  // settings
  | "settings.view"
  | "settings.edit_typography"
  | "settings.edit_glossary"
  | "settings.edit_personas"
  | "settings.edit_api_keys"
  // user management
  | "users.view"
  | "users.invite"
  | "users.update_role"
  | "users.remove"
  // RAG / knowledge
  | "ask.use"
  | "knowledge.view"
  | "knowledge.edit";

const PERMISSIONS: Record<Permission, Role[]> = {
  // Everyone can view product / dashboard / preview
  "product.view": ["admin", "editor", "pm", "viewer"],
  "product.edit": ["admin", "editor"],
  "product.upload_image": ["admin", "editor"],

  "sync.run": ["admin", "editor"],

  "translation.edit": ["admin", "editor"],

  "pdf.generate": ["admin", "editor"],

  "review.approve": ["admin", "pm"],
  "review.self_approve": ["admin", "editor"],

  "settings.view": ["admin"],
  "settings.edit_typography": ["admin"],
  "settings.edit_glossary": ["admin"],
  "settings.edit_personas": ["admin"],
  "settings.edit_api_keys": ["admin"],

  "users.view": ["admin"],
  "users.invite": ["admin"],
  "users.update_role": ["admin"],
  "users.remove": ["admin"],

  // PM is excluded from Ask intentionally — they're a pure review role.
  "ask.use": ["admin", "editor", "viewer"],
  "knowledge.view": ["admin", "editor"],
  "knowledge.edit": ["admin", "editor"],
};

/** Check if a role can perform an action. */
export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSIONS[permission].includes(role);
}

/** Throw if role can't perform action — for server-side guards. */
export function assertCan(role: Role | null | undefined, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(
      `Forbidden: role=${role ?? "anonymous"} cannot perform ${permission}`
    );
  }
}

/** Type guard. */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
