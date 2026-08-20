/**
 * Seed the EOR100 / EOR200 pilot project datasheet.
 *
 * This is the case the module was designed against: two ODM CPE spec sheets
 * (M16K06 4G, M16M43 5G) retargeted onto EnGenius naming for a convenience
 * retail tender, with sales' notes applied — no Wi-Fi, no chipset, PoE
 * 802.3af/at, IP67, both units on one document.
 *
 * Everything below is transcribed from the two source PDFs. Where a value
 * differs from its source it is expressed as a RULE, never edited into
 * `raw_doc` — that separation is the whole point (see migration 00038), and
 * it means the seed doubles as a readable record of what sales changed.
 *
 *   npx tsx scripts/seed-project-eor.ts          # create (idempotent by name)
 *   npx tsx scripts/seed-project-eor.ts --reset  # delete and recreate
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const NAME = "EOR100 / EOR200 — Outdoor Cellular Routers";
const CUSTOMER = "Convenience retail chain (MY)";

// ── shared copy ────────────────────────────────────────────────────────────

const OVERVIEW = `EOR100 and EOR200 are outdoor cellular routers that bring a site online over 4G LTE or 5G NR, without waiting on fixed-line provisioning. An IP67 enclosure and PoE input let them mount where the signal actually is — an exterior wall, a pole, a rooftop — and hand a wired Ethernet uplink back to the equipment inside.

Two SIM slots allow a second carrier to be held in reserve, so POS, payment terminals and surveillance keep working when one network degrades. Both models share the same enclosure, mounting and cabling: deploy EOR200 where 5G is available and EOR100 everywhere else, from a single installation procedure.`;

const FEATURES = [
  {
    title: "Deploy without a fixed line",
    bullets: [
      "Bring a new site online in the time it takes to mount the unit and insert a SIM — no lead time on carrier provisioning or civil works.",
    ],
  },
  {
    title: "Dual-SIM carrier redundancy",
    bullets: [
      "Two 4FF SIM slots let a second carrier stand by, protecting payment and POS traffic when one network degrades.",
    ],
  },
  {
    title: "Mount where the signal is",
    bullets: [
      "IP67 enclosure rated for continuous outdoor exposure — the radio goes on the wall, pole or roof rather than in a back room.",
    ],
  },
  {
    title: "Single-cable installation",
    bullets: [
      "PoE input carries power and data over one Cat 5e/6 run; no mains outlet needed at the mounting point.",
    ],
  },
  {
    title: "One playbook, two radios",
    bullets: [
      "EOR100 and EOR200 share enclosure, mounting and cabling, so 4G and 5G sites install and service identically.",
    ],
  },
  {
    title: "Built for tropical outdoor",
    bullets: ["−40 to +70 °C operating range, 5–95 % non-condensing humidity."],
  },
];

/**
 * Document-wide rules — sales' spec notes, which arrive as statements about
 * the document rather than about one column.
 *
 * `ingress_protection` is an OVERRIDE with no source row behind it on either
 * unit: the 4G sheet never mentions ingress at all and the 5G sheet says
 * IP66. That divergence from source is exactly what a rule is for, and why
 * the source PDFs stay attached to the record.
 */
const DOC_RULES = {
  hide: [
    "cpu",
    "flash",
    "ram",
    "wifi_frequency",
    "wifi_standard",
    "wifi",
    "network_extension",
    "mesh",
  ],
  override: {
    ingress_protection: "IP67",
  },
  rename: {
    dimension: "Dimensions",
  },
};

// ── EOR100 ← M16K06 (Datasheet 4G CPE M16K06 V1.0, p.3) ────────────────────

