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
   2026-09-11 Data Center 規格表改版（#79 / #82:分組灰帶、型號改成一般列）同理,
   5 份 DC PDF 要 Regenerate 才是新版。
   2026-09-16 的**規格備註**（#99/#100）也一樣:ESG320 / ESG510 / ESG610 / ESG620 的備註已經進系統
   （2026-09-18 起 ja / zh-TW 也有,5 列,已在 prod 的 print preview 驗過兩條備註都印得出來）,
   但要 Regenerate 才會印在 PDF 上,官網上的檔案還要重新上傳。**這四份由 Terrel 自己重產**（2026-09-18 說的）。
**系統**：
8. **Auto invite email** — admin 邀請後自動通知（Resend / Supabase email）

**官網 Datasheet 查詢**（1a + 1b 都已上線,設計見 [`website-datasheet-check.md`](website-datasheet-check.md)）：
8b. **上傳者名字** — 目前只有 WordPress user id,要多查 `/wp/v2/users`
8c. **未標記的清理** — 1b 上線時有 77 份最新版沒有可上架／不上架標記,用「只勾綠字」的按鈕標掉一批,
   剩下的要行銷判斷。**沒歸零之前,行銷群組每個工作日都會收到那一行提醒**。
   數量看「上架追蹤」頁籤（那裡的定義才是準的;2026-09-18 直接查 DB 粗算是 92 份最新版、40 份已標記,
   比上線時多是因為之後又產了新版,而新版本身是未標記的）

**多語言（2026-08-07 現況）**：
9. **日文規格標籤只翻了 Cloud AP** — `spec_label_translations` 是**產品線層級**;
   Cloud Camera / L3 Switch / VPN Firewall / AI-NVS 有日文產品但標籤是英文,
   Broadband EOC 連繁中都沒有（那條線從沒開過標籤編輯器）。
   補法:`/translations/[line]` → Japanese → AI Translate Empty Fields,每條線約 $0.006。
   **產 PDF 寫死 `mode=full`,所以沒翻就是印英文。**
9b. **VPN Firewall 的語系覆蓋不完整（2026-09-18 補備註時發現）** — ESG510 的 zh-TW、
   ESG610 的 ja 與 zh-TW **根本沒有翻譯列**,所以那三個組合印的是英文。
   刻意沒有直接建列:建一列等於替那台開啟該語系,而 overview / features 還是英文,
   畫面上會變成一個沒做完的語系 —— 要不要開由 PM 決定。
   另外 **ESG320 的 ja 還是 `draft`**,`generate-pdf` 會擋在 `confirmed` 上,要先 Save 定案。
   ⚠️ 補備註這種資料時要顧**記號對稱**:四台的備註是兩條（`*` 效能估計、`**` syslog 轉送）,
   而 `product_lines.spec_footnote_translations` 只翻了第一條 —— 直接沿用會讓規格表裡的 `**` 指向不存在的備註。

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
