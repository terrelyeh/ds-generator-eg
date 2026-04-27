"use client";

/**
 * Admin-only user management UI. Three responsibilities:
 *   - Invite a new user (writes to email_whitelist; user becomes Active
 *     once they Google-sign-in for the first time)
 *   - Active Users tab: change role / remove
 *   - Pending Invites tab: cancel an invite that hasn't been used yet
 *
 * Self-protection (also enforced server-side):
 *   - You can't change your own role
 *   - You can't remove yourself
 *   - The last admin can't be demoted/removed
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ROLE_LABELS, type Role, ROLES } from "@/lib/auth/permissions";

interface ActiveUser {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: string;
  last_sign_in_at: string | null;
  created_at: string;
}

interface PendingInvite {
  email: string;
  role: string;
  invited_at: string;
  invited_by: string | null;
  invited_by_name: string | null;
  note: string | null;
}

type Tab = "active" | "pending";

interface UsersManagerProps {
  currentUserId: string;
}

export function UsersManager({ currentUserId }: UsersManagerProps) {
  const [active, setActive] = useState<ActiveUser[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");
  const [inviting, setInviting] = useState(false);

  // Per-row pending action state (so we only spinner the one being changed)
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setActive(data.active ?? []);
      setPending(data.pending ?? []);
    } catch (err) {
      toast.error(
        `Failed to load users: ${err instanceof Error ? err.message : err}`
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    setInviting(true);
    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invite failed");
      toast.success(`Invited ${email} as ${ROLE_LABELS[inviteRole]}`);
      setInviteEmail("");
      setInviteRole("viewer");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(userId: string, role: Role) {
    setPendingId(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      toast.success("Role updated");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemoveUser(userId: string, email: string) {
    if (
      !confirm(
        `Remove ${email}? They'll lose access immediately. Already-generated PDFs and version history are preserved.`
      )
    ) {
      return;
    }
    setPendingId(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove");
      toast.success("User removed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  }

  async function handleCancelInvite(email: string) {
    if (!confirm(`Cancel invite for ${email}?`)) return;
    setPendingId(email);
    try {
      const res = await fetch(
        `/api/users/whitelist/${encodeURIComponent(email)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel");
      toast.success("Invite cancelled");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  }

  const filteredActive = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return active;
    return active.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name?.toLowerCase().includes(q) ?? false)
    );
  }, [active, search]);

  const filteredPending = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter((p) => p.email.toLowerCase().includes(q));
  }, [pending, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage who can access Product SpecHub. Admin-only.
        </p>
      </div>

      {/* Invite form */}
      <form
        onSubmit={handleInvite}
        className="rounded-xl border bg-white p-5 shadow-sm"
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <span className="text-engenius-blue">✉️</span> Invite new user
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="email"
            placeholder="someone@engeniustech.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            disabled={inviting}
            required
            className="flex-1 min-w-[220px] rounded-md border px-3 py-2 text-sm outline-none focus:border-engenius-blue focus:ring-1 focus:ring-engenius-blue/30"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            disabled={inviting}
            className="rounded-md border px-3 py-2 text-sm outline-none focus:border-engenius-blue focus:ring-1 focus:ring-engenius-blue/30"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="rounded-md bg-engenius-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-engenius-blue/90 disabled:opacity-60"
          >
            {inviting ? "Inviting…" : "+ Invite"}
          </button>
        </div>
      </form>

      {/* Tabs + search */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4">
          <div className="flex">
            <TabButton
              active={tab === "active"}
              onClick={() => setTab("active")}
              label={`Active Users (${active.length})`}
            />
            <TabButton
              active={tab === "pending"}
              onClick={() => setTab("pending")}
              label={`Pending Invites (${pending.length})`}
            />
          </div>
          <div className="py-2">
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-md border px-3 py-1.5 text-sm outline-none focus:border-engenius-blue focus:ring-1 focus:ring-engenius-blue/30"
            />
          </div>
        </div>

        <div>
          {loading ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : tab === "active" ? (
            <ActiveList
              users={filteredActive}
              currentUserId={currentUserId}
              pendingId={pendingId}
              onRoleChange={handleRoleChange}
              onRemove={handleRemoveUser}
            />
          ) : (
            <PendingList
              invites={filteredPending}
              pendingId={pendingId}
              onCancel={handleCancelInvite}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-3 text-sm font-medium transition-colors ${
        active
          ? "text-engenius-blue"
          : "text-muted-foreground hover:text-engenius-dark"
      }`}
    >
      {label}
      {active && (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-engenius-blue" />
      )}
    </button>
  );
}

function ActiveList({
  users,
  currentUserId,
  pendingId,
  onRoleChange,
  onRemove,
}: {
  users: ActiveUser[];
  currentUserId: string;
  pendingId: string | null;
  onRoleChange: (id: string, role: Role) => void | Promise<void>;
  onRemove: (id: string, email: string) => void | Promise<void>;
}) {
  if (users.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        No users found.
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {users.map((u) => {
        const isSelf = u.id === currentUserId;
        const busy = pendingId === u.id;
        return (
          <li key={u.id} className="flex items-center gap-4 px-4 py-3">
            {u.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={u.avatar_url}
                alt={u.name ?? u.email}
                width={36}
                height={36}
                className="h-9 w-9 rounded-full ring-1 ring-slate-200"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                {(u.name ?? u.email).slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {u.name ?? u.email.split("@")[0]}
                </span>
                {isSelf && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                    You
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {u.email}
                {u.last_sign_in_at && (
                  <>
                    {" · Last: "}
                    {formatDate(u.last_sign_in_at)}
                  </>
                )}
              </div>
            </div>
            <select
              value={u.role}
              onChange={(e) => onRoleChange(u.id, e.target.value as Role)}
              disabled={isSelf || busy}
              className="rounded-md border px-2 py-1 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onRemove(u.id, u.email)}
              disabled={isSelf || busy}
              title={isSelf ? "Can't remove yourself" : "Remove user"}
              className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {busy ? "…" : "Remove"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PendingList({
  invites,
  pendingId,
  onCancel,
}: {
  invites: PendingInvite[];
  pendingId: string | null;
  onCancel: (email: string) => void | Promise<void>;
}) {
  if (invites.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        No pending invites.
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {invites.map((p) => {
        const busy = pendingId === p.email;
        return (
          <li key={p.email} className="flex items-center gap-4 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              ✉️
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium">{p.email}</div>
              <div className="truncate text-xs text-muted-foreground">
                Invited {p.invited_by_name ? `by ${p.invited_by_name}` : ""}
                {" · "}
                {formatDate(p.invited_at)}
                {" · Role: "}
                {ROLE_LABELS[p.role as Role] ?? p.role}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onCancel(p.email)}
              disabled={busy}
              className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-40"
            >
              {busy ? "…" : "Cancel Invite"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleString("en-US", {
    year: sameYear ? undefined : "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