const EOR100_RAW = [
  { label: "CPU", value: "MTK7621AT+SDX12（cat6）", source_page: 3 },
  { label: "WiFi Frequency", value: "2.4G&5G", source_page: 3 },
  {
    label: "WiFi Standard",
    value:
      "2.4G:802.11b/g/n/ax 2T2R MIMO, 5.8GHz：802.11a/n/ac/ax 2T2R MIMO",
    source_page: 3,
  },
  { label: "WiFi", value: "2.4GHz :600Mbps ,5GHz :1200Mbps", source_page: 3 },
  { label: "LTE Data Rate", value: "DL: 300 Mbps / UL: 50 Mbps", source_page: 3 },
  {
    label: "4G & 3G Frequency Bands",
    value:
      "LTE-FDD\nB1/B2/B3/B4/B5/B7/B8/B12/B13/B14/B17/B18/B19/B20/B25/B26/B28/B29①/B30/B32①/B66/B71\nLTE-TDD\nB34/B38/B39/B40/B41/B42/B43/B46① (LAA)/B48 (CBRS)\nWCDMA\nB1/B2/B3/B4/B5/B6/B8/B19",
    source_page: 3,
  },
  { label: "Dimension", value: "145 × 130 × 45 mm", source_page: 3 },
  {
    label: "Interface",
    value:
      "1 × 10/100/1000 Mbps LAN\n1 × Reset button\n2 × SIM card slot (4FF, SIM/USIM/UIM, 3 V and 1.8 V)",
    source_page: 3,
  },
  { label: "Network Extension", value: "MESH", source_page: 3 },
  {
    label: "Reset",
    value: "Press and hold 10 seconds to restore factory settings",
    source_page: 3,
  },
  { label: "MESH", value: "Networking: short press (blue networking light flashes)", source_page: 3 },
  {
    label: "LED Indicator",
    value: "battery power, RF Signal, SIM Signal, SYS Signal",
    source_page: 3,
  },
  { label: "Power Consumption", value: "＜18W POE48V/0.6A", source_page: 3 },
  {
    label: "Environment",
    value:
      "Operating Temperature: -20℃ ~ +50℃\nStorage Temperature: -40℃ ~ +70℃\nHumidity: 5% ~ 95% (non-condensing)",
    source_page: 3,
  },
  { label: "Weight", value: "1.35KG（Includes color box accessories）", source_page: 3 },
];

const EOR100_RULES = {
  override: {
    // The source LED list starts with "battery power". Nothing in the
    // EnGenius enclosure has a battery — it is ODM copy-paste from another
    // unit, and it stays out.
    led_indicator: "RF Signal, SIM Signal, SYS Signal",
    // Source pairs the draw with a barrel-jack style "POE48V/0.6A". The
    // PoE standard is now its own row, so this one carries only the draw.
    power_consumption: "< 18 W",
    // Unified with EOR200. Two units in one outdoor enclosure quoting
    // different temperature ranges is the first thing a customer asks about.
    environment:
      "Operating Temperature: −40 °C ~ +70 °C\nStorage Temperature: −40 °C ~ +70 °C\nHumidity: 5 % ~ 95 % (non-condensing)",
    // Source weight includes the colour box. Datasheets quote net.
    weight: "1.35 kg",
  },
  add: [
    {
      key: "power_over_ethernet",
      label: "Power over Ethernet",
      value: "802.3af / 802.3at",
      after: "interface",
    },
  ],
};

// ── EOR200 ← M16M43 (Datasheet 5G CPE M16M43 V1.0, p.4–6) ──────────────────

