# Project Datasheet — 內容母版

> 這份是**內容範本**，不是系統文件。系統怎麼運作看
> [project-datasheets.md](project-datasheets.md)；這份回答的是
> 「一份標案 datasheet 該有哪些區塊、每塊該寫什麼、哪些每案要改」。
>
> 對照樣本：EOR100 / EOR200 for Convenience retail chain (MY), Rev 0.3。
> Placeholder 一律寫成 `⟨…⟩`，出稿前全域搜尋 `⟨` 應為零筆。

---

## 為什麼專案版跟目錄版不一樣

目錄 datasheet 回答「這台是什麼」。標案 datasheet 要多回答三件事，
而這三件事目前的版型一件都沒有：

1. **這台在你的站點怎麼擺** — 場景、拓樸、每站配置
2. **怎麼下單、要配什麼** — 料號、盒內物、必配件、交期
3. **出事誰負責、什麼時候到貨** — 保固、支援、量產時程、TBD 何時收斂

少了它們，一份「for 客戶 X」的文件實際上只是通用 datasheet 加了一行客戶名。

---

## 區塊總表

| # | 區塊 | 必要性 | 系統現況 | 重用等級 |
|---|---|---|---|---|
| 1 | Cover — 分類／標題／型號／導言／產品照 | 必要 | 已有 | 產品共用（導言每案改） |
| 2 | Prepared For 抬頭 | 必要 | **要新增欄位** | 每案必改 |
| 3 | Deployment Scenario ＋ 每站配置表 | 必要 | **要新增區塊** | 每案必改 |
| 4 | Network Topology | 建議 | `sections.diagram` **已有，預設關** | 每案必改 |
| 5 | Features & Benefits | 必要 | 已有 | 產品共用 |
| 6 | Technical Specifications | 必要 | 已有 | 產品共用 |
| 7 | Software Features & Management | 條件 | `sections.software`，Management 列要補 | 產品共用 |
| 8 | Hardware Overview（標註 + 安裝） | 建議 | 已有（目前只有圖） | 產品共用 |
| 9 | Regulatory & Carrier Coverage | 必要（跨國案） | **要新增區塊** | 換國家才改 |
| 10 | Ordering Information & Accessories | 必要 | `sections.package` 涵蓋一半 | 換國家才改 |
| 11 | Warranty & Support | 必要 | **要新增區塊** | 換國家才改 |
| 12 | Availability & TBD Closure | PRELIMINARY 專用 | **要新增區塊** | 每案必改 |
| 13 | 頁尾版控 + Contact QR | 必要 | 已有（版控欄位要補） | 自動 |

⚠️ 4 和 10 不用寫 code，是**開開關**。`DEFAULT_SECTIONS` 裡
`diagram` 和 `package` 都是 `false`，EOR 這份兩個都沒開。

---

## 1. Cover

保持現狀，兩點要修：

- **標題與圖說要一致**。樣本標題是 "Outdoor 4G / 5G Cellular Routers"，
  但產品照下的標籤是 "4G **Indoor / Outdoor** Router"。二選一。
- **導言兩段的分工**：第一段講「這台是什麼、解決什麼」，
  第二段講「兩個型號怎麼選」。樣本這點做得對，維持。

```
⟨CATEGORY TAG⟩                          例：CELLULAR ROUTER
⟨Product family title⟩
⟨MODEL-A⟩ / ⟨MODEL-B⟩

⟨1–3 sentences: what it is, and the constraint it removes for this customer.⟩

⟨1–2 sentences: how the two models differ and how to choose between them.⟩
```

---

## 2. Prepared For 抬頭

樣本把客戶名藏在頁尾的免責聲明裡，讀者第一眼看不到這份是為他做的。
移到封面，但**只放會出公司的欄位**。

```
PREPARED FOR
⟨Customer / project name⟩ — ⟨scope: n sites, region⟩
Issued ⟨DD Mon YYYY⟩ · Valid through ⟨DD Mon YYYY⟩ · Document Rev ⟨n.n⟩
Status: PRELIMINARY
```

