"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SUPPORTED_LOCALES } from "@/lib/datasheet/locales";

interface QueueRow {
  product_id: string;
  locale: string;
  review_status: string;
  translated_at: string | null;
  latest_comment?: string | null;
}

function localeLabel(v: string) {
  const l = SUPPORTED_LOCALES.find((x) => x.value === v);
  return l ? `${l.flag} ${l.label}` : v;
}

function Rows({
  rows,
  emptyText,
  showComment,
}: {
  rows: QueueRow[];
  emptyText: string;
  showComment?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-slate-400">{emptyText}</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={`${r.product_id}|${r.locale}`} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/product/${encodeURIComponent(r.product_id)}?tab=translations`}
              className="font-medium text-engenius-blue hover:underline"
            >
              {r.product_id}
            </Link>
            <span className="text-xs text-slate-500">{localeLabel(r.locale)}</span>
            {r.translated_at && (
              <span className="ml-auto text-xs tabular-nums text-slate-400">
                {new Date(r.translated_at).toLocaleDateString("zh-TW")}
              </span>
            )}
          </div>
          {showComment && r.latest_comment && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-600">↳ {r.latest_comment}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ReviewQueue() {
  const [data, setData] = useState<{
    toReview: QueueRow[];
    toFix: QueueRow[];
    reviewLocales: string[] | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/translations/queue")
      .then((r) => r.json())
      .then((d) => d.ok && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-12 text-center text-sm text-slate-400">讀取中…</p>;
  if (!data) return null;

  const showReview = data.toReview.length > 0 || data.reviewLocales !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#231f20]">翻譯審核佇列</h1>
        <p className="mt-1 text-sm text-slate-500">
          待審與被退回的翻譯。只列出跟你有關的：審核者看自己負責語言的待審件，編輯看被退回要修的。
        </p>
      </div>

      {showReview && (
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-[#231f20]">
              待我審核
              {data.reviewLocales && (
                <span className="ml-2 text-xs font-normal text-slate-400">
                  （{data.reviewLocales.map(localeLabel).join("、")}）
                </span>
              )}
            </h2>
            <span className="text-xs tabular-nums text-slate-400">{data.toReview.length}</span>
          </div>
          <Rows rows={data.toReview} emptyText="目前沒有待審核的翻譯。" />
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-[#231f20]">被退回，待修改</h2>
          <span className="text-xs tabular-nums text-slate-400">{data.toFix.length}</span>
        </div>
        <Rows rows={data.toFix} emptyText="沒有被退回的翻譯。" showComment />
      </section>
    </div>
  );
}
