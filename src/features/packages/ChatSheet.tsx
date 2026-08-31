import type { ChatSession } from 'firebase/ai';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import { Sheet } from '../../components/ui/Sheet';
import { IconButton } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';
import { isAiAvailable } from '../ai/gemini';
import { startPackageChat, streamReply, suggestedQuestions, type ChatMessage } from '../ai/chat';
import type { TrackedPackage } from '../tracking/types';

function Bubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const mine = message.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring}
      className={cn('flex', mine ? 'justify-start' : 'justify-end')}
    >
      <p
        className={cn(
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
          mine ? 'bg-primary text-on-primary' : 'bg-elevated text-fg',
        )}
      >
        {message.text}
        {streaming && (
          <span aria-hidden className="ms-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-text-bottom" />
        )}
      </p>
    </motion.div>
  );
}

/**
 * Ask-anything sheet for a single package.
 *
 * The session is created lazily on open so no tokens are spent by users who
 * never ask anything, and torn down on close so the next open starts clean with
 * the latest event log baked into the system prompt.
 */
export function ChatSheet({
  pkg,
  open,
  onClose,
}: {
  pkg: TrackedPackage;
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const sessionRef = useRef<ChatSession | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const aiOn = isAiAvailable();

  useEffect(() => {
    if (!open) {
      sessionRef.current = null;
      setMessages([]);
      setDraft('');
      return;
    }
    if (aiOn) sessionRef.current = startPackageChat(pkg);
  }, [open, pkg, aiOn]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || streaming) return;

    setDraft('');
    setMessages((prev) => [...prev, { role: 'user', text: question }, { role: 'model', text: '' }]);
    setStreaming(true);

    try {
      const session = sessionRef.current ?? (aiOn ? startPackageChat(pkg) : null);
      sessionRef.current = session;
      if (!session) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: 'model',
            text: 'צריך חיבור לאינטרנט כדי לשאול שאלות. שאר הפרטים על החבילה זמינים גם ללא חיבור.',
          };
          return next;
        });
        return;
      }

      let acc = '';
      for await (const chunk of streamReply(session, question)) {
        acc += chunk;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'model', text: acc };
          return next;
        });
      }
    } finally {
      setStreaming(false);
    }
  };

  const suggestions = suggestedQuestions(pkg);

  return (
    <Sheet open={open} onClose={onClose} title="שאל על החבילה" bare>
      <div className="flex h-full min-h-0 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="space-y-3 py-2">
              <p className="flex items-start gap-2 text-sm leading-relaxed text-muted">
                <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                אני רואה את כל רשומות המעקב של החבילה הזאת. שאל מה שתרצה — אענה לפי מה שכתוב בהן.
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    className="rounded-full border border-line bg-surface px-3 py-2 text-start text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <Bubble key={i} message={m} streaming={streaming && i === messages.length - 1 && m.role === 'model'} />
            ))
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
          className="flex shrink-0 items-end gap-2 border-t border-line p-3 safe-b"
        >
          <label htmlFor="chat-input" className="sr-only">
            השאלה שלך
          </label>
          <textarea
            id="chat-input"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            placeholder="כתוב שאלה…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface px-3.5 py-3 text-sm placeholder:text-subtle focus:outline-none focus-visible:border-primary"
          />
          <IconButton
            label="שלח"
            type="submit"
            variant="primary"
            disabled={!draft.trim() || streaming}
            className="shrink-0"
          >
            <ArrowUp className="size-5" />
          </IconButton>
        </form>
      </div>
    </Sheet>
  );
}
