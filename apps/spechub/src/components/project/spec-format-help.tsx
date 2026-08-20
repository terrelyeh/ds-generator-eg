"use client";

import { useState } from "react";

/**
 * The格式 cheat-sheet, inline and collapsed.
 *
 * Both textareas take a small line-based syntax, and the previous version
 * described each in one dense sentence of hint text — which is enough to
 * recognise the format if you already know it and useless if you don't. The
 * question it kept producing was "what does this box even do", so the answer
 * is worked examples, next to the box, folded away once you've learnt them.
 */
export function SpecFormatHelp({ kind }: { kind: "specs" | "rules" }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-muted-foreground hover:text-foreground"
      >
        <span className="text-[10px]">{open ? "▾" : "▸"}</span>
        {kind === "specs" ? "格式怎麼寫？" : "規則怎麼寫？"}
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 py-2.5">
          {kind === "specs" ? <SpecsHelp /> : <RulesHelp />}
        </div>
      )}
    </div>
  );
}

function SpecsHelp() {
  return (
    <>
      <p className="text-muted-foreground">
        一行一列規格：<strong>規格名</strong> ⇥ Tab ⇥ <strong>值</strong>。
        直接從 PDF 或 Excel 複製整張表貼上，通常就已經是對的格式了。
      </p>
      <Example
        code={"Dimension\t145 X 130 X 45 mm\nInterface\t1 × GbE LAN\n\t1 × Reset button\n\t2 × SIM slot"}
      />
      <ul className="space-y-1 text-muted-foreground">
        <li>
          · <strong>值有好幾行</strong>：後面幾行開頭放一個 Tab（規格名留空），會接到上一列的值裡
        </li>
        <li>
          · <strong>換一張表</strong>：單獨一行寫 <code className="rounded bg-muted px-1">## software</code>{" "}
          或 <code className="rounded bg-muted px-1">## package</code>，之後的列就會排進
          Software Features / Package Contents 那一頁
        </li>
        <li>· 沒有 Tab 的話，連續兩個以上的空白也算分隔</li>
      </ul>
      <div className="space-y-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-900">
        <p>
          <strong>照原樣貼，不要在這一格順手改。</strong>
          全形符號、怪單位、「含彩盒」的重量，全部留著。
        </p>
        <p>
          聽起來很矛盾——「不要在這裡改，去下面寫規則改」不還是在改嗎？
          差別不在改哪裡，<strong>在於改完之後原文還在不在</strong>：
        </p>
        <p className="font-mono text-[11px]">
          原文 1.35KG（Includes color box accessories）
          <br />
          規則 weight = 1.35 kg
          <br />
          印出來 1.35 kg
        </p>
        <p>
          三件事同時留著，所以「這是原廠寫的還是我們改的」永遠答得出來。
          直接在這一格改成 <code className="rounded bg-white px-1">1.35 kg</code>，
          原廠那句就沒了——之後客戶拿原廠文件來對、或你重讀一次來源，都會出事。
        </p>
      </div>
    </>
  );
}

function RulesHelp() {
  return (
    <>
      <p className="text-muted-foreground">
        一行一條。左邊那個名字是<strong>規格名正規化後的樣子</strong>
        （小寫、空白和符號換成底線）：<code className="rounded bg-muted px-1">Power Consumption</code> →{" "}
        <code className="rounded bg-muted px-1">power_consumption</code>。
      </p>
      <Rule
        code="- cpu"
        what="藏掉這一列"
        why="業務說「不要放 chipset」就是這個"
      />
      <Rule
        code="ingress_protection = IP67"
        what="改成這個值"
        why="來源沒有這一列的話，會直接長出來一列"
      />
      <Rule
        code="~ power_consumption = Power Draw"
        what="只改顯示的名稱"
        why="值不動"
      />
      <Rule
        code="+ Power over Ethernet = 802.3at"
        what="新增一列"
        why="來源沒有、但標案要的規格"
      />
      <Rule
        code="? antenna_gain = na"
        what="這格空的時候印什麼"
        why="tbd = 之後會補；na = 本來就沒有，印 —"
      />
      <p className="text-muted-foreground">
        改一列的<strong>值</strong>用 <code className="rounded bg-muted px-1">=</code>，
        它會整格取代掉原本的內容——所以要「補充」而不是「取代」的時候，用{" "}
        <code className="rounded bg-muted px-1">+</code> 開一列新的，不要塞進相關的那一列。
      </p>
    </>
  );
}

function Rule({ code, what, why }: { code: string; what: string; why: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-[#231f20]">
        {code}
      </code>
      <span className="text-[#231f20]">{what}</span>
      <span className="text-muted-foreground">— {why}</span>
    </div>
  );
}

function Example({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded border bg-background px-2.5 py-2 font-mono text-[11px] leading-relaxed text-[#231f20]">
      {code}
    </pre>
  );
}
