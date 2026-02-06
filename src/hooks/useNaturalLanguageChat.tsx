import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationContext } from '@/hooks/useOrganizationContext';
import { toast } from 'sonner';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isHidden?: boolean;
}

export interface QueryResult {
  operation?: string;
  rowCount?: number;
  data?: Array<Record<string, any>>;
}

const AUTO_EXECUTE_TAG = '[AUTO_EXECUTE]';

export function useNaturalLanguageChat() {
  const { user, session } = useAuth();
  const { currentOrganization } = useOrganizationContext();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingContent('');
    setQueryResult(null);
    setConversationId(null);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    if (!user || !currentOrganization) {
      toast.error('Nao foi possivel enviar agora.');
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent('');
    setQueryResult(null);

    let activeConversationId = conversationId;

    try {
      if (!activeConversationId) {
        try {
          activeConversationId = await createConversation(currentOrganization.id, user.id, content);
          setConversationId(activeConversationId);
        } catch (error) {
          console.error('Conversation create error:', error);
          activeConversationId = null;
        }
      }

      if (activeConversationId) {
        try {
          await createMessage(activeConversationId, 'user', content, false);
        } catch (error) {
          console.error('Message create error:', error);
        }
      }

      if (activeConversationId && messages.length === 0) {
        const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
        try {
          await updateConversationTitle(activeConversationId, title);
        } catch (error) {
          console.error('Conversation title error:', error);
        }
      }

      const apiMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content },
      ];

      const response = await sendChatMessage(apiMessages, activeConversationId || undefined, session?.access_token);

      if (!response.ok) {
        throw new Error('Falha ao enviar mensagem');
      }

      const contentType = response.headers.get('Content-Type') || '';
      if (!contentType.includes('text/event-stream')) {
        const fallbackMessage = await readNonStreamResponse(response);
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: fallbackMessage,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        return;
      }

      const { visibleContent, sql } = await readStream(response.body, (text) => {
        setStreamingContent(cleanMessageContent(text));
      });
      const cleanedContent = cleanMessageContent(visibleContent);

      if (cleanedContent.trim() || sql) {
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: cleanedContent.trim() || 'Certo, aqui estao os resultados.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        if (activeConversationId) {
          try {
            await createMessage(activeConversationId, 'assistant', assistantMessage.content, false);
          } catch (error) {
            console.error('Message create error:', error);
          }
        }
      }

      if (!cleanedContent.trim() && !sql) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Nao consegui responder agora. Tente reformular.',
            timestamp: new Date(),
          },
        ]);
      }

      if (sql) {
        setIsExecuting(true);
        const execResult = await executeQuery(sql, session?.access_token);
        setIsExecuting(false);

        if (execResult?.success) {
          setQueryResult(execResult.data || null);
          if (execResult.data?.data?.length) {
            toast.success('Acao concluida com sucesso.');
          }
        } else {
          const friendly = mapErrorToMessage(execResult?.code);
          toast.error(friendly);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Nao foi possivel concluir agora.');
    } finally {
      setIsLoading(false);
      setStreamingContent('');
      setIsExecuting(false);
    }
  }, [conversationId, currentOrganization, isLoading, messages, session?.access_token, user]);

  return {
    messages,
    isLoading,
    isExecuting,
    streamingContent,
    queryResult,
    sendMessage,
    clearMessages,
  };
}

function cleanMessageContent(content: string) {
  return content
    .replace(/\[AUTO_EXECUTE\]/gi, '')
    .replace(/```sql[\s\S]*?```/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function createConversation(organizationId: string, userId: string, titleSeed: string) {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      title: titleSeed ? titleSeed.slice(0, 50) : 'Nova conversa',
    })
    .select()
    .single();

  if (error) throw error;
  return data.id as string;
}

async function updateConversationTitle(conversationId: string, title: string) {
  await supabase
    .from('conversations')
    .update({ title })
    .eq('id', conversationId);
}

