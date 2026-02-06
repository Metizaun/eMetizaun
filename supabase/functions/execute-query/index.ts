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
    const { query } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ success: false, code: "missing_query" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validation = validateQuery(query);
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
