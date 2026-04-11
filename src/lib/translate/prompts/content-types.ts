/**
 * Layer 4: Content-type specific rules.
 */

export const contentTypePrompts: Record<string, string> = {
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
