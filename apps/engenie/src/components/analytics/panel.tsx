import { cn } from "@/lib/utils";

/** A titled region. The frame is for the data inside; the title sits outside it. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  frameless = false,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** For content that brings its own frame (the workspace table). */
  frameless?: boolean;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col", className)}>
      <header className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      {frameless ? children : <div className="min-w-0 overflow-hidden rounded-xl border bg-background">{children}</div>}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-5 py-9 text-center">
      <p className="text-[13.5px] font-medium text-foreground">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-[30em] text-[12.5px] leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  );
}
