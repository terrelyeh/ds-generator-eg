/**
 * Conversation history, trimmed to a prompt budget.
 *
 * History goes into the LLM prompt verbatim, so a long conversation inflates
 * the prefill — slower first token, and paid for — on every single turn. Each
 * message is capped and so is the whole block. Answers lead with the
 * conclusion (the prompt contract says so), so truncating a message's tail
 * keeps the informative part.
 *
 * Lifted out of the route so it can be tested: it decides what the model is
 * allowed to remember, and it walks BACKWARDS from the newest turn, which is
 * the kind of loop that is easy to get subtly wrong and impossible to notice.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const HISTORY_MSG_CHAR_CAP = 1500;
export const HISTORY_TOTAL_CHAR_BUDGET = 12000;

export function trimHistory(history: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let budget = HISTORY_TOTAL_CHAR_BUDGET;
  for (let i = history.length - 1; i >= 0; i--) {
    let content = history[i].content;
    if (content.length > HISTORY_MSG_CHAR_CAP) {
      content = content.slice(0, HISTORY_MSG_CHAR_CAP) + " …(truncated)";
    }
    if (content.length > budget) break;
    budget -= content.length;
    out.unshift({ role: history[i].role, content });
  }
  return out;
}