⚠️ **不要放 sales owner、opportunity ref、案子階段、預估數量。**
這些在系統裡是 `branch` / `sales_owner` / `opportunity` / `tender_date`，
設計上就是**永遠不印**（`project-preview.tsx` 不讀這些欄位）。理由見
[project-datasheets.md#內部資訊欄位](project-datasheets.md)：一份指名我方業務、
我們內部案況的文件不該離開公司。抬頭要新增的是**對客戶那一半**（有效期限、Rev），
不是把內部欄位放出來。

**有效期限是這塊的重點**：既然免責聲明寫了 subject to change，
就要給對方一個「什麼時候要重新確認」的日期。

---

## 3. Deployment Scenario ＋ 每站配置表

Features & Benefits 之前要先有「你的場景長這樣，所以我們配這個」。
這是專案版相對通用版最大的差異點，也是唯一無法從產品資料自動生出來的一塊。

寫法：**先講客戶的限制，再講產品怎麼移除它**，不要從功能寫起。

```
Deployment Scenario — ⟨vertical⟩, ⟨country⟩

⟨2–3 sentences on what runs at each site and where the schedule/risk
actually sits. Name the constraint, not the feature.⟩

⟨2–3 sentences on how the product removes that constraint, and what the
second deployment mode is (backup / failover / phase 2).⟩

| Site type | Model | Role | Qty per site |
|---|---|---|---|
| ⟨type A⟩ | ⟨model⟩ | ⟨primary / failover⟩ | ⟨n⟩ |
| ⟨type B⟩ | ⟨model⟩ | ⟨…⟩ | ⟨n⟩ |
```

EOR 案的成品：

> Each store runs a POS terminal, a payment terminal, a back-office PC and
> 4–6 IP cameras behind a single uplink. Across 320 sites, the schedule risk
> is fixed-line provisioning, not the hardware.
>
> EOR100 and EOR200 remove that dependency. The router mounts on the shopfront
> exterior or roofline, takes power and data over one PoE run to the back room,
> and brings the site online the day the SIM is inserted. Where fibre is already
> in place, the same unit serves as the failover path — dual SIM keeps card
> payments running when the primary carrier or the fixed line drops.

⚠️ 配置表的數量欄是**每站**，不是總量。總量屬於報價單，
放進 datasheet 就是第二份會過期的副本。

---

## 4. Network Topology（`sections.diagram`）

一張圖：室外機 →（單條 Cat 5e/6）→ PoE injector 或 PoE switch → 下游設備。

圖說模板：

```
Typical ⟨site type⟩ topology. ⟨One sentence naming the single non-obvious
thing the diagram proves — usually the cabling or power path.⟩
```

EOR 案：

> Typical store topology. A single Cat 5e/6 run carries both power and data
> between the outdoor router and the back room; no mains outlet is required
> at the mounting point.

---

## 5. Features & Benefits

六格，兩欄。三條規則：

1. **每格是「後果」不是「規格」。** 樣本的
   "Built for tropical outdoor / −40 to +70 °C, 5–95 % non-condensing"
   是規格複述，而且跟規格表重複。改成後果導向：

   > **Survives the roofline it's mounted on**
   > −40 to +70 °C and 5–95 % non-condensing humidity — the enclosure isn't
   > what sends a technician back to the store.

2. **至少兩格要對得上 Deployment Scenario 講的那個限制。**
   場景說瓶頸是佈線，就要有一格講免佈線、一格講單線安裝。
3. **不要六格都講硬體。** 留一格給營運面（維運、備援、可視性）。

```
⟨Benefit headline — a consequence, 3–6 words⟩
⟨1–2 sentences. Lead with what changes for the customer, put the number second.⟩
```

---

## 6. Technical Specifications

內容由 `raw_doc ⊕ rules` 算出來，母版管的是**三條結構規則**：

### 6.1 TBD 與 — 是兩件事

樣本最嚴重的內容錯誤：EOR100 的 5G NR / 5G Network Mode / 5G Data Rate /
5G Frequency Bands 四列標 **TBD**。EOR100 是 4G 機種，這四列**永遠不會有值**。
標 TBD 等於告訴客戶「之後會補上 5G」。

決策樹：

```
這一格會不會有值？
├─ 會，只是 ODM 還沒回      → TBD    （? key = tbd）
├─ 不會，這型號本來就沒有   → —      （? key = na）
└─ 有值但這份不印           → 隱藏   （- key）
```

系統對這件事有現成支援：`? key = mode` 逐格指定，
`model_blank` 這個 finding 型別存在的理由就是這條。

### 6.2 不要兩列做同一件事

樣本有「5G / 4G Data Rate」和「LTE Data Rate」兩列，結果 EOR200 的 LTE 數字
出現在上面那列、下面那列卻寫 TBD。合併成單一列：

```
+ Peak data rate (DL / UL) = 5G SA: ⟨…⟩ / 5G NSA: ⟨…⟩ / LTE: ⟨…⟩
- lte_data_rate
```

出稿前檢查：**兩個型號的列名必須完全一致**，差異只能出現在值。

### 6.3 分組標題

五十幾列連著跑不好掃。建議分四組：
`Cellular` / `Interface & Power` / `Environmental` / `Physical`。

---

## 7. Software Features & Management

樣本的表頭只寫 `Model EOR200`，等於沒說 EOR100 有沒有這些功能。

- 兩欄都列，或在表上方加一行 `Applies to both models unless noted.`
- **必補一列 Management**。這是 320 站點連鎖最先問的事，比 UPnP 重要一百倍：

```
+ Management = ⟨Local web UI over the LAN port. Managed per device;
  not onboarded to EnGenius Cloud.⟩ ⟨If a Cloud-managed variant is planned,
  state the target release. If not, say so — silence reads as "yes".⟩
```

---

## 8. Hardware Overview

樣本只有一張 EOR100 的圖 + 一行圖片註記，整頁 3/4 空白。要補三樣：

```
⟨MODEL⟩                              ← 兩個型號都放

1 ⟨Antenna connectors⟩   2 ⟨LED indicators (…)⟩   3 ⟨Grounding point⟩
4 ⟨PoE LAN port with waterproof gland⟩            5 ⟨SIM slots⟩
6 ⟨Reset button⟩         7 ⟨Mounting bracket⟩

Mounting: ⟨wall / pole (Ø ⟨range⟩ mm) / rail⟩.
Allow ⟨n⟩ mm clearance ⟨above⟩ the unit for antenna installation.

Product image is representative; final appearance may differ.
```

⚠️ 最後那行**是強制的**，不是可選（有圖就有註記）——
標案文件放一張不是本人的照片而不說明，是誤導風險。

---

## 9. Regulatory & Carrier Coverage

規格表列了一整片 band，但客戶要的不是 band list，是「我家電信商能不能用」。
把 band list 翻譯成當地電信商，是專案版最有價值的加值。

```
Regulatory and carrier coverage — ⟨country⟩

|  | ⟨MODEL-A⟩ | ⟨MODEL-B⟩ |
|---|---|---|
| ⟨Local approval, e.g. SIRIM / NCC / VCCI⟩ | ⟨status / target date⟩ | ⟨…⟩ |
| LTE bands in use locally | ⟨B1 / B3 / B7 / B8 / B40 — carrier A, B, C⟩ | ⟨…⟩ |
| 5G NR bands in use locally | ⟨— or n40 / n78⟩ | ⟨…⟩ |
| Other certifications | ⟨CE, FCC, RoHS⟩ | ⟨…⟩ |

Band support does not by itself guarantee service. Confirm APN and data plan
terms with the carrier before the pilot.
```

⚠️ 最後那句免責**不要拿掉**。band 對得上但開不了服務是這類案子最常見的爭議。

---

## 10. Ordering Information & Accessories

樣本完全沒有。這台是 **PoE 供電**——injector 在不在盒子裡、要不要另外報，
客戶一定會問，而現在整份文件沒有答案。

```
Ordering information

| Model | Part number | Region | In the box |
|---|---|---|---|
| ⟨MODEL⟩ | ⟨P/N⟩ | ⟨region⟩ | ⟨router, bracket, gland, QSG⟩ |

Ordered separately

| Item | Part number | Note |
|---|---|---|
| ⟨802.3at PoE injector⟩ | ⟨P/N⟩ | ⟨One per unit unless a PoE switch is on site⟩ |
| ⟨Pole mount kit⟩ | ⟨P/N⟩ | ⟨For pole or mast installation⟩ |
| ⟨Outdoor-rated Cat 6 cable⟩ | — | ⟨Sourced locally⟩ |

Lead time ⟨n⟩ weeks from PO · MOQ ⟨qty⟩ · First shipment ⟨date⟩
```

⚠️ 報價階段還沒有包裝時，**整塊關掉**（`sections.package = false`），
不要印一個空的——那看起來像漏做，不像流程中的一步。

---

## 11. Warranty & Support

```
Warranty and support

Hardware warranty ⟨n⟩ years from date of shipment. RMA handled through
⟨local RMA centre⟩; ⟨advance replacement available for project accounts on
request⟩. Support from ⟨EnGenius APAC FAE, business hours GMT+8⟩ at ⟨email⟩.
Firmware maintenance for these SKUs through ⟨date⟩.
```

⚠️ 只放**公司信箱／窗口類別**，不放個人姓名與 email——
SpecHub 不是 CRM，個資放進來只是多一個要守的地方。

---

## 12. Availability & TBD Closure

**只在 PRELIMINARY 版出現，轉正式版時整塊刪掉。**
既然滿版 TBD，就明講什麼時候會不 TBD：

```
Availability

⟨MODEL-B⟩ enters mass production ⟨date⟩. ⟨MODEL-A⟩ specifications are in
final validation; every field marked TBD in this document will be confirmed
by ⟨date⟩ and reissued as Rev ⟨n.n⟩. Neither model is scheduled for
end-of-life within ⟨n⟩ years of first shipment.
```

這塊跟 gap review 是同一件事的兩面：掃描出來的 TBD 是**對內**的待辦，
這塊是**對外**的承諾日期。內部清完了，這塊才寫得出來。

---

## 13. 頁尾

```
⟨MODEL-A⟩ / ⟨MODEL-B⟩ Project Datasheet · Rev ⟨n.n⟩ · ⟨DD Mon YYYY⟩ ·
Prepared for ⟨customer⟩ · Valid through ⟨DD Mon YYYY⟩

PRELIMINARY — Specifications are subject to change without notice and do not
constitute a commitment to supply.
```

聲明的**文字可編、存在與否不可編**（DB `not null` + non-blank check），
且封面也要印一次——封面才是會被截圖轉寄的那頁。

---

## 出稿前 checklist

- [ ] 全域搜尋 `⟨`，零筆
- [ ] 全域搜尋 `TBD`，每一筆都確認過「是還沒回」而不是「本來就沒有」
- [ ] 兩個型號的規格列名完全一致，差異只在值
- [ ] 標題／圖說／產品照標籤的措辭一致（Outdoor vs Indoor/Outdoor）
- [ ] 每張產品圖都有 image note
- [ ] 內部欄位（業務、案號、案況、預估數量）沒有出現在任何一頁
- [ ] 有效期限、Rev、發文日三者一致（封面與頁尾）
- [ ] gap review 無 blocking，status 切到 `ready`

---

## 重用對照

換一個案子時，只有這幾塊要重寫：

| 區塊 | 每案必改 | 換國家才改 | 產品層級共用 |
|---|:---:|:---:|:---:|
| Prepared For 抬頭 | ● | | |
| Cover 導言 | ● | | |
| Deployment Scenario / 配置表 | ● | | |
| Topology | ● | | |
| Availability & TBD Closure | ● | | |
| Regulatory & Carrier | | ● | |
| Ordering / Accessories | | ● | |
| Warranty & Support | | ● | |
| Features & Benefits | | | ● |
| Tech Spec / Software / Hardware | | | ● |

這張表跟 `duplicate` API 的「什麼帶過、什麼不帶」是同一條線：
複製給下一個客戶時帶過去的是右邊兩欄，左邊那欄一律清空重寫。
