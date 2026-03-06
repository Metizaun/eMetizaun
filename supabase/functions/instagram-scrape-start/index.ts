import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import {
  corsHeaders,
  ensureOrgAccess,
  getAuthContext,
  HttpError,
  jsonResponse,
  mapApifyStatus,
  sanitizeInstagramUsername,
} from "../_shared/research.ts";

type ScrapeStartPayload = {
  profileUsername?: string;
  organizationId?: string;
  filters?: {
    postsLimit?: number;
    sortBy?: "most_liked" | "most_viewed" | "recent";
    includeComments?: boolean;
    includeCaptions?: boolean;
  };
};

const APIFY_ACTOR_PATH = "apify~instagram-scraper";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as ScrapeStartPayload;
    const rawUsername = typeof body.profileUsername === "string" ? body.profileUsername : "";
    const profileUsername = sanitizeInstagramUsername(rawUsername);

    if (!profileUsername) {
      throw new HttpError(400, "profileUsername is required");
    }

    const postsLimit = Math.min(50, Math.max(1, Number(body.filters?.postsLimit || 24)));
    const sortBy = body.filters?.sortBy || "recent";
    const includeComments = Boolean(body.filters?.includeComments);
    const includeCaptions = body.filters?.includeCaptions !== false;

    const auth = await getAuthContext(req);
    const organizationId = body.organizationId || auth.defaultOrganizationId;
    ensureOrgAccess(auth.organizationIds, organizationId);

    const apifyToken = Deno.env.get("APIFY_TOKEN");
    if (!apifyToken) {
      throw new HttpError(500, "APIFY_TOKEN is not configured");
    }

    const actorInput = {
      directUrls: [`https://www.instagram.com/${profileUsername}/`],
      resultsType: "posts",
      resultsLimit: postsLimit,
      addParentData: false,
    };

    const apifyResponse = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_ACTOR_PATH}/runs?token=${apifyToken}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(actorInput),
      },
    );

    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();
      throw new HttpError(502, `Failed to start Apify run: ${errorText}`);
    }

    const apifyData = await apifyResponse.json();
    const apifyRunId = apifyData?.data?.id as string | undefined;
    const apifyStatus = mapApifyStatus(apifyData?.data?.status as string | undefined);

    if (!apifyRunId) {
      throw new HttpError(502, "Apify did not return a run id");
    }

    const filters = {
      postsLimit,
      sortBy,
      includeComments,
      includeCaptions,
    };

    const { data: createdJob, error: insertError } = await auth.supabaseAdmin
      .schema("research")
      .from("scrape_jobs")
      .insert({
        organization_id: organizationId,
        created_by_user_id: auth.userId,
        profile_username: profileUsername,
        apify_run_id: apifyRunId,
        status: apifyStatus,
        filters,
      })
      .select("id, status, apify_run_id")
      .single();

    if (insertError || !createdJob) {
      throw new HttpError(500, insertError?.message || "Failed to create scrape job");
    }

    return jsonResponse(200, {
      jobId: createdJob.id,
      status: createdJob.status,
      apifyRunId: createdJob.apify_run_id,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(error.status, { error: error.message });
    }

    const message = error instanceof Error ? error.message : "internal_error";
    return jsonResponse(500, { error: message });
  }
});

