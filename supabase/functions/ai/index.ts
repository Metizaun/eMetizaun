import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const ALLOWED_TABLES = [
  "leads",
  "lead_lists",
  "deals",
  "notes",
  "tasks",
  "partners",
  "companies",
  "contacts",
];

const INSERT_TABLES = ["tasks", "notes"];

const METADATA_TTL_MS = 5 * 60 * 1000;

type GeminiPart =
  | { text: string }
  | {
      functionCall: {
        name: string;
        args?: Record<string, unknown> | string;
      };
    }
  | {
      functionResponse: {
        name: string;
        response: { content: unknown };
      };
    };

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

type TableMeta = {
  columns: string[];
  hasOrganizationId: boolean;
};

type MetadataCache = {
  expiresAt: number;
  tables: Record<string, TableMeta>;
};

let metadataCache: MetadataCache | null = null;

const tools = [
  {
    functionDeclarations: [
      {
        name: "crm_query",
        description:
          "Consulta generica em tabelas CRM usando parametros estruturados.",
        parameters: {
          type: "object",
          properties: {
            table: { type: "string", enum: ALLOWED_TABLES },
            select: {
              type: "array",
              items: { type: "string" },
            },
            filters: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  column: { type: "string" },
                  op: {
                    type: "string",
                    enum: ["eq", "ilike", "gte", "lte", "in"],
                  },
                  value: {},
                },
                required: ["column", "op", "value"],
              },
            },
            order_by: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  column: { type: "string" },
                  ascending: { type: "boolean" },
                },
                required: ["column"],
              },
            },
            limit: { type: "number" },
            offset: { type: "number" },
            aggregate: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["count"] },
                column: { type: "string" },
              },
              required: ["type"],
            },
          },
          required: ["table"],
        },
      },
      {
        name: "crm_insert",
        description:
          "Insere dados no CRM. Somente permitido para tasks e notes.",
        parameters: {
          type: "object",
          properties: {
            table: { type: "string", enum: INSERT_TABLES },
            values: { type: "object" },
          },
          required: ["table", "values"],
        },
      },
    ],
  },
];

function getTextFromParts(parts?: GeminiPart[]) {
  if (!parts) return "";
  const textParts = parts.filter((part) => "text" in part) as Array<{
    text: string;
  }>;
  return textParts.map((part) => part.text).join("\n").trim();
}

function coerceArgs(args?: Record<string, unknown> | string) {
  if (!args) return {};
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }
  return args;
}

async function loadMetadata(supabase: ReturnType<typeof createClient>) {
  const now = Date.now();
  if (metadataCache && metadataCache.expiresAt > now) {
    return metadataCache.tables;
  }

  const { data, error } = await supabase
    .schema("information_schema")
    .from("columns")
    .select("table_name,column_name")
    .eq("table_schema", "public")
    .in("table_name", ALLOWED_TABLES);

  if (error) {
    throw new Error(`Metadata error: ${error.message}`);
  }

  const tables: Record<string, TableMeta> = {};
  for (const table of ALLOWED_TABLES) {
    tables[table] = { columns: [], hasOrganizationId: false };
  }

  for (const row of data ?? []) {
    const tableName = row.table_name as string;
    const columnName = row.column_name as string;
    if (!tables[tableName]) continue;
    tables[tableName].columns.push(columnName);
    if (columnName === "organization_id") {
      tables[tableName].hasOrganizationId = true;
    }
  }

  metadataCache = {
    expiresAt: now + METADATA_TTL_MS,
    tables,
  };

  return tables;
}

function formatMetadata(tables: Record<string, TableMeta>) {
  const lines: string[] = [];
  for (const table of ALLOWED_TABLES) {
    const meta = tables[table];
    if (!meta || meta.columns.length === 0) continue;
    lines.push(`- ${table}: ${meta.columns.join(", ")}`);
  }
  return lines.join("\n");
}

function validateColumns(meta: TableMeta, columns: string[]) {
  const invalid = columns.filter(
    (column) => column !== "*" && !meta.columns.includes(column),
  );
  if (invalid.length) {
    return `Invalid columns: ${invalid.join(", ")}`;
  }
  return null;
}

