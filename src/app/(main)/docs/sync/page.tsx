import Link from "next/link";

export default function SyncDocsPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-base text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      <article className="space-y-8 text-muted-foreground">
        {/* Title */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            資料同步與通知機制
          </h1>
          <p className="mt-2 text-base italic border-l-2 border-engenius-blue/30 pl-3">
            本文件說明 Datasheet System 如何從 Google Sheets 同步產品資料到
            Supabase，以及同步後的變更通知流程。
          </p>
        </div>

        <hr className="border-border" />

        {/* Architecture Diagram */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">整體架構</h2>

          <div className="flex flex-col items-center gap-0 py-4">
            {/* Google Sheets */}
            <div className="rounded-lg border-2 border-engenius-blue bg-engenius-blue/5 px-6 py-3 text-center">
              <p className="font-semibold text-foreground">Google Sheets</p>
              <p className="text-sm">各產品線</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="text-muted-foreground">&#9660;</div>
            <div className="h-2 w-px bg-border" />

            {/* POST /api/sync */}
            <div className="rounded-lg border border-border bg-muted px-6 py-3 text-center">
              <p className="font-mono text-base font-semibold text-foreground">
                POST /api/sync
              </p>
              <p className="mt-1 text-sm">
                Vercel Cron 每天 09:00 自動觸發
              </p>
              <p className="text-sm">或 Dashboard 手動按鈕觸發</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="text-muted-foreground">&#9660;</div>
            <div className="h-2 w-px bg-border" />

            {/* Smart Sync — branch */}
            <div className="flex items-start gap-6">
              {/* Main path */}
              <div className="flex flex-col items-center">
                <div className="rounded-lg border-2 border-amber-500/60 bg-amber-500/5 px-6 py-3 text-center">
                  <p className="font-semibold text-foreground">Smart Sync</p>
                  <p className="text-sm">比對 Drive modifiedTime</p>
                </div>
              </div>

              {/* Skip arrow */}
              <div className="flex flex-col items-center pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-red-500">
                    未修改 → skip
                  </span>
                  <span className="text-red-500">&#9654;</span>
                </div>
              </div>

              {/* Skip box */}
              <div className="flex flex-col items-center pt-1">
                <div className="rounded-lg border border-dashed border-red-400/50 bg-red-500/5 px-5 py-3 text-center">
                  <p className="text-base text-red-600 dark:text-red-400">
                    結束，不拉資料
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                有變動
              </span>
              <span className="text-green-600 dark:text-green-400">
                &#9660;
              </span>
            </div>
            <div className="h-2 w-px bg-border" />

            {/* Fetch Sheet */}
            <div className="rounded-lg border border-border bg-muted px-6 py-3 text-center">
              <p className="font-semibold text-foreground">拉取 Sheet 全部資料</p>
              <p className="text-sm">
                3 API calls / product line
              </p>
              <p className="text-sm">(metadata + detail + overview)</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="text-muted-foreground">&#9660;</div>
            <div className="h-2 w-px bg-border" />

            {/* Deep Diff */}
            <div className="rounded-lg border border-border bg-muted px-6 py-3 text-center">
              <p className="font-semibold text-foreground">Deep Diff 變更偵測</p>
              <p className="text-sm">
                產品資料：subtitle, full_name, headline,
              </p>
              <p className="text-sm">overview, features, spec sections</p>
              <p className="text-sm">Comparison 表：model 增刪、value 變更</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="text-muted-foreground">&#9660;</div>
            <div className="h-2 w-px bg-border" />

            {/* Decision: has changes? */}
            <div className="rotate-45 rounded-sm border-2 border-amber-500/60 bg-amber-500/5 p-2">
              <p className="-rotate-45 text-sm font-semibold text-foreground whitespace-nowrap">
                有變更？
              </p>
            </div>
            <div className="h-3" />

            {/* Two branches */}
            <div className="flex items-start gap-10">
              {/* Yes path */}
              <div className="flex flex-col items-center">
                <span className="mb-1 rounded-full bg-green-100 px-2.5 py-0.5 text-sm font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Yes
                </span>
                <div className="h-3 w-px bg-border" />
                <div className="text-green-600 dark:text-green-400">
                  &#9660;
                </div>
                <div className="h-2 w-px bg-border" />

                {/* Write DB */}
                <div className="rounded-lg border-2 border-engenius-blue/60 bg-engenius-blue/5 px-5 py-3 text-center">
                  <p className="font-semibold text-foreground text-base">
                    寫入資料庫
                  </p>
                  <div className="mt-1.5 space-y-0.5 text-sm">
                    <p>Upsert product</p>
                    <p>Replace specs</p>
                    <p>Sync images</p>
                    <p>Write change_log</p>
                  </div>
                </div>
                <div className="h-5 w-px bg-border" />
                <div className="text-muted-foreground">&#9660;</div>
                <div className="h-2 w-px bg-border" />

                {/* Telegram */}
                <div className="rounded-lg border-2 border-blue-400/60 bg-blue-400/5 px-5 py-3 text-center">
                  <p className="font-semibold text-foreground text-base">
                    Telegram 通知
                  </p>
                  <p className="text-sm">發送變更摘要</p>
                </div>
              </div>

              {/* No path */}
              <div className="flex flex-col items-center">
                <span className="mb-1 rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  No
                </span>
                <div className="h-3 w-px bg-border" />
                <div className="text-red-500">&#9660;</div>
                <div className="h-2 w-px bg-border" />

                <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted px-5 py-3 text-center">
                  <p className="text-base text-muted-foreground">跳過</p>
                  <p className="text-sm">不寫 log、不通知</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <hr className="border-border" />

        {/* Trigger Methods */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-foreground">同步觸發方式</h2>

          {/* 1. Auto Sync */}
          <div className="space-y-3">
            <h3 className="text-xl font-medium text-foreground">
              1. 自動同步（Vercel Cron）
            </h3>
            <ul className="list-disc pl-6 space-y-1.5 text-base">
              <li>
                <strong className="text-foreground">時間</strong>：每天 01:00
                UTC（台灣時間 09:00）
              </li>
              <li>
                <strong className="text-foreground">設定檔</strong>：
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                  vercel.json
                </code>
              </li>
              <li>
                <strong className="text-foreground">行為</strong>
                ：同步所有產品線，啟用 Smart Sync（未修改的 Sheet 自動跳過）
              </li>
              <li>
                <strong className="text-foreground">授權</strong>：Vercel Cron
                自動帶{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                  CRON_SECRET
                </code>{" "}
                header
              </li>
            </ul>
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm leading-relaxed text-foreground">
{`{ "crons": [{ "path": "/api/sync", "schedule": "0 1 * * *" }] }`}
            </pre>
          </div>

          {/* 2. Manual Sync */}
          <div className="space-y-3">
            <h3 className="text-xl font-medium text-foreground">
              2. 手動同步（Dashboard 按鈕）
            </h3>
            <ul className="list-disc pl-6 space-y-1.5 text-base">
              <li>
                <strong className="text-foreground">位置</strong>：Dashboard
                頁面右上角「Sync from Sheets」按鈕
              </li>
              <li>
                <strong className="text-foreground">行為</strong>
                ：只同步<strong className="text-foreground">當前選中的產品線 tab</strong>
              </li>
              <li>
                <strong className="text-foreground">API 呼叫</strong>：
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                  POST /api/sync?force=true&line=Cloud%20AP
                </code>
              </li>
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                  force=true
                </code>
                ：跳過 Smart Sync，強制拉取
              </li>
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                  line=Cloud AP
                </code>
                ：只同步指定產品線
              </li>
              <li>
                <strong className="text-foreground">結果顯示</strong>
                ：同步完成後 alert 顯示同步數量
              </li>
            </ul>
          </div>

          {/* 3. Single Product */}
          <div className="space-y-3">
            <h3 className="text-xl font-medium text-foreground">
              3. 單一產品同步
            </h3>
            <ul className="list-disc pl-6 space-y-1.5 text-base">
              <li>
                <strong className="text-foreground">API 呼叫</strong>：
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                  POST /api/sync?model=ECW115
                </code>
              </li>
              <li>
                <strong className="text-foreground">用途</strong>
                ：開發除錯用，只同步單一 model
              </li>
            </ul>
          </div>
        </section>

        <hr className="border-border" />

        {/* Smart Sync */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">
            Smart Sync 運作方式
          </h2>
          <p className="text-base">
            為了避免每天全量拉取 Google Sheets（API quota 有限），系統在同步前會先檢查
            Sheet 是否有被修改：
          </p>
          <ol className="list-decimal pl-6 space-y-1.5 text-base">
            <li>
              呼叫 Google Drive API{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                files.get
              </code>{" "}
              取得{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                modifiedTime
              </code>
            </li>
            <li>
              比對 Supabase{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                product_lines.last_synced_at
              </code>
            </li>
            <li>
              如果{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                modifiedTime &lt;= last_synced_at
              </code>
              ，跳過該產品線
            </li>
            <li>同步完成後，更新{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                last_synced_at
              </code>{" "}
              為當前時間
            </li>
          </ol>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-base">
            <p className="font-medium text-foreground">⚠️ 注意</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                Google Sheets 在 Shared Drive（Team Drive）中，Drive API 需要加{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                  supportsAllDrives: true
                </code>{" "}
                參數才能存取
              </li>
              <li>
                手動按鈕帶{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                  force=true
                </code>{" "}
                會跳過 Smart Sync 直接拉取
              </li>
            </ul>
          </div>
        </section>

        <hr className="border-border" />

        {/* Deep Diff */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">
            變更偵測（Deep Diff）
          </h2>
          <p className="text-base">
            同步不是盲目覆蓋，而是先比對再決定是否寫入：
          </p>

          <h3 className="text-xl font-medium text-foreground">比對的欄位</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-border text-base">
              <thead className="bg-muted">
                <tr>
                  <th className="border border-border px-3 py-2 text-left font-semibold text-foreground">
                    類型
                  </th>
                  <th className="border border-border px-3 py-2 text-left font-semibold text-foreground">
                    欄位
                  </th>
                  <th className="border border-border px-3 py-2 text-left font-semibold text-foreground">
                    比對方式
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-border px-3 py-2">
                    產品基本資料
                  </td>
                  <td className="border border-border px-3 py-2">
                    subtitle, full_name, headline, overview
                  </td>
                  <td className="border border-border px-3 py-2">字串比對</td>
                </tr>
                <tr>
                  <td className="border border-border px-3 py-2">功能列表</td>
                  <td className="border border-border px-3 py-2">features</td>
                  <td className="border border-border px-3 py-2">
                    JSON array 比對，找出新增/移除的項目
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-3 py-2">規格表</td>
                  <td className="border border-border px-3 py-2">
                    spec_sections → spec_items
                  </td>
                  <td className="border border-border px-3 py-2">
                    逐 section、逐 item 比對 label + value
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-3 py-2">Comparison 表</td>
                  <td className="border border-border px-3 py-2">
                    comparisons (model + category + label → value)
                  </td>
                  <td className="border border-border px-3 py-2">
                    偵測 model 新增/移除、value 變更（首次匯入不觸發）
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-xl font-medium text-foreground">變更紀錄格式</h3>
          <p className="text-base">
            每次偵測到變更，會同時寫入兩種格式：
          </p>

          <div className="space-y-3">
            <p className="text-base">
              <strong className="text-foreground">
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                  changes_summary
                </code>{" "}
                (text)
              </strong>
              ：壓縮成一行統計摘要，給 Telegram 通知用
            </p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm leading-relaxed text-foreground">
{`overview modified, 2 features added, 1 feature removed, 3 specs modified`}
            </pre>

            <p className="text-base">
              <strong className="text-foreground">
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                  changes_detail
                </code>{" "}
                (JSONB)
              </strong>
              ：結構化資料，給前端 Change Log 表格用（完整欄位 diff）
            </p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm leading-relaxed text-foreground">
{`[
  { "field": "Feature", "from": null, "to": "AI NPU detection", "type": "added" },
  { "field": "Wireless > Frequency Band", "from": "2.4GHz", "to": "2.4GHz/5GHz/6GHz", "type": "modified" }
]`}
            </pre>
          </div>

          <h3 className="text-xl font-medium text-foreground">沒有變更時</h3>
          <p className="text-base">
            如果比對結果完全一致（
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
              details.length === 0
            </code>
            ），該產品：
          </p>
          <ul className="list-disc pl-6 space-y-1 text-base">
            <li>
              不會寫入{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                change_logs
              </code>
            </li>
            <li>不會觸發通知</li>
            <li>仍算作 &quot;synced&quot;（出現在同步結果中）</li>
          </ul>
        </section>

        <hr className="border-border" />

        {/* Telegram Notifications */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">
            Telegram 通知
          </h2>

          <h3 className="text-xl font-medium text-foreground">觸發條件</h3>
          <p className="text-base">
            同步完成後，如果有任何<strong className="text-foreground">產品資料</strong>或{" "}
            <strong className="text-foreground">Comparison 表</strong>發生實際變更（
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
              allChanges.length &gt; 0
            </code>
            ），系統會發送一則 Telegram 訊息。
          </p>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-base">
            <p className="font-medium text-foreground">⚠️ 不會觸發通知的情況</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>只改了 Revision Log（全量覆蓋，不做 diff）</li>
              <li>產品資料和 Comparison 都沒有實質變更（即使 Sheet 有被編輯過）</li>
            </ul>
          </div>

          <h3 className="text-xl font-medium text-foreground">訊息格式</h3>
          <p className="text-base">
            每個產品只顯示一行統計摘要，不列出完整 diff 內容：
          </p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm leading-relaxed text-foreground">
{`📋 Datasheet Sync Report — Apr 6, 2026

【Cloud Managed Switches】5 products
  • ECS1008P — 9 features added
  • ECS1112FP — 9 features added, 2 specs modified
  • ECS1528T — 7 features added
  📊 Comparison — 1 model added, 3 values changed

【AI Cloud Cameras】1 product
  • ECC100 — overview modified, 3 specs modified

Total: 6 product(s) updated + 1 comparison
🔗 Details → https://ds-generator-eg.vercel.app/changelog`}
          </pre>

          <h3 className="text-xl font-medium text-foreground">技術細節</h3>
          <ul className="list-disc pl-6 space-y-1.5 text-base">
            <li>
              <strong className="text-foreground">Bot Token</strong>：環境變數{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                TELEGRAM_BOT_TOKEN
              </code>
            </li>
            <li>
              <strong className="text-foreground">Chat ID</strong>：環境變數{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                TELEGRAM_CHAT_ID
              </code>
              （可以是 group chat）
            </li>
            <li>
              <strong className="text-foreground">API</strong>：
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                https://api.telegram.org/bot&lt;token&gt;/sendMessage
              </code>
            </li>
            <li>
              <strong className="text-foreground">字元限制</strong>：Telegram
              單則訊息上限 4096 字元，系統在 4000 字元處截斷並加{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                … (truncated)
              </code>
            </li>
            <li>
              <strong className="text-foreground">不使用 HTML parse_mode</strong>
              ：避免特殊字元（
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                &lt;
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                &gt;
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                &amp;
              </code>
              ）造成解析錯誤
            </li>
            <li>
              <strong className="text-foreground">失敗不中斷</strong>
              ：通知失敗不會影響同步結果回傳
            </li>
          </ul>

          <h3 className="text-xl font-medium text-foreground">通知紀錄</h3>
          <p className="text-base">
            成功送出通知後，會將對應的{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
              change_logs.notified
            </code>{" "}
            設為{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
              true
            </code>
            ，避免下次重複通知。
          </p>
        </section>

        <hr className="border-border" />

        {/* Google Sheets Data Mapping */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">
            Google Sheets 資料對應
          </h2>
          <p className="text-base">
            每個產品線有一個 Google Sheet，包含以下頁籤：
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-border text-base">
              <thead className="bg-muted">
                <tr>
                  <th className="border border-border px-3 py-2 text-left font-semibold text-foreground">
                    頁籤名稱
                  </th>
                  <th className="border border-border px-3 py-2 text-left font-semibold text-foreground">
                    解析函式
                  </th>
                  <th className="border border-border px-3 py-2 text-left font-semibold text-foreground">
                    寫入的 Supabase 表
                  </th>
                  <th className="border border-border px-3 py-2 text-left font-semibold text-foreground">
                    前端用途
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-border px-3 py-2">
                    (1) Web Overview
                  </td>
                  <td className="border border-border px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      parseOverviewData
                    </code>
                  </td>
                  <td className="border border-border px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      products
                    </code>
                  </td>
                  <td className="border border-border px-3 py-2">
                    Datasheet cover page
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-3 py-2">
                    (2) Detail Specs
                  </td>
                  <td className="border border-border px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      parseSpecSections
                    </code>
                  </td>
                  <td className="border border-border px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      spec_sections → spec_items
                    </code>
                  </td>
                  <td className="border border-border px-3 py-2">
                    Datasheet specs + Compare
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-3 py-2">
                    (3) Comparison
                  </td>
                  <td className="border border-border px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      loadComparison
                    </code>{" "}
                    + <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      diffComparison
                    </code>
                  </td>
                  <td className="border border-border px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      comparisons
                    </code>{" "}
                    + <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      change_logs
                    </code>
                  </td>
                  <td className="border border-border px-3 py-2">
                    /compare/[line] + 通知
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-3 py-2">
                    Revision Log
                  </td>
                  <td className="border border-border px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      loadRevisionLogs
                    </code>
                  </td>
                  <td className="border border-border px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      revision_logs
                    </code>
                  </td>
                  <td className="border border-border px-3 py-2">
                    /changelog/[line]
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-xl font-medium text-foreground">
            Web Overview 使用的欄位
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-border text-base">
              <thead className="bg-muted">
                <tr>
                  <th className="border border-border px-3 py-2 text-left font-semibold text-foreground">
                    統一後名稱
                  </th>
                  <th className="border border-border px-3 py-2 text-left font-semibold text-foreground">
                    用途
                  </th>
                  <th className="border border-border px-3 py-2 text-left font-semibold text-foreground">
                    Supabase 欄位
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-border px-3 py-2">Model Name</td>
                  <td className="border border-border px-3 py-2">產品全名</td>
                  <td className="border border-border px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      products.full_name
                    </code>
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-3 py-2">Model #</td>
                  <td className="border border-border px-3 py-2">
                    產品編號（主鍵）
                  </td>
                  <td className="border border-border px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      products.model_name
                    </code>
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-3 py-2">Headline</td>
                  <td className="border border-border px-3 py-2">
                    封面大標題（fallback full_name）
                  </td>
                  <td className="border border-border px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      products.headline
                    </code>
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-3 py-2">
                    Single Overview
                  </td>
                  <td className="border border-border px-3 py-2">產品描述</td>
                  <td className="border border-border px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      products.overview
                    </code>
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-3 py-2">
                    Key Feature Lists
                  </td>
                  <td className="border border-border px-3 py-2">特色列表</td>
                  <td className="border border-border px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                      products.features
                    </code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-base italic border-l-2 border-engenius-blue/30 pl-3">
            其他欄位（Description, Product List Tag, Product
            Highlights）目前未使用。
          </p>
        </section>

        <hr className="border-border" />

        {/* FAQ */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-foreground">常見問題</h2>

          <div className="space-y-3">
            <h3 className="text-xl font-medium text-foreground">
              Q: 我改了 Google Sheets，為什麼系統沒更新？
            </h3>
            <ol className="list-decimal pl-6 space-y-1.5 text-base">
              <li>
                自動同步每天只跑一次（09:00），可以在 Dashboard 手動按 Sync
              </li>
              <li>
                如果手動按了還是沒更新，可能是改動的欄位不在系統讀取範圍內（見上方欄位對應表）
              </li>
            </ol>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-medium text-foreground">
              Q: Telegram 沒收到通知？
            </h3>
            <ol className="list-decimal pl-6 space-y-1.5 text-base">
              <li>
                確認{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                  TELEGRAM_BOT_TOKEN
                </code>{" "}
                和{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                  TELEGRAM_CHAT_ID
                </code>{" "}
                環境變數正確
              </li>
              <li>確認 Bot 已被加入目標群組並有發送權限</li>
              <li>
                如果同步結果顯示所有產品都沒有變更，就不會發送通知
              </li>
            </ol>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-medium text-foreground">
              Q: 可以只同步某個 model 嗎？
            </h3>
            <p className="text-base">
              可以，用 API：
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-engenius-blue">
                POST /api/sync?model=ECW115
              </code>
              。但 Dashboard 按鈕目前只支援 per product line 同步。
            </p>
          </div>
        </section>
      </article>
    </div>
  );
}
