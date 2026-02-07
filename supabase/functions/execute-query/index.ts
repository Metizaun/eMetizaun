import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const FORBIDDEN_KEYWORDS = [
  "DROP",
  "TRUNCATE",
  "ALTER",
  "GRANT",
  "REVOKE",
  "DELETE",
  "EXEC",
  "EXECUTE",
];

const ALLOWED_WRITE_TABLES = ["leads", "deals", "tasks", "notes"];

function sanitizeQuery(rawQuery: string): { query?: string; errorCode?: string } {
  let query = rawQuery.trim();
  query = query.replace(/\[AUTO_EXECUTE\]/gi, "").trim();

  const fencedSql = query.match(/```sql\s*([\s\S]*?)```/i);
  if (fencedSql?.[1]) {
    query = fencedSql[1].trim();
  } else {
    const fencedAny = query.match(/```\s*([\s\S]*?)```/);
    if (fencedAny?.[1]) {
      query = fencedAny[1].trim();
    }
  }

  query = query.replace(/^sql\s*/i, "").trim();

  const firstSqlKeywordIndex = query.search(/\b(SELECT|WITH|INSERT\s+INTO|UPDATE)\b/i);
  if (firstSqlKeywordIndex > 0) {
    query = query.slice(firstSqlKeywordIndex).trim();
  }

  query = query.replace(/;\s*$/g, "").trim();

  if (!query) {
    return { errorCode: "missing_query" };
  }

  if (query.includes(";")) {
    return { errorCode: "multi_statement_not_allowed" };
  }

  return { query };
}

function validateQuery(query: string): { valid: boolean; errorCode?: string } {
  const upper = query.toUpperCase().trim();

  if (query.includes(";")) {
    return { valid: false, errorCode: "multi_statement_not_allowed" };
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(upper)) {
      return { valid: false, errorCode: "forbidden_operation" };
    }
  }

  if (upper.startsWith("WITH")) {
    if (upper.includes(" INSERT ") || upper.match(/\bINSERT\b/i)) {
      return validateWriteTarget(upper);
    }
    if (upper.includes(" UPDATE ") || upper.match(/\bUPDATE\b/i)) {
      return validateWriteTarget(upper);
    }
    return { valid: true };
  }

  if (upper.startsWith("SELECT")) {
    return { valid: true };
  }

  if (upper.startsWith("INSERT") || upper.startsWith("UPDATE")) {
    return validateWriteTarget(upper);
  }

  return { valid: false, errorCode: "operation_not_allowed" };
}

function validateWriteTarget(upper: string) {
    const matchSchema = upper.match(/\b(INSERT\s+INTO|UPDATE)\s+\"?([A-Z0-9_]+)\"?\.\"?([A-Z0-9_]+)\"?/i);
    const matchSimple = upper.match(/\b(INSERT\s+INTO|UPDATE)\s+\"?([A-Z0-9_]+)\"?/i);
    const table = matchSchema?.[3] || matchSimple?.[2];

    if (table && ALLOWED_WRITE_TABLES.includes(table.toLowerCase())) {
      return { valid: true };
    }

    return { valid: false, errorCode: "write_not_allowed" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query: rawQuery } = await req.json();
    console.log("[execute-query] request", {
      hasQuery: typeof rawQuery === "string",
      queryPreview: typeof rawQuery === "string" ? rawQuery.slice(0, 180) : null,
      hasAuthorization: Boolean(req.headers.get("Authorization")),
      hasApiKeyHeader: Boolean(req.headers.get("apikey")),
    });

    if (!rawQuery || typeof rawQuery !== "string") {
      return new Response(JSON.stringify({ success: false, code: "missing_query" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitized = sanitizeQuery(rawQuery);
    if (!sanitized.query) {
      return new Response(
        JSON.stringify({ success: false, code: sanitized.errorCode || "validation_failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const query = sanitized.query;
    console.log("[execute-query] normalized_query", {
      queryPreview: query.slice(0, 180),
    });

    const validation = validateQuery(query);
    console.log("[execute-query] validation", validation);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ success: false, code: validation.errorCode || "validation_failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ success: false, code: "supabase_env_missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ success: false, code: "not_authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("organization_id")
      .eq("user_id", userData.user.id)
      .limit(1);

    if (!roles?.length) {
      return new Response(JSON.stringify({ success: false, code: "forbidden_operation" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase.rpc("execute_safe_query", {
      query_text: query,
    });

    if (error) {
      console.error("execute_safe_query error:", error);
      const message = String(error.message || "");
      let code = error.code || "query_failed";
      if (message.includes("write_not_allowed")) code = "write_not_allowed";
      if (message.includes("forbidden_operation")) code = "forbidden_operation";
      if (message.includes("operation_not_allowed")) code = "operation_not_allowed";
      if (message.includes("multi_statement_not_allowed")) code = "multi_statement_not_allowed";

      return new Response(
        JSON.stringify({
          success: false,
          code,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[execute-query] rpc_success", {
      operation: data?.operation ?? null,
      rowCount: data?.rowCount ?? null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data,
        rowCount: data?.rowCount ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Execute query error:", error);
    return new Response(JSON.stringify({ success: false, code: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
