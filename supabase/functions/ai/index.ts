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

const CRM_CONTEXT = [
  "Leads: Potenciais clientes. Campos: first_name, company, status.",
  "Deals: Negociações. Campos: title, value, stage ('Discovery', 'Proposal', 'Closed Won').",
  "Tasks: Tarefas. Campos: title, status ('pending', 'completed'), due_date.",
  "Companies: Empresas clientes. Campos: name, industry.",
  "Contacts: Pessoas vinculadas a empresas.",
].join("\n");

type GeminiPart =
  | { text: string }
  | {
      functionCall: {
        name: string;
        args?: Record<string, unknown>;
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

const tools = [
  {
    functionDeclarations: [
      {
        name: "search_leads",
        description:
          "Busca leads por nome, sobrenome ou empresa. Se query/status forem omitidos, retorna os leads mais recentes.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            status: { type: "string" },
          },
          required: [],
        },
      },
      {
        name: "search_deals",
        description:
          "Busca deals por valor mínimo e/ou estágio (Discovery, Proposal, Closed Won). Se filtros forem omitidos, retorna os deals mais recentes.",
        parameters: {
          type: "object",
          properties: {
            min_value: { type: "number" },
            stage: { type: "string" },
          },
          required: [],
        },
      },
      {
        name: "search_companies",
        description: "Busca empresas pelo nome. Se name_query for omitido, retorna as empresas mais recentes.",
        parameters: {
          type: "object",
          properties: {
            name_query: { type: "string" },
          },
          required: [],
        },
      },
      {
        name: "search_contacts",
        description: "Busca contatos por nome, email ou empresa. Se name_query for omitido, retorna os contatos mais recentes.",
        parameters: {
          type: "object",
          properties: {
            name_query: { type: "string" },
          },
          required: [],
        },
      },
      {
        name: "search_tasks",
        description:
          "Busca tarefas por status e/ou título. Se status não for informado, assume 'Pending'. Se título for omitido, retorna tarefas mais recentes.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string" },
            title_query: { type: "string" },
          },
          required: [],
        },
      },
      {
        name: "get_metrics",
        description:
          "Retorna contagem agrupada por status para leads, deals ou tasks.",
        parameters: {
          type: "object",
          properties: {
            entity: {
              type: "string",
              enum: ["leads", "deals", "tasks"],
            },
          },
          required: ["entity"],
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


function isDefinitionQuery(text: string) {
  return /(o que e|o que eh|defina|definicao|conceito|explica)/.test(text);
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function isEntityIntent(message: string, entity: string) {
  const text = message.toLowerCase();
  if (isDefinitionQuery(text)) return false;
  const terms: Record<string, string[]> = {
    leads: ["lead", "leads"],
    contacts: ["contato", "contatos", "contact", "contacts"],
    companies: ["empresa", "empresas", "company", "companies"],
    deals: ["deal", "deals", "negocio", "negocios"],
    tasks: ["task", "tasks", "tarefa", "tarefas"],
  };
  return hasAny(text, terms[entity] || []);
}

function isCountIntent(message: string) {
  const text = message.toLowerCase();
  return /(quantos|quantas|total|numero)/.test(text);
}

function isListIntent(message: string) {
  const text = message.toLowerCase();
  return /(quem|liste|lista|meus|minhas|recentes|ultimos)/.test(text);
}

function isOpenTasksIntent(message: string) {
  const text = message.toLowerCase();
  return /(em aberto|pendente|pendentes|pending|abertas|aberto)/.test(text);
}

function extractCompanyName(message: string) {
  const text = message.toLowerCase();
  const match = text.match(/empresa\s+([^?\.\\n]+)/);
  if (!match) return "";
  return match[1].replace(/\s+$/, "").trim();
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

    const systemInstruction = [
      "Voce e um agente de dados CRM autonomo. Use function calling quando precisar consultar dados.",
      "Sempre que precisar de dados do CRM, chame uma funcao apropriada.",
      "Se o usuario perguntar sobre entidades sem filtro, chame search_* com {}.",
      "Se o usuario perguntar contagens, chame get_metrics quando aplicavel ou responda com base na consulta.",
      deepSearch
        ? "Responda com mais profundidade, detalhando raciocinio e recomendacoes."
        : "Responda de forma direta e objetiva.",
      "",
      "Estrutura do CRM:",
      CRM_CONTEXT,
      "",
      "Exemplos:",
      "- Usuario: 'Quem sao meus leads?' -> call search_leads({})",
      "- Usuario: 'Leads recentes' -> call search_leads({})",
      "- Usuario: 'Quem sao meus contatos?' -> call search_contacts({})",
      "- Usuario: 'Empresas recentes' -> call search_companies({})",
      "- Usuario: 'Deals recentes' -> call search_deals({})",
      "- Usuario: 'Minhas tarefas' -> call search_tasks({})",
      "- Usuario: 'Quantos leads eu tenho?' -> call get_metrics({ entity: 'leads' })",
      "- Usuario: 'Quantas tarefas em aberto?' -> call search_tasks({ status: 'Pending' })",
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
        functionCall: { name: string; args?: Record<string, unknown> };
      }>;

      if (functionCalls.length === 0) {
        if (iteration === 0) {
          const intentOrder = ["tasks", "leads", "deals", "contacts", "companies"];
          const matched = intentOrder.find((entity) => isEntityIntent(message, entity));
          if (matched) {
            let name = "";
            let result: unknown = [];
            try {
              const countIntent = isCountIntent(message);
              if (matched === "leads") {
                name = countIntent ? "get_metrics" : "search_leads";
                if (countIntent) {
                  const { data, error } = await supabase
                    .from("leads")
                    .select("status");
                  if (error) {
                    result = { error: error.message };
                  } else {
                    const counts: Record<string, number> = {};
                    for (const row of data ?? []) {
                      const status = (row as { status?: string }).status ?? "Unknown";
                      counts[status] = (counts[status] ?? 0) + 1;
                    }
                    result = counts;
                  }
                } else {
                  const { data, error } = await supabase
                    .from("leads")
                    .select("*")
                    .limit(10)
                    .order("created_at", { ascending: false });
                  if (error) {
                    result = { error: error.message };
                  } else {
                    result = data ?? [];
                  }
                }
              } else if (matched === "deals") {
                name = countIntent ? "get_metrics" : "search_deals";
                if (countIntent) {
                  const { data, error } = await supabase
                    .from("deals")
                    .select("status");
                  if (error) {
                    result = { error: error.message };
                  } else {
                    const counts: Record<string, number> = {};
                    for (const row of data ?? []) {
                      const status = (row as { status?: string }).status ?? "Unknown";
                      counts[status] = (counts[status] ?? 0) + 1;
                    }
                    result = counts;
                  }
                } else {
                  const { data, error } = await supabase
                    .from("deals")
                    .select(
                      "id, title, value, stage, status, expected_close_date, created_at",
                    )
                    .limit(10)
                    .order("created_at", { ascending: false });
                  if (error) {
                    result = { error: error.message };
                  } else {
                    result = data ?? [];
                  }
                }
              } else if (matched === "contacts") {
                name = "search_contacts";
                if (countIntent) {
                  const { count, error } = await supabase
                    .from("contacts")
                    .select("id", { count: "exact", head: true });
                  if (error) {
                    result = { error: error.message };
                  } else {
                    result = { count: count ?? 0 };
                  }
                } else {
                  const { data, error } = await supabase
                    .from("contacts")
                    .select(
                      "id, first_name, last_name, email, company, phone, created_at",
                    )
                    .limit(10)
                    .order("created_at", { ascending: false });
                  if (error) {
                    result = { error: error.message };
                  } else {
                    result = data ?? [];
                  }
                }
              } else if (matched === "companies") {
                name = "search_companies";
                if (countIntent) {
                  const { count, error } = await supabase
                    .from("companies")
                    .select("id", { count: "exact", head: true });
                  if (error) {
                    result = { error: error.message };
                  } else {
                    result = { count: count ?? 0 };
                  }
                } else {
                  const { data, error } = await supabase
                    .from("companies")
                    .select("id, name, industry, website, created_at")
                    .limit(10)
                    .order("created_at", { ascending: false });
                  if (error) {
                    result = { error: error.message };
                  } else {
                    result = data ?? [];
                  }
                }
              } else if (matched === "tasks") {
                name = "search_tasks";
                const openOnly = isOpenTasksIntent(message);
                const companyName = extractCompanyName(message);
                let companyId = "";
                if (companyName) {
                  const { data: companies, error } = await supabase
                    .from("companies")
                    .select("id, name")
                    .ilike("name", `%${companyName}%`)
                    .order("created_at", { ascending: false })
                    .limit(1);
                  if (error) {
                    result = { error: error.message };
                  } else if (companies && companies.length > 0) {
                    companyId = companies[0].id as string;
                  } else {
                    result = { error: "Company not found" };
                  }
                }

                const hasError =
                  typeof result === "object" &&
                  result !== null &&
                  "error" in result;
                if (!hasError) {
                  let dbQuery = supabase
                    .from("tasks")
                    .select(
                      "id, title, status, due_date, created_at, company_id, contact_id, deal_id",
                    )
                    .limit(10)
                    .order("created_at", { ascending: false });
                  if (openOnly) {
                    dbQuery = dbQuery.eq("status", "Pending");
                  }
                  if (companyId) {
                    dbQuery = dbQuery.eq("company_id", companyId);
                  }
                  const { data, error } = await dbQuery;
                  if (error) {
                    result = { error: error.message };
                  } else if (countIntent) {
                    result = {
                      count: (data ?? []).length,
                      status: openOnly ? "Pending" : undefined,
                      company: companyName || undefined,
                    };
                  } else {
                    result = data ?? [];
                  }
                }
              }
            } catch (error) {
              result = {
                error: error instanceof Error ? error.message : "Unknown error",
              };
            }

            if (name) {
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
              iteration += 1;
              continue;
            }
          }
        }

        finalText = getTextFromParts(parts);
        break;
      }

      for (const call of functionCalls) {
        const name = call.functionCall.name;
        const args = call.functionCall.args ?? {};

        let result: unknown = [];

        try {
          if (name === "search_leads") {
            const query = String(args.query ?? "").trim();
            const status = args.status ? String(args.status) : undefined;
            let queryBuilder = supabase
              .from("leads")
              .select("*")
              .limit(10)
              .order("created_at", { ascending: false });

            if (query) {
              queryBuilder = queryBuilder.or(
                `first_name.ilike.%${query}%,last_name.ilike.%${query}%,company.ilike.%${query}%`,
              );
            }
            if (status) {
              queryBuilder = queryBuilder.eq("status", status);
            }

            const { data, error } = await queryBuilder;
            if (error) {
              result = { error: error.message };
            } else {
              result = data ?? [];
            }
          } else if (name === "search_deals") {
            const minValue =
              typeof args.min_value === "number"
                ? args.min_value
                : undefined;
            const stage = args.stage ? String(args.stage) : undefined;
            let dbQuery = supabase
              .from("deals")
              .select(
                "id, title, value, stage, status, expected_close_date, created_at",
              )
              .order("created_at", { ascending: false });
            if (typeof minValue === "number") {
              dbQuery = dbQuery.gte("value", minValue);
            }
            if (stage) {
              dbQuery = dbQuery.eq("stage", stage);
            }
            const { data, error } = await dbQuery.limit(20);
            if (error) {
              result = { error: error.message };
            } else {
              result = data ?? [];
            }
          } else if (name === "search_companies") {
            const nameQuery = String(args.name_query ?? "").trim();
            let dbQuery = supabase
              .from("companies")
              .select("id, name, industry, website, created_at")
              .order("created_at", { ascending: false });
            if (nameQuery) {
              dbQuery = dbQuery.ilike("name", `%${nameQuery}%`);
            }
            const { data, error } = await dbQuery.limit(20);
            if (error) {
              result = { error: error.message };
            } else {
              result = data ?? [];
            }
          } else if (name === "search_contacts") {
            const nameQuery = String(args.name_query ?? "").trim();
            let dbQuery = supabase
              .from("contacts")
              .select(
                "id, first_name, last_name, email, company, phone, created_at",
              )
              .order("created_at", { ascending: false });
            if (nameQuery) {
              dbQuery = dbQuery.or(
                `first_name.ilike.%${nameQuery}%,last_name.ilike.%${nameQuery}%,email.ilike.%${nameQuery}%,company.ilike.%${nameQuery}%`,
              );
            }
            const { data, error } = await dbQuery.limit(20);
            if (error) {
              result = { error: error.message };
            } else {
              result = data ?? [];
            }
          } else if (name === "search_tasks") {
            const status = args.status
              ? String(args.status)
              : "Pending";
            const titleQuery = args.title_query
              ? String(args.title_query)
              : undefined;
            let dbQuery = supabase
              .from("tasks")
              .select(
                "id, title, status, due_date, created_at, company_id, contact_id, deal_id",
              )
              .order("created_at", { ascending: false });
            if (status) {
              dbQuery = dbQuery.eq("status", status);
            }
            if (titleQuery) {
              dbQuery = dbQuery.ilike("title", `%${titleQuery}%`);
            }
            const { data, error } = await dbQuery.limit(20);
            if (error) {
              result = { error: error.message };
            } else {
              result = data ?? [];
            }
          } else if (name === "get_metrics") {
            const entity = String(args.entity ?? "");
            if (!["leads", "deals", "tasks"].includes(entity)) {
              result = { error: "entity must be leads, deals, or tasks" };
            } else {
              const { data, error } = await supabase
                .from(entity)
                .select("status");
              if (error) {
                result = { error: error.message };
              } else {
                const counts: Record<string, number> = {};
                for (const row of data ?? []) {
                  const status = (row as { status?: string }).status ?? "Unknown";
                  counts[status] = (counts[status] ?? 0) + 1;
                }
                result = counts;
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
        "Desculpe, não consegui gerar uma resposta agora. Tente novamente.";
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
