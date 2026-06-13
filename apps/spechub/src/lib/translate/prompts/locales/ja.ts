/**
 * Layer 2: Japanese-specific translation rules.
 */
export const jaLocalePrompt = `## Japanese Translation Rules

- Use polite form (です・ます体) for product descriptions
- Technical terms: use katakana for established loanwords (クラウド, ネットワーク, スイッチ, ファイアウォール)
- Keep English for: Wi-Fi, PoE, VLAN, SSID, WPA3, QoS, SFP+, IEEE 802.11, IP, HTTP, DNS, DHCP, NAT, VPN
- "Access Point" → アクセスポイント (or AP in technical context)
- "Switch" → スイッチ
- "Camera" → カメラ
- "Firewall" → ファイアウォール
- "Cloud-managed" → クラウド管理型
- "Supports" → 対応 or サポート (context-dependent)
- "Up to" → 最大
- Avoid excessive kanji — use katakana for commonly used IT terms
- Numbers and units stay in half-width characters (1300Mbps, 2.4GHz)
- Use 「」for quoted terms if needed, not ""`;