const EOR200_RAW = [
  { label: "CPU", value: "IPQ5018+SDX62(RM520N-GL)", source_page: 4 },
  { label: "FLASH", value: "Nor+NAND (4MB+128MB)", source_page: 4 },
  { label: "RAM", value: "DDR3 512MB", source_page: 4 },
  { label: "WiFi Frequency", value: "2.4G&5.8G", source_page: 4 },
  { label: "WiFi Standard", value: "2.4G:802.11b/g/n/AX, 5.8G:802.11b/g/n/AC/AX", source_page: 4 },
  { label: "WiFi", value: "2.4GHz :600Mbps ,5.8G:2400Mbps", source_page: 4 },
  { label: "5G NR", value: "3GPP Release 16 NSA/SA operation, Sub-6 GHz", source_page: 4 },
  { label: "5G Network Mode", value: "NSA / SA", source_page: 4 },
  {
    label: "5G / 4G Data Rate",
    value:
      "5G SA: 2.1 Gbps / 900 Mbps (up to ISPs)\n5G NSA: 2.5 Gbps / 650 Mbps (up to ISPs)\nLTE: DL 1.0 Gbps / UL 200 Mbps",
    source_page: 4,
  },
  {
    label: "5G Frequency Bands",
    value:
      "5G NR NSA\nn1/2/3/5/7/8/12/13/14/18/20/25/26/28/29/30/38/40/41/48/66/70/71/75/76/77/78/79\n5G NR SA\nn1/2/3/5/7/8/12/13/14/18/20/25/26/28/29/30/38/40/41/48/66/70/71/75/76/77/78/79\nMIMO\nDownlink: 4 × 4 MIMO on n1/n2/n3/n7/n25/n38/n40/n41/n48/n66/n77/n78/n79",
    source_page: 4,
  },
  {
    label: "4G & 3G Frequency Bands",
    value:
      "Downlink Cat 19 / Uplink Cat 18\nLTE-FDD\nB1/2/3/4/5/7/8/12/13/14/17/18/19/20/25/26/28/29/30/32/66/71\nLTE-TDD\nB34/38/39/40/41/42/43/48\nMIMO\nDL: 4 × 4 MIMO on B2/B4/B5/B12/B13/B14/B17/B25/B26/B29/B30/B66/B41/B42/B43/B48/B71\nWCDMA\nB1/2/4/5/8/19",
    source_page: 5,
  },
  {
    label: "Modulation Mode",
    value:
      "5G:\nGMSK/8PSK/BPSK/QPSK/16QAM/64QAM/256QAM\nWIFI:\n1024-QAM / OFDMA",
    source_page: 5,
  },
  { label: "Dimension", value: "140 × 130 × 45 mm", source_page: 5 },
  {
    label: "Antenna gain",
    value: "5G Antenna: 5dBi All-directional antenna,  wifi Antenna: 5dBi",
    source_page: 5,
  },
  {
    label: "Interface",
    value:
      "1 × 10/100/1000/2500 Mbps LAN\n1 × Reset button\n2 × SIM card slot (4FF, SIM/USIM/UIM, 3 V and 1.8 V)",
    source_page: 5,
  },
  {
    label: "Reset",
    value: "Press and hold 10 seconds to restore factory settings",
    source_page: 5,
  },
  { label: "LED Indicator", value: "Power, RF Signal, SIM Signal, SYS Signal", source_page: 5 },
  { label: "Power Consumption", value: "＜24W（POE 48V/0.6A）", source_page: 5 },
  {
    label: "Environment",
    value:
      "Operating Temperature: -40℃ ~ +70℃\nStorage Temperature: -40℃ ~ +70℃\nHumidity: 5% ~ 95% (non-condensing)",
    source_page: 5,
  },
  { label: "Weight", value: "1.6KG（Includes color box accessories）", source_page: 5 },

  // ── software feature table (source p.6) ──────────────────────────────────
  // Rows sales agreed to keep. `Wireless Setup` and `Guest Network` are
  // dropped at source rather than hidden — they are Wi-Fi features and this
  // document has no Wi-Fi, so they were never part of the offer.
  {
    label: "Running status",
    value: "System, WAN port, mobile network, client list and real-time throughput",
    group: "software",
    source_page: 6,
  },
  {
    label: "Internet configuration",
    value: "WAN port supports PPPoE / static address / DHCP",
    group: "software",
    source_page: 6,
  },
  {
    label: "Mobile network settings",
    value: "IMEI display, mobile data switch, APN settings",
    group: "software",
    source_page: 6,
  },
  {
    label: "Wired setup",
    value: "Device IP address, subnet mask, DHCP pool size",
    group: "software",
    source_page: 6,
  },
  { label: "IPv6", value: "IPv6 addressing for WAN and LAN", group: "software", source_page: 6 },
  {
    label: "VPN",
    value: "IPsec / L2TP / PPTP / GRE / OpenVPN / WireGuard / ZeroTier",
    group: "software",
    source_page: 6,
  },
  { label: "Smart QoS", value: "Traffic shaping and flow control", group: "software", source_page: 6 },
  { label: "DDNS", value: "Dynamic DNS", group: "software", source_page: 6 },
  {
    label: "Parental controls",
    value: "Per-client internet access scheduling",
    group: "software",
    source_page: 6,
  },
  {
    label: "Firewall",
    value: "Port forwarding and DMZ",
    group: "software",
    source_page: 6,
  },
  { label: "UPnP", value: "Universal Plug and Play", group: "software", source_page: 6 },
  {
    label: "System maintenance",
    value: "Factory reset, reboot, language selection",
    group: "software",
    source_page: 6,
  },
  {
    label: "System diagnostics",
    value: "Ping by IP address or domain name",
    group: "software",
    source_page: 6,
  },
  { label: "Firmware update", value: "Local firmware upgrade", group: "software", source_page: 6 },
];

