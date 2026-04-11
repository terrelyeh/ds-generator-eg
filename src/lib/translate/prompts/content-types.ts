/**
 * Layer 4: Content-type specific rules.
 */

export const contentTypePrompts: Record<string, string> = {
  headline: `## Content Type: Product Headline

You are translating a product TITLE — this appears as the main heading on a datasheet cover page.
- This is NOT a sentence or description — it's a title/heading
- Use concise noun-phrase style (名詞句スタイル for Japanese)
- NO sentence endings (です/ます/である for Japanese; 的/了 for Chinese)
- Stack key descriptors: product type + key differentiating features
- Keep it to 1-2 lines maximum
- Think of it like a product packaging title or a trade show banner
- Restructure word order if it reads more naturally in the target language
- Output: a single line of translated title text`,

  overview: `## Content Type: Product Overview

You are translating a product overview paragraph (2-3 sentences).
- You may slightly restructure sentences for better flow in the target language
- Keep it concise — same length or shorter than the source
- Maintain a professional marketing tone
- Output: a single paragraph of translated text`,

  features: `## Content Type: Feature List

You are translating a list of product features (bullet points).
- Each feature is one line — keep them as separate lines
- Start each line with a verb or key capability
- Keep each line concise (one sentence max)
- Output format: one feature per line, separated by newlines
- Return EXACTLY the same number of lines as the input`,

  spec_labels: `## Content Type: Specification Labels

You are translating technical specification labels (short noun phrases).
- These are table row headers like "Operating Temperature", "Max Power Consumption"
- Keep translations short and noun-like
- Use industry-standard terminology for the target language
- Input format: one label per line
- Output format: one translated label per line, same order, same count
- Return EXACTLY the same number of lines as the input`,
};
