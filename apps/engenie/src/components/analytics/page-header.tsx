import Link from "next/link";

/** Breadcrumb, title and the controls that scope the whole page. */
export function PageHeader({
  crumbs,
  title,
  description,
  aside,
  children,
}: {
  crumbs: { label: string; href?: string }[];
  title: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  /** Extra line under the title (badges, status). */
  children?: React.ReactNode;
}) {
  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-base">
        {crumbs.map((c, i) => (
          <span key={c.label} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground/40">/</span>}
            {c.href ? (
              <Link href={c.href} className="text-muted-foreground transition-colors hover:text-foreground">{c.label}</Link>
            ) : (
              <span className="font-medium text-foreground">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 text-base text-muted-foreground">{description}</p>}
          {children}
        </div>
        {aside && <div className="flex shrink-0 items-center gap-3">{aside}</div>}
      </div>
    </div>
  );
}
