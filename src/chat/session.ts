import type { Context, Hospital } from "../domain";
import {
  answerChat,
  replyIsCurrent,
  type ChatReply,
  type QuestionInterpreter,
} from "./adapter";

/** UI-independent request lifecycle. Call dispose when the panel unmounts or
 * its hospital/guide/encounter changes. Only the most recent request may render.
 * No history is persisted. Only the current question and permitted metadata
 * reach an optional interpreter through the adapter. */
export function createChatSession(
  current: () => { hospital: Hospital; context: Context },
  options: { interpreter?: QuestionInterpreter; timeoutMs?: number } = {},
) {
  let sequence = 0;
  let controller: AbortController | undefined;
  let nextId = 1;
  const cancel = () => {
    sequence++;
    controller?.abort();
    controller = undefined;
  };
  return {
    cancel,
    dispose: cancel,
    async submit(
      question: string,
      previousField?: string,
    ): Promise<ChatReply | undefined> {
      cancel();
      const ticket = sequence;
      const requestController = new AbortController();
      controller = requestController;
      const { hospital, context } = current();
      const firstId = nextId;
      nextId += 6;
      try {
        const reply = await answerChat(hospital, context, question, {
          ...options,
          previousField,
          firstId,
          signal: requestController.signal,
        });
        const active = current();
        if (
          ticket !== sequence ||
          !replyIsCurrent(reply, active.hospital, active.context)
        )
          return;
        return reply;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        throw error;
      } finally {
        if (ticket === sequence) controller = undefined;
      }
    },
  };
}
