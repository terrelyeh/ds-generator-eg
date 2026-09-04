# Next Steps — 按領域

CLAUDE.md 只留「現在就該做、而且會影響下一個 session 怎麼寫程式」的那幾條。
這裡是其餘的待辦，按領域分。**做完一條就從這裡刪掉**——這份是工作清單不是歷史紀錄。

**產品線 / 版型**：
1. **待補素材 / 待 PM 處理的項目**（缺圖、EOC 日文待 Confirm、EOC sheet 的
   「16 devices」錯誤、Cloud AP 素材缺口）→ 見
   [`docs/pending-assets.md`](docs/pending-assets.md)。
   ⚠️ 圖檔名是**單底線**（`S41__product.png` 雙底線曾靜默同步不到）。

**Datasheet 系統**：
5. **多國語言擴展到其他產品線** — 需為 AP/Switch/NVS/VPN FW 建立 product-line prompt
   （`translate/prompts/product-lines/`,目前只有 Cloud Camera 有）
6. **翻譯 feedback 偵測** — Save 時偵測使用者修改，建議加入詞庫
7. **第 3 張 Hardware 圖** — `hardware_image_2` 已上線（DC 線用）,若要 front/rear/bottom
   三張需再加一欄 + upload API 型別
7b. **渲染端改動需重產 PDF 才生效** — 2026-08-12~13 的字型/字級/分區間距/logo 全是渲染端,
   已產出的 ~90 份 PDF 仍是舊版,挑產品線 Regenerate 才會套用。**CJK 字級收斂尚未做**
   （`scale.ts` 只涵蓋 en/es;ja/zh-TW 在 `app_settings`、刻意較大,要不要一起收斂是獨立決定）。
**系統**：
8. **Auto invite email** — admin 邀請後自動通知（Resend / Supabase email）

**多語言（2026-08-07 現況）**：
9. **日文規格標籤只翻了 Cloud AP** — `spec_label_translations` 是**產品線層級**;
   Cloud Camera / L3 Switch / VPN Firewall / AI-NVS 有日文產品但標籤是英文,
   Broadband EOC 連繁中都沒有（那條線從沒開過標籤編輯器）。
   補法:`/translations/[line]` → Japanese → AI Translate Empty Fields,每條線約 $0.006。
   **產 PDF 寫死 `mode=full`,所以沒翻就是印英文。**
10. **`product_translations.translation_mode` 欄位沒有人讀** — 編輯器的 Light/Full
   下拉已於 2026-08-07 移除（它什麼都沒改變）,存檔固定寫 `full`。欄位本身還在,
   要清掉是另一個 migration。
11. 🔴 **審核流程目前休眠（2026-08-12 Terrel 主動關掉,說是「先」移除）** —— 程式全在,
   但**沒有任何語系被指定**,所以每個語系都是 MKT 一鍵 Confirm。
   **看到 review 相關程式碼不要以為它在跑**;要重開就回 `/settings/users` 點語言旗標。
   ⚠️ **`review_locales` 三種值語意不同**:`NULL` = 可審全部但不指定任何語系（admin 正確預設）;
   `['es']` = 指定 es 需審核且此人只能審 es;`[]` = 不指定任何語系**且此人什麼都不能審**。
   關流程時只清掉「被指定的語系」,**不要把 admin 也設成 `[]`** —— 曾因此讓 ECS1528FP/es
   卡在 `pending_review` 而全公司沒人能核准。
   ⚠️ 決定不做第五個角色（editor+review.approve）:分公司維持只審不改。

**Battlecard**（MVP 已上線,功能詳見 README）：
12. **競品資料補完** — Meraki(CW9164/MR46)行銷頁規格稀疏,待 ↻sync/🔍web 或 PM 補;
   5 維度(MLO/Recommended Users/BSS Coloring/Warranty/MSRP)刻意留白給 PM
13. **擴到其他產品線** — 目前只有 Cloud AP 有 dimension 模板 + matchup;Switch/NVS/VPN FW 待建
   （dashboard toolbar 的 Battlecard 連結目前也只在 Cloud AP 顯示）
（註:使用者 2026-06-16 決定 ↻sync 與 🔍web 維持兩顆手動按鈕,不自動串接）
