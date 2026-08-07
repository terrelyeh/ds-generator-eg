import { requirePagePermission } from "@eg/auth/page-guards";
import { createAdminClient } from "@eg/db/admin";
import { GlossaryEditor } from "@/components/settings/glossary-editor";

export default async function GlossaryPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  await requirePagePermission("settings.edit_glossary");
  const { locale } = await searchParams;

  // Scopes were a hardcoded list of five product lines, written when those
  // were all that existed. Ten lines have been added since — Cloud PDU,
  // Broadband EOC, the Data Center pair, Station AP and the rest — none of
  // which could be given their own terms. Read them from the DB so a new
  // line shows up here the moment it's onboarded.
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("product_lines")
    .select("name, solutions(name)")
    .order("name");

  const lines = ((data ?? []) as unknown as {
    name: string;
    solutions: { name: string } | null;
  }[]).map((l) => ({ name: l.name, solution: l.solutions?.name ?? "" }));

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <GlossaryEditor initialLocale={locale} productLines={lines} />
    </div>
  );
}