function getLimit(limit?: number) {
  const safe = typeof limit === "number" ? Math.floor(limit) : 20;
  if (safe <= 0) return 20;
  return Math.min(safe, 50);
}

async function callGemini(
  apiKey: string,
  contents: Array<{ role: string; parts: GeminiPart[] }>,
  systemInstruction: string,
) {
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini API error: ${response.status} ${response.statusText} ${errorText}`,
    );
  }

  return (await response.json()) as GeminiResponse;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message, deepSearch } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase environment not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "User not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("organization_id")
      .eq("user_id", userData.user.id)
      .limit(1);

    if (rolesError || !roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const organizationId = roles[0].organization_id as string;
    const tableMetadata = await loadMetadata(supabase);
    const metadataText = formatMetadata(tableMetadata);

    const systemInstruction = [
      "Voce e um agente de dados CRM conectado ao banco via Supabase.",
      "Use exclusivamente as tools crm_query e crm_insert para ler e escrever.",
      "RLS e obrigatorio. A organization_id sempre deve ser respeitada.",
      "Caso precise de mais contexto para criar uma tarefa, pergunte ao usuario sua necessidade.",
      deepSearch
        ? "Responda com mais profundidade, detalhando raciocinio e recomendacoes."
        : "Responda de forma direta e objetiva.",
      "",
      "Metadados das tabelas permitidas:",
      metadataText,
      "",
      "Exemplos:",
      "- Usuario: 'Quantas tasks em aberto?' -> crm_query em tasks com filtro status Pending e aggregate count.",
      "- Usuario: 'Empresa Acme tem quantas tasks?' -> crm_query em companies para pegar id, depois crm_query em tasks com company_id.",
      "- Usuario: 'Crie uma task para amanha' -> crm_insert em tasks com title e due_date.",
      "- Usuario: 'Crie uma nota sobre negociacao X' -> crm_insert em notes.",
    ].join("\n");

    const contents: Array<{ role: string; parts: GeminiPart[] }> = [
      { role: "user", parts: [{ text: message }] },
    ];

    let finalText = "";
    let iteration = 0;

    while (iteration < 3) {
      const geminiResponse = await callGemini(
        apiKey,
        contents,
        systemInstruction,
      );
      const parts = geminiResponse.candidates?.[0]?.content?.parts || [];
      const functionCalls = parts.filter(
        (part) => "functionCall" in part,
      ) as Array<{
        functionCall: { name: string; args?: Record<string, unknown> | string };
      }>;

      if (functionCalls.length === 0) {
        finalText = getTextFromParts(parts);
        break;
      }

      for (const call of functionCalls) {
        const name = call.functionCall.name;
        const args = coerceArgs(call.functionCall.args);
        let result: unknown = [];

        try {
          if (name === "crm_query") {
            const table = String(args.table ?? "");
            if (!ALLOWED_TABLES.includes(table)) {
              result = { error: "Table not allowed" };
            } else {
              const meta = tableMetadata[table];
              if (!meta) {
                result = { error: "Table metadata not found" };
              } else {
                const select = Array.isArray(args.select)
                  ? (args.select as string[])
                  : [];
                const selectColumns = select.length ? select : ["*"];
                const columnError = validateColumns(meta, selectColumns);
                if (columnError) {
                  result = { error: columnError };
                } else {
                  const aggregate = args.aggregate as
                    | { type?: string; column?: string }
                    | undefined;
                  const isCount = aggregate?.type === "count";
                  let query = supabase.from(table).select(
                    isCount
                      ? aggregate?.column ?? "id"
                      : selectColumns.join(","),
                    isCount ? { count: "exact", head: true } : undefined,
                  );

                  const filters = Array.isArray(args.filters)
                    ? (args.filters as Array<{
                        column?: string;
                        op?: string;
                        value?: unknown;
                      }>)
                    : [];

                  for (const filter of filters) {
                    const column = String(filter.column ?? "");
                    const op = String(filter.op ?? "");
                    if (!column || !op) continue;
                    const colError = validateColumns(meta, [column]);
                    if (colError) {
                      result = { error: colError };
                      break;
                    }
                    if (op === "eq") {
                      query = query.eq(column, filter.value);
                    } else if (op === "ilike") {
                      query = query.ilike(column, String(filter.value ?? ""));
                    } else if (op === "gte") {
                      query = query.gte(column, filter.value as string | number);
                    } else if (op === "lte") {
                      query = query.lte(column, filter.value as string | number);
                    } else if (op === "in") {
                      if (Array.isArray(filter.value)) {
                        query = query.in(column, filter.value);
                      } else {
                        result = { error: "Filter value must be array for in" };
                        break;
                      }
                    } else {
                      result = { error: "Invalid filter operation" };
                      break;
                    }
                  }

                  if (
                    typeof result === "object" &&
                    result !== null &&
                    "error" in result
                  ) {
                    // keep error
                  } else {
                    if (meta.hasOrganizationId) {
                      query = query.eq("organization_id", organizationId);
                    }

                    const orderBy = Array.isArray(args.order_by)
                      ? (args.order_by as Array<{
                          column?: string;
                          ascending?: boolean;
                        }>)
                      : [];
                    for (const order of orderBy) {
                      const column = String(order.column ?? "");
                      if (!column) continue;
                      const colError = validateColumns(meta, [column]);
                      if (colError) {
                        result = { error: colError };
                        break;
                      }
                      query = query.order(column, {
                        ascending: order.ascending ?? true,
                      });
                    }

                    if (
                      typeof result === "object" &&
                      result !== null &&
                      "error" in result
                    ) {
                      // keep error
                    } else if (!isCount) {
                      const limit = getLimit(args.limit as number | undefined);
                      const offset =
                        typeof args.offset === "number"
                          ? Math.max(0, Math.floor(args.offset))
                          : undefined;
                      if (offset !== undefined) {
                        query = query.range(offset, offset + limit - 1);
                      } else {
                        query = query.limit(limit);
                      }
                    }

                    const { data, error, count } = await query;
                    if (error) {
                      result = { error: error.message };
                    } else if (isCount) {
                      result = { count: count ?? 0 };
                    } else {
                      result = data ?? [];
                    }
                  }
                }
              }
            }
          } else if (name === "crm_insert") {
            const table = String(args.table ?? "");
            if (!INSERT_TABLES.includes(table)) {
              result = { error: "Insert table not allowed" };
            } else {
              const meta = tableMetadata[table];
              if (!meta) {
                result = { error: "Table metadata not found" };
              } else if (
                typeof args.values !== "object" ||
                args.values === null
              ) {
                result = { error: "Values must be an object" };
              } else {
                const values = { ...(args.values as Record<string, unknown>) };
                const keys = Object.keys(values);
                const columnError = validateColumns(meta, keys);
                if (columnError) {
                  result = { error: columnError };
                } else {
                  if (meta.columns.includes("organization_id")) {
                    values.organization_id = organizationId;
                  }
                  if (meta.columns.includes("user_id")) {
                    values.user_id = userData.user.id;
                  }
                  if (table === "tasks" && values.status === undefined) {
                    values.status = "Pending";
                  }
                  const title = String(values.title ?? "").trim();
                  if (!title) {
                    result = { error: "title is required" };
                  } else {
                    const { data, error } = await supabase
                      .from(table)
                      .insert(values)
                      .select("*");
                    if (error) {
                      result = { error: error.message };
                    } else {
                      result = data ?? [];
                    }
                  }
                }
              }
            }
          } else {
            result = { error: `Unknown function: ${name}` };
          }
        } catch (error) {
          result = {
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }

        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name,
                response: { content: result },
              },
            },
          ],
        });
      }

      iteration += 1;
    }

    if (!finalText) {
      finalText =
        "Desculpe, nao consegui gerar uma resposta agora. Tente novamente.";
    }

    return new Response(JSON.stringify({ response: finalText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in AI function:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
