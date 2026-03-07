import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Trash2, ArrowDown } from 'lucide-react';
import { useNaturalLanguageChat, type ChatMessage } from '@/hooks/useNaturalLanguageChat';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { DynamicDataGrid } from '@/components/DynamicDataGrid';

interface AIChatProps {
  className?: string;
  placeholder?: string;
  suggestions?: string[];
}

export function AIChat({
  className,
  placeholder = "Pergunte alguma coisa...",
  suggestions = [
    "Analyze my recent deals",
    "Summarize contact activity",
    "Generate a follow-up email",
    "What are my top leads?"
  ]
}: AIChatProps) {
  const { messages, isLoading, isExecuting, streamingContent, sendMessage, clearMessages } = useNaturalLanguageChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const messageToSend = input;
    setInput('');
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    await sendMessage(messageToSend);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize the textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Detect if scrolled away from bottom
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 100);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const hasMessages = messages.length > 0 || streamingContent;

  return (
    <div className={cn("flex flex-col h-full overflow-hidden relative", className)}>
      {/* Scrollable messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {!hasMessages ? (
          /* Empty state / Welcome screen */
          <div className="flex flex-col items-center justify-center min-h-full px-4 py-12">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
              Olá, como posso ajudar?
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base mb-8 text-center max-w-md">
              Use uma das sugestões abaixo ou escreva sua própria pergunta.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="flex items-start gap-3 text-left p-3 rounded-xl border border-border/60
                    bg-card hover:bg-accent/40 transition-colors duration-150 group"
                >
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
                    {suggestion}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="max-w-3xl mx-auto px-4 py-6">
            <div className="space-y-6">
              {messages.filter((m) => !m.isHidden).map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {streamingContent && (
                <MessageBubble
                  message={{
                    id: 'streaming',
                    role: 'assistant',
                    content: streamingContent,
                    timestamp: new Date(),
                  }}
                />
              )}

              {isLoading && <LoadingIndicator />}

              {isExecuting && !isLoading && (
                <div className="text-sm text-muted-foreground animate-pulse pl-1">
                  Processando resultados...
                </div>
              )}
            </div>
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Scroll-to-bottom FAB */}
      {showScrollDown && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute left-1/2 -translate-x-1/2 bottom-28 z-20
            w-9 h-9 rounded-full bg-background border border-border shadow-lg
            flex items-center justify-center hover:bg-accent transition-colors"
        >
          <ArrowDown className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      {/* Input area — sticky at bottom */}
      <div className="shrink-0 border-t border-border/40 bg-background">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <form onSubmit={handleSubmit} className="relative">
            <div className="flex items-end gap-2 bg-muted/50 border border-border/60 rounded-2xl px-4 py-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isLoading}
                rows={1}
                className="flex-1 bg-transparent border-0 outline-none resize-none text-sm sm:text-base
                  placeholder:text-muted-foreground/60 py-1.5 max-h-[160px] leading-relaxed"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground
                  flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed
                  hover:bg-primary/90 transition-colors mb-0.5"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Actions bar */}
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-[10px] text-muted-foreground/60">
              IA pode cometer erros. Verifique informações importantes.
            </p>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearMessages}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Limpar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Message Bubble ─────────────── */

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const safeContent = cleanMessageContent(message.content);
  const resultRows = message.queryResult?.data;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[75%]">
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5">
            <p className="whitespace-pre-wrap text-sm sm:text-[15px] leading-relaxed">{safeContent}</p>
          </div>
          <p className="text-[10px] text-muted-foreground/60 text-right mt-1 mr-1">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  }

  // Assistant message — no box, clean text like ChatGPT
  return (
    <div className="max-w-full">
      <div className="prose prose-sm sm:prose-base max-w-none dark:prose-invert
        prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold
        prose-p:my-2 prose-p:leading-relaxed prose-p:text-foreground
        prose-li:text-foreground prose-strong:text-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            code: ({ inline, className, children, ...props }: any) => {
              return !inline ? (
                <div className="relative group my-3">
                  <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-xl overflow-x-auto text-[13px] leading-relaxed">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                  <button
                    type="button"
                    onClick={() => {
                      const text = String(children).replace(/\n$/, '');
                      navigator.clipboard.writeText(text);
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100
                      bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[10px] font-medium
                      px-2 py-1 rounded-md transition-opacity"
                  >
                    Copiar
                  </button>
                </div>
              ) : (
                <code className="bg-muted px-1.5 py-0.5 rounded text-[13px] font-mono" {...props}>
                  {children}
                </code>
              );
            },
            table: ({ children }) => (
              <div className="overflow-x-auto my-3 rounded-lg border border-border">
                <table className="min-w-full text-sm">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th className="px-3 py-2 bg-muted/50 text-left font-semibold text-xs uppercase tracking-wide border-b border-border">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 border-b border-border/50">
                {children}
              </td>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-3 border-primary/40 pl-4 my-3 text-muted-foreground italic">
                {children}
              </blockquote>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-outside pl-5 space-y-1 my-2">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-outside pl-5 space-y-1 my-2">{children}</ol>
            ),
          }}
        >
          {safeContent}
        </ReactMarkdown>
      </div>

      {!!resultRows?.length && (
        <div className="mt-3 rounded-xl border border-border bg-card p-3">
          <DynamicDataGrid data={resultRows} />
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60 mt-1.5 ml-0.5">
        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}

/* ─────────────── Loading Indicator ─────────────── */

function LoadingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-2">
      <div className="flex space-x-1">
        <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-muted-foreground/60">Pensando...</span>
    </div>
  );
}

/* ─────────────── Helpers ─────────────── */

function cleanMessageContent(content: string) {
  return content
    .replace(/\[AUTO_EXECUTE\]/gi, '')
    .replace(/```sql[\s\S]*?```/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
