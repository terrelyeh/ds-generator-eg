/**
 * Battlecard self-value mapping — Cloud AP.
 *
 * EnGenius's own `spec_items` labels don't line up 1:1 with the battlecard
 * comparison dimensions (and a single spec cell often packs all three bands).
 * This table maps each battlecard `dimension_key` to the EnGenius spec label(s)
 * that carry the answer, plus a short `summarize` note describing how to distil
 * the raw spec value into a battlecard-comparable cell.
 *
 * Used by the self-seed step (spec_items → battlecard_values) to pre-fill the
 * EnGenius columns. Anything not mapped here (or not found on a given model) is
 * left blank for the PM to fill in the battlecard UI. Competitor values do NOT
 * use this — they come from the firecrawl/AI extraction against the same
 * dimension template.
 */

export interface DimensionSpecMapping {
  /** battlecard_dimensions.dimension_key */
  dimensionKey: string;
  /** EnGenius spec_items.label patterns to pull from (first match wins) */
  specLabels: RegExp[];
  /** How to distil the raw spec value into a battlecard cell */
  summarize: string;
}

export const CLOUD_AP_SPEC_MAPPING: DimensionSpecMapping[] = [
  { dimensionKey: "wifi_standard", specLabels: [/^standards$/i], summarize: "Marketing WiFi gen from the highest 802.11 letter (be→Wi-Fi 7, ax→Wi-Fi 6)." },
  { dimensionKey: "radio_bands", specLabels: [/operating frequency/i, /^standards$/i], summarize: "Bands + dual/tri-band, e.g. '2.4 / 5 / 6 GHz (tri-band)'." },
  { dimensionKey: "spatial_streams", specLabels: [/radio chains/i], summarize: "Verbatim stream notation, e.g. '4 × 4:4'." },
  { dimensionKey: "max_data_rate", specLabels: [/supported data rates/i, /mimo capability/i], summarize: "Sum the per-band PHY maxima → 'Up to N Gbps'." },
  { dimensionKey: "channel_width", specLabels: [/channelization/i], summarize: "Highest supported width, e.g. 'Up to 320 MHz (EHT)'." },
  { dimensionKey: "mu_mimo", specLabels: [/mu-mimo/i], summarize: "Yes/No + stream count." },
  { dimensionKey: "ofdma", specLabels: [/supported radio technologies/i], summarize: "Yes if OFDMA listed (802.11ax/be)." },
  { dimensionKey: "mlo", specLabels: [], summarize: "Not in EnGenius spec sheet — leave blank, PM confirms (Wi-Fi 7 = Yes)." },
  { dimensionKey: "tx_power", specLabels: [/transmit power/i], summarize: "Per-band max dBm, e.g. '25 / 24 / 24 dBm'." },
  { dimensionKey: "antenna", specLabels: [/^antenna$/i], summarize: "Internal/external + per-band dBi." },
  { dimensionKey: "max_clients", specLabels: [/max concurrent user/i], summarize: "Verbatim number." },
  { dimensionKey: "recommended_users", specLabels: [], summarize: "Not in spec — PM fills." },
  { dimensionKey: "bss_coloring", specLabels: [], summarize: "Not broken out in spec — PM fills (Wi-Fi 6/7 = Yes)." },
  { dimensionKey: "ethernet_ports", specLabels: [/physical interfaces/i], summarize: "Port count + speed + which is PoE." },
  { dimensionKey: "uplink_speed", specLabels: [/physical interfaces/i], summarize: "Fastest wired port speed." },
  { dimensionKey: "poe_input", specLabels: [/power source/i], summarize: "PoE standard, e.g. '802.3bt (PoE++)'." },
  { dimensionKey: "power_consumption", specLabels: [/maximum power consumption/i], summarize: "Verbatim watts." },
  { dimensionKey: "bluetooth", specLabels: [/^ble$/i, /bluetooth/i], summarize: "N/A or version." },
  { dimensionKey: "iot_radio", specLabels: [/scanning radio/i], summarize: "N/A unless a dedicated IoT radio exists." },
  { dimensionKey: "cloud_management", specLabels: [], summarize: "Always 'EnGenius Cloud' for Cloud line." },
  { dimensionKey: "license_model", specLabels: [], summarize: "Positioning — PM fills (tiered free/PRO)." },
  { dimensionKey: "local_management", specLabels: [/local web access/i], summarize: "Yes if local HTTP/HTTPS." },
  { dimensionKey: "dimensions", specLabels: [/^dimensions$/i], summarize: "W × L × H mm on one line." },
  { dimensionKey: "weight", specLabels: [/^weight$/i], summarize: "Verbatim grams." },
  { dimensionKey: "mounting", specLabels: [/package contents/i], summarize: "Mount types from the bundled kit." },
  { dimensionKey: "operating_temp", specLabels: [/temperature range/i], summarize: "Operating range in °C." },
  { dimensionKey: "warranty", specLabels: [], summarize: "Not in spec — PM fills." },
  { dimensionKey: "msrp", specLabels: [], summarize: "Internal price — PM fills." },
];
