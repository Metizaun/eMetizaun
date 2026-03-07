import { Loader2, RefreshCw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { InstagramScrapeFilters, ResearchScrapeJob } from "@/features/instagram-analyzer/types";

type ScrapeFiltersPanelProps = {
  profileUsername: string;
  filters: InstagramScrapeFilters;
  loading: boolean;
  syncing: boolean;
  job: ResearchScrapeJob | null;
  onProfileUsernameChange: (value: string) => void;
  onFiltersChange: (updates: Partial<InstagramScrapeFilters>) => void;
  onStartScrape: () => Promise<void>;
  onRefreshStatus: () => Promise<void>;
};

export function ScrapeFiltersPanel({
  profileUsername,
  filters,
  loading,
  syncing,
  job,
  onProfileUsernameChange,
  onFiltersChange,
  onStartScrape,
  onRefreshStatus,
}: ScrapeFiltersPanelProps) {
  const isBusy = loading || syncing;

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-card">
      <Card className="h-full rounded-none border-0 shadow-none">
        <CardContent className="space-y-5 pt-4">
          <div className="space-y-2">
            <Label htmlFor="instagram-profile">Perfil</Label>
            <Input
              id="instagram-profile"
              placeholder="@concorrente ou URL"
              value={profileUsername}
              onChange={(event) => onProfileUsernameChange(event.target.value)}
              disabled={isBusy}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="posts-limit">Quantas postagens trazer</Label>
            <Input
              id="posts-limit"
              type="number"
              min={1}
              max={50}
              value={filters.postsLimit}
              onChange={(event) =>
                onFiltersChange({
                  postsLimit: Number(event.target.value || 24),
                })
              }
              disabled={isBusy}
            />
          </div>

          <div className="space-y-2">
            <Label>Ordenacao</Label>
            <Select
              value={filters.sortBy}
              onValueChange={(value) =>
                onFiltersChange({
                  sortBy: value as InstagramScrapeFilters["sortBy"],
                })
              }
              disabled={isBusy}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Mais recentes</SelectItem>
                <SelectItem value="most_liked">Trazer mais curtidos</SelectItem>
                <SelectItem value="most_viewed">Trazer mais vistos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="include-comments" className="text-sm">
                Box para comentarios
              </Label>
              <Checkbox
                id="include-comments"
                checked={filters.includeComments}
                onCheckedChange={(checked) =>
                  onFiltersChange({
                    includeComments: Boolean(checked),
                  })
                }
                disabled={isBusy}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="include-captions" className="text-sm">
                Box para legendas
              </Label>
              <Checkbox
                id="include-captions"
                checked={filters.includeCaptions}
                onCheckedChange={(checked) =>
                  onFiltersChange({
                    includeCaptions: Boolean(checked),
                  })
                }
                disabled={isBusy}
              />
            </div>
          </div>

          <Button
            className="w-full"
            onClick={() => {
              void onStartScrape();
            }}
            disabled={!profileUsername.trim() || isBusy}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Iniciar scrape
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              void onRefreshStatus();
            }}
            disabled={!job?.id || isBusy}
          >
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar status
          </Button>

          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Status do job</p>
              <Badge variant={job?.status === "failed" ? "destructive" : "secondary"}>
                {job?.status || "idle"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {job ? `Run ${job.apify_run_id}` : "Nenhum scrape iniciado nesta sessao."}
            </p>
            {job?.result_count ? (
              <p className="text-xs text-muted-foreground">{job.result_count} itens processados</p>
            ) : null}
            {job?.error ? <p className="text-xs text-destructive">{job.error}</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