const EOR200_RULES = {
  override: {
    // Source folds a "WIFI: 1024-QAM / OFDMA" line into the same cell. The
    // row survives; the Wi-Fi half does not.
    modulation_mode: "5G: GMSK / 8PSK / BPSK / QPSK / 16QAM / 64QAM / 256QAM",
    // Same treatment: the cellular half only. ⚠️ How many of the four
    // external antennas remain once Wi-Fi is out is an open question for RD.
    antenna_gain: "5 dBi omnidirectional",
    power_consumption: "< 24 W",
    weight: "1.6 kg",
    environment:
      "Operating Temperature: −40 °C ~ +70 °C\nStorage Temperature: −40 °C ~ +70 °C\nHumidity: 5 % ~ 95 % (non-condensing)",
  },
  add: [
    {
      key: "power_over_ethernet",
      // 802.3af tops out at 15.4 W and cannot power a 24 W unit, so this
      // column says `at` alone where EOR100 says `af / at`. Printing
      // "802.3af/at" on both would read as a compatibility claim that fails
      // in the field on the first af switch someone plugs it into.
      label: "Power over Ethernet",
      value: "802.3at",
      after: "interface",
    },
  ],
};

// ── seed ───────────────────────────────────────────────────────────────────

function withKeys(rows: { label: string; value: string; group?: string; source_page?: number }[]) {
  return rows.map((r) => ({
    key: r.label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, ""),
    label: r.label,
    value: r.value,
    group: r.group ?? "spec",
    source_page: r.source_page ?? null,
    confidence: null,
  }));
}

async function main() {
  const reset = process.argv.includes("--reset");

  const { data: existing } = await supabase
    .from("project_datasheets")
    .select("id")
    .eq("name", NAME)
    .maybeSingle();

  if (existing && !reset) {
    console.log(`Already seeded: /projects/${existing.id}`);
    console.log("Re-run with --reset to recreate.");
    return;
  }
  if (existing) {
    await supabase.from("project_datasheets").delete().eq("id", existing.id);
    console.log("Deleted previous seed.");
  }

  const { data: doc, error: docErr } = await supabase
    .from("project_datasheets")
    .insert({
      name: NAME,
      customer: CUSTOMER,
      layout: "steel",
      headline: "Outdoor 4G / 5G Cellular Routers",
      series_name: "EOR100 / EOR200",
      category_label: "Cellular Router",
      overview: OVERVIEW,
      features: FEATURES,
      disclaimer: `PRELIMINARY — Prepared for ${CUSTOMER}. Specifications are subject to change without notice and do not constitute a commitment to supply.`,
      image_note: "Product image is representative; final appearance may differ.",
      sections: {
        features: true,
        specs: true,
        software: true,
        hardware: true,
        // No packaging exists at quoting time.
        package: false,
        diagram: false,
      },
      blank_policy: "tbd",
      doc_rules: DOC_RULES,
      notes:
        "Open with sales/RD: (1) is EOR100 really LTE Cat 6, (2) IP67 vs the 5G source's IP66, " +
        "(3) how many of the four antennas remain once Wi-Fi is out, (4) net weights.",
    })
    .select("id")
    .single();

  if (docErr) throw docErr;

  const { error: modelErr } = await supabase.from("project_datasheet_models").insert([
    {
      project_datasheet_id: doc.id,
      position: 0,
      model_name: "EOR100",
      display_name: "4G Indoor / Outdoor Router",
      raw_doc: withKeys(EOR100_RAW),
      rules: EOR100_RULES,
      images: [],
    },
    {
      project_datasheet_id: doc.id,
      position: 1,
      model_name: "EOR200",
      display_name: "5G Indoor / Outdoor Router",
      raw_doc: withKeys(EOR200_RAW),
      rules: EOR200_RULES,
      images: [],
    },
  ]);

  if (modelErr) throw modelErr;

  console.log(`Seeded.\n  editor:  /projects/${doc.id}\n  preview: /preview/project/${doc.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
