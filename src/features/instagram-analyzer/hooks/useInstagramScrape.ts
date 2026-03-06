import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/hooks/useOrganizationContext";

import type {
  InstagramScrapeFilters,
  InstagramScrapeStartResult,
  InstagramScrapeStatusResult,
  ResearchScrapeItem,
  ResearchScrapeJob,
} from "@/features/instagram-analyzer/types";
import { DEFAULT_INSTAGRAM_FILTERS } from "@/features/instagram-analyzer/types";

export function useInstagramScrape() {
  const { currentOrganization } = useOrganizationContext();

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ResearchScrapeJob | null>(null);
  const [items, setItems] = useState<ResearchScrapeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncedJobsRef = useRef(new Set<string>());

  const isRunning = useMemo(() => job?.status === "queued" || job?.status === "running", [job?.status]);

  const fetchStatus = useCallback(
    async (jobId?: string) => {
      const targetJobId = jobId || activeJobId;
      if (!targetJobId) {
        return null;
      }

      const { data, error: invokeError } = await supabase.functions.invoke<InstagramScrapeStatusResult>(
        "instagram-scrape-status",
        {
          body: {
            jobId: targetJobId,
          },
        },
      );

      if (invokeError) {
        throw invokeError;
      }

      if (!data?.job) {
        throw new Error("Invalid scrape status payload");
      }

      setJob(data.job);
      setItems(data.items || []);
      setError(null);
      return data;
    },
    [activeJobId],
  );

  const syncJob = useCallback(
    async (jobId?: string) => {
      const targetJobId = jobId || activeJobId;
      if (!targetJobId) return;

      setSyncing(true);
      try {
        const { error: invokeError } = await supabase.functions.invoke("instagram-scrape-sync", {
          body: { jobId: targetJobId },
        });

        if (invokeError) {
          throw invokeError;
        }

        await fetchStatus(targetJobId);
      } finally {
        setSyncing(false);
      }
    },
    [activeJobId, fetchStatus],
  );

  const startScrape = useCallback(
    async (profileUsername: string, filters?: Partial<InstagramScrapeFilters>) => {
      if (!currentOrganization?.id) {
        throw new Error("Organization not selected");
      }

      setLoading(true);
      setError(null);

      try {
        const mergedFilters = {
          ...DEFAULT_INSTAGRAM_FILTERS,
          ...filters,
        };

        const { data, error: invokeError } = await supabase.functions.invoke<InstagramScrapeStartResult>(
          "instagram-scrape-start",
          {
            body: {
              profileUsername,
              organizationId: currentOrganization.id,
              filters: mergedFilters,
            },
          },
        );

        if (invokeError) {
          throw invokeError;
        }

        if (!data?.jobId) {
          throw new Error("Invalid scrape start payload");
        }

        setActiveJobId(data.jobId);
        syncedJobsRef.current.delete(data.jobId);
        await fetchStatus(data.jobId);
        return data;
      } catch (startError) {
        const message = startError instanceof Error ? startError.message : "Failed to start scrape";
        setError(message);
        throw startError;
      } finally {
        setLoading(false);
      }
    },
    [currentOrganization?.id, fetchStatus],
  );

  const clearScrape = useCallback(() => {
    setActiveJobId(null);
    setJob(null);
    setItems([]);
    setError(null);
  }, []);

  useEffect(() => {
    if (!activeJobId) {
      return;
    }

    if (!isRunning) {
      return;
    }

    const interval = window.setInterval(() => {
      void fetchStatus(activeJobId);
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeJobId, fetchStatus, isRunning]);

  useEffect(() => {
    if (!job?.id) {
      return;
    }

    if (job.status !== "succeeded") {
      return;
    }

    if (items.length > 0) {
      return;
    }

    if (syncedJobsRef.current.has(job.id)) {
      return;
    }

    syncedJobsRef.current.add(job.id);
    void syncJob(job.id);
  }, [items.length, job?.id, job?.status, syncJob]);

  return {
    activeJobId,
    job,
    items,
    loading,
    syncing,
    isRunning,
    error,
    startScrape,
    syncJob,
    fetchStatus,
    clearScrape,
    setActiveJobId,
  };
}

