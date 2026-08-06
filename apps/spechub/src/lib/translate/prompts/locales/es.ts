/**
 * Layer 2: Spanish (Latin America / Mexico) translation rules.
 *
 * The length rules below are not style preferences — Spanish runs 15-25%
 * longer than English, and the datasheet cover is a fixed 486pt zone with
 * a 320pt cap on the features box. ECS1552FP translated without a length
 * constraint overflowed both (see the note in lib/datasheet/cover-layout.ts).
 *
 * Note it is LINES that break the layout, not characters. A bullet can grow
 * 11% and stay on the same wrapped line (harmless); another grows 37% and
 * takes a new one (breaks the box). Layer 2 states the rule; the per-item
 * character budget computed from the source is injected separately.
 *
 * Regional terminology the branch office prefers belongs in the DB glossary
 * (Layer 5), not here — that's editable without a deploy.
 */
export const esLocalePrompt = `## Spanish (Latin America) Translation Rules

### Length — this layout overflows easily, treat as a hard constraint
- Spanish naturally runs longer than English. Actively compress.
- Each feature bullet MUST fit the same number of ~42-character lines as its
  English source. Going from 2 lines to 3 breaks the datasheet cover.
- Prefer the shorter of two correct phrasings, every time.
- Drop filler that English carries but Spanish doesn't need
  ("designed to", "allows you to", "with the ability to").
- Never pad to sound more formal. Never add explanation the source lacks.

### Regional variant
- Latin American Spanish as used in Mexico — NOT Peninsular/Spain Spanish
- Use "ustedes", never "vosotros"
- "computadora" (not "ordenador"), "celular" (not "móvil"), "video" (not "vídeo")
- "administrar/administración" for managing devices reads more natural to
  Mexican IT readers than "gestionar/gestión" — prefer it when both fit

### Terminology
- Keep English for: Wi-Fi, PoE, VLAN, SSID, WPA3, QoS, SFP+, IEEE 802.11,
  IP, DNS, DHCP, NAT, VPN, ACL, RADIUS, uplink, firmware, standalone
- "Switch" → switch (masculine: el switch, los switches)
- "Access Point" → punto de acceso (or AP in technical context)
- "Cloud-managed" → administrado en la nube
- "Supports" → compatible con / admite
- "Up to" → hasta
- "Enterprise-grade" → de nivel empresarial
- "Bandwidth" → ancho de banda
- "Deployment" → implementación
- "Zero-touch provisioning" → aprovisionamiento zero-touch (keep the English term)
- "Surveillance" → videovigilancia

### Mechanics
- Numbers and units stay exactly as-is, half-width (740W, 10Gbps, 2.4GHz)
- Model names never translate (ECS1552FP)
- Use inverted punctuation (¿ ¡) where a question or exclamation occurs
- Formal register (usted), professional but not stiff — written for IT
  decision-makers, not consumers`;