async function createMessage(conversationId: string, role: string, content: string, isHidden: boolean) {
  await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
      is_hidden: isHidden,
    });
}

async function sendChatMessage(
  messages: { role: string; content: string }[],
  conversationId?: string,
  accessToken?: string,
) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Configuracao ausente');
  }

  return fetch(`${supabaseUrl}/functions/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${accessToken || supabaseKey}`,
    },
    body: JSON.stringify({ messages, conversationId }),
  });
}

async function executeQuery(query: string, accessToken?: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { success: false, code: 'config_missing' };
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/execute-query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${accessToken || supabaseKey}`,
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  if (!response.ok) {
    return { success: false, code: result?.code };
  }

  return result;
}

async function readStream(
  body: ReadableStream<Uint8Array> | null,
  onStream: (text: string) => void,
) {
  if (!body) return { visibleContent: '', sql: '' };

  const reader = body.getReader();
  const decoder = new TextDecoder();

  let visibleContent = '';
  let sqlBuffer = '';
  let pending = '';
  let foundTag = false;

  const appendText = (text: string) => {
    pending += text;

    if (!foundTag) {
      const index = pending.indexOf(AUTO_EXECUTE_TAG);
      if (index >= 0) {
        visibleContent += pending.slice(0, index);
        pending = pending.slice(index + AUTO_EXECUTE_TAG.length);
        foundTag = true;
      }
    }

    if (foundTag) {
      sqlBuffer += pending;
      pending = '';
    } else if (pending.length > AUTO_EXECUTE_TAG.length) {
      const flushPoint = pending.length - AUTO_EXECUTE_TAG.length;
      visibleContent += pending.slice(0, flushPoint);
      pending = pending.slice(flushPoint);
    }

    onStream(visibleContent);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          appendText(content);
        }
      } catch {
        // ignore
      }
    }
  }

  if (foundTag) {
    sqlBuffer += pending;
  } else {
    visibleContent += pending;
  }

  let sql = extractSql(sqlBuffer);
  if (!foundTag && !sql) {
    const fallbackSql = extractSqlFromFenced(visibleContent);
    if (fallbackSql) {
      sql = fallbackSql;
      visibleContent = cleanMessageContent(visibleContent);
    }
  }

  return { visibleContent, sql };
}

function extractSql(sqlBuffer: string) {
  if (!sqlBuffer) return '';

  const fencedSql = sqlBuffer.match(/```sql\s*([\s\S]*?)```/i);
  if (fencedSql?.[1]) {
    return fencedSql[1].trim();
  }

  const fenced = sqlBuffer.match(/```\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return sqlBuffer.replace(AUTO_EXECUTE_TAG, '').trim();
}

function extractSqlFromFenced(content: string) {
  const fencedSql = content.match(/```sql\s*([\s\S]*?)```/i);
  if (fencedSql?.[1]) {
    return fencedSql[1].trim();
  }
  return '';
}

async function readNonStreamResponse(response: Response) {
  try {
    const data = await response.json();
    if (data?.error) {
      return mapErrorToMessage(data?.code) || 'Nao foi possivel concluir agora.';
    }
  } catch {
    // ignore
  }
  return 'Nao foi possivel concluir agora.';
}

function mapErrorToMessage(code?: string) {
  switch (code) {
    case '23502':
      return 'Nao foi possivel concluir. Faltou uma informacao obrigatoria.';
    case '23503':
      return 'Nao foi possivel concluir. Um item relacionado nao foi encontrado.';
    case '23505':
      return 'Nao foi possivel concluir. Ja existe um registro parecido.';
    case '22001':
      return 'Nao foi possivel concluir. O texto e muito longo.';
    case 'forbidden_operation':
    case 'write_not_allowed':
    case 'operation_not_allowed':
    case 'multi_statement_not_allowed':
      return 'Nao foi possivel concluir esta solicitacao.';
    case 'config_missing':
      return 'Nao foi possivel concluir agora.';
    default:
      return 'Nao foi possivel concluir agora.';
  }
}
