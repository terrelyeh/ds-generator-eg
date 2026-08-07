import { requirePagePermission } from "@eg/auth/page-guards";
import { ReviewQueue } from "@/components/translations/review-queue";

export default async function TranslationQueuePage() {
  // product.view, not review.approve — MKT has no review permission but is
  // the side that has to act on everything sent back.
  await requirePagePermission("product.view");
  return (
    <div className="mx-auto max-w-[900px] px-6 py-8">
      <ReviewQueue />
    </div>
  );
}
