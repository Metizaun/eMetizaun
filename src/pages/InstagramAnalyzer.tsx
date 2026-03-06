import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Instagram, MessageSquare } from "lucide-react";
import { Link, NavLink } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

import { ScrapeFiltersPanel } from "@/features/instagram-analyzer/components/ScrapeFiltersPanel";
import { ScrapeResultsGrid } from "@/features/instagram-analyzer/components/ScrapeResultsGrid";
import { InstagramAIFab } from "@/features/instagram-analyzer/components/InstagramAIFab";
import { CreateProjectFromScrapeDialog } from "@/features/instagram-analyzer/components/CreateProjectFromScrapeDialog";
import { ProjectsDriveTab } from "@/features/instagram-analyzer/components/ProjectsDriveTab";
import { useInstagramScrape } from "@/features/instagram-analyzer/hooks/useInstagramScrape";
import {
  useInstagramProjects,
  type ResearchProjectStats,
} from "@/features/instagram-analyzer/hooks/useInstagramProjects";
import { useInstagramInsights } from "@/features/instagram-analyzer/hooks/useInstagramInsights";
import {
  DEFAULT_INSTAGRAM_FILTERS,
  type InstagramScrapeFilters,
} from "@/features/instagram-analyzer/types";

function normalizeInstagramUsername(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/$/, "")
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();
}

export default function InstagramAnalyzer() {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"scrap" | "projects">("scrap");
  const [profileUsername, setProfileUsername] = useState("");
  const [filters, setFilters] = useState<InstagramScrapeFilters>(DEFAULT_INSTAGRAM_FILTERS);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectStats, setProjectStats] = useState<ResearchProjectStats[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  const {
    job,
    items,
    loading: scrapeLoading,
    syncing,
    error: scrapeError,
    startScrape,
    fetchStatus,
  } = useInstagramScrape();

  const {
    projects,
    loading: projectsLoading,
    createProject,
    updateProject,
    saveItemsToProject,
    fetchProjectsWithStats,
  } = useInstagramProjects();
  const { generateInsights } = useInstagramInsights();

  const selectedItemsCount = selectedItemIds.size;
  const selectedItemArray = useMemo(() => Array.from(selectedItemIds), [selectedItemIds]);

  const scrapeCompetitorUsername = useMemo(() => {
    const fromJob = normalizeInstagramUsername(job?.profile_username || "");
    if (fromJob) return fromJob;
    return normalizeInstagramUsername(profileUsername);
  }, [job?.profile_username, profileUsername]);

  const hasScrapeContext = Boolean(scrapeCompetitorUsername) && items.length > 0;

  const loadProjectStats = useCallback(async () => {
    try {
      const stats = await fetchProjectsWithStats();
      setProjectStats(stats);
    } catch (error) {
      toast({
        title: "Falha ao carregar projetos",
        description: error instanceof Error ? error.message : "Nao foi possivel carregar estatisticas de projetos.",
        variant: "destructive",
      });
    }
  }, [fetchProjectsWithStats, toast]);

  useEffect(() => {
    void loadProjectStats();
  }, [loadProjectStats, projects.length]);

  useEffect(() => {
    if (!selectedProjectId && projectStats.length) {
      setSelectedProjectId(projectStats[0].id);
    }
  }, [projectStats, selectedProjectId]);

  useEffect(() => {
    if (!scrapeError) {
      return;
    }

    toast({
      title: "Erro no scrape",
      description: scrapeError,
      variant: "destructive",
    });
  }, [scrapeError, toast]);

  const handleStartScrape = async () => {
    try {
      setSelectedItemIds(new Set());
      await startScrape(profileUsername, filters);
      toast({
        title: "Scrape iniciado",
        description: "A coleta foi enviada para o Apify. Acompanhe o status no painel.",
      });
    } catch (error) {
      toast({
        title: "Falha ao iniciar scrape",
        description: error instanceof Error ? error.message : "Nao foi possivel iniciar a coleta.",
        variant: "destructive",
      });
    }
  };

  const handleRefreshStatus = async () => {
    if (!job?.id) {
      return;
    }

    try {
      await fetchStatus(job.id);
    } catch (error) {
      toast({
        title: "Falha ao atualizar status",
        description: error instanceof Error ? error.message : "Nao foi possivel atualizar o status.",
        variant: "destructive",
      });
    }
  };

  const handleToggleSelection = (itemId: string, selected: boolean) => {
    setSelectedItemIds((previous) => {
      const next = new Set(previous);
      if (selected) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  };

  const handleCreateProjectFromScrape = async (projectName: string) => {
    if (!hasScrapeContext) {
      throw new Error("Scrape context not found");
    }

    setCreatingProject(true);
    try {
      const created = await createProject({
        name: projectName,
        competitorUsername: scrapeCompetitorUsername,
      });

      const fallbackAllIds = items.map((item) => item.id);
      const idsToSave = selectedItemArray.length ? selectedItemArray : fallbackAllIds;

      if (!idsToSave.length) {
        throw new Error("Nenhum item disponível para salvar no projeto.");
      }

      await saveItemsToProject(created.id, idsToSave);
      await loadProjectStats();

      setSelectedProjectId(created.id);
      setSelectedItemIds(new Set());
      setCreateDialogOpen(false);
      setActiveTab("projects");

      toast({
        title: "Projeto criado",
        description: `${idsToSave.length} item(ns) foram salvos automaticamente no projeto.`,
      });
    } catch (error) {
      toast({
        title: "Falha ao criar projeto",
        description: error instanceof Error ? error.message : "Nao foi possivel criar o projeto.",
        variant: "destructive",
      });
    } finally {
      setCreatingProject(false);
    }
  };

  const handleSaveSelectionToProject = async (projectId: string) => {
    if (!projectId) return;

    if (!selectedItemArray.length) {
      toast({
        title: "Nenhum item selecionado",
        description: "Selecione posts no Scrap antes de salvar no projeto.",
        variant: "destructive",
      });
      return;
    }

    try {
      await saveItemsToProject(projectId, selectedItemArray);
      setSelectedItemIds(new Set());
      await loadProjectStats();
      toast({
        title: "Seleção salva",
        description: `${selectedItemArray.length} item(ns) adicionados ao projeto.`,
      });
    } catch (error) {
      toast({
        title: "Falha ao salvar seleção",
        description: error instanceof Error ? error.message : "Nao foi possivel salvar os itens.",
        variant: "destructive",
      });
    }
  };

  const handleGenerateAnalysis = async (projectId: string) => {
    try {
      await generateInsights({
        projectId,
        focus: "posicionamento",
      });
      await loadProjectStats();
      toast({
        title: "Análise gerada",
        description: "Documento de análise posicional criado no projeto.",
      });
    } catch (error) {
      toast({
        title: "Falha ao gerar análise",
        description: error instanceof Error ? error.message : "Nao foi possivel gerar análise.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateProjectDescription = async (projectId: string, description: string) => {
    try {
      await updateProject(projectId, { description: description || null });
      await loadProjectStats();
      toast({
        title: "Descrição atualizada",
        description: "A descrição rápida do projeto foi salva.",
      });
    } catch (error) {
      toast({
        title: "Falha ao salvar descrição",
        description: error instanceof Error ? error.message : "Nao foi possivel atualizar o projeto.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Instagram className="h-5 w-5" />
            Instagram Analyzer
          </h1>
          <p className="text-xs text-muted-foreground">
            Analise competitiva com scrape via Apify e gestão de projetos no estilo Drive.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={job?.status === "failed" ? "destructive" : "secondary"}>{job?.status || "idle"}</Badge>
          <Button asChild size="sm" variant="outline">
            <NavLink to="/instagram-analyzer/chat">
              <MessageSquare className="mr-1 h-4 w-4" />
              Chat
            </NavLink>
          </Button>
          <Button asChild size="sm">
            <Link to="/create">
              <Bot className="mr-1 h-4 w-4" />
              Criar conteúdo
            </Link>
          </Button>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "scrap" | "projects")}
        className="flex h-full min-h-0 flex-col gap-4"
      >
        <TabsList className="w-fit">
          <TabsTrigger value="scrap">Scrap</TabsTrigger>
          <TabsTrigger value="projects">Projetos</TabsTrigger>
        </TabsList>

        <TabsContent value="scrap" className="h-full min-h-0">
          <div className="h-full min-h-0 overflow-hidden rounded-lg border bg-background">
            <ResizablePanelGroup direction="horizontal" className="h-full min-h-0 w-full">
              <ResizablePanel defaultSize={22} minSize={18}>
                <ScrapeFiltersPanel
                  profileUsername={profileUsername}
                  filters={filters}
                  loading={scrapeLoading}
                  syncing={syncing}
                  job={job}
                  onProfileUsernameChange={setProfileUsername}
                  onFiltersChange={(updates) => setFilters((current) => ({ ...current, ...updates }))}
                  onStartScrape={handleStartScrape}
                  onRefreshStatus={handleRefreshStatus}
                />
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel defaultSize={78} minSize={40}>
                <div className="relative h-full min-h-0">
                  <ScrapeResultsGrid
                    items={items}
                    loading={scrapeLoading || syncing}
                    selectedIds={selectedItemIds}
                    onToggleSelection={handleToggleSelection}
                  />
                  <InstagramAIFab
                    visible={items.length > 0}
                    disabled={!hasScrapeContext}
                    onClick={() => setCreateDialogOpen(true)}
                  />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </TabsContent>

        <TabsContent value="projects" className="h-full min-h-0">
          <ProjectsDriveTab
            projects={projectStats}
            loading={projectsLoading}
            selectedProjectId={selectedProjectId}
            selectedItemsCount={selectedItemsCount}
            onSelectProject={setSelectedProjectId}
            onOpenCreateDialog={() => setCreateDialogOpen(true)}
            onSaveSelection={handleSaveSelectionToProject}
            onGenerateAnalysis={handleGenerateAnalysis}
            onUpdateDescription={handleUpdateProjectDescription}
          />
        </TabsContent>
      </Tabs>

      <CreateProjectFromScrapeDialog
        open={createDialogOpen}
        saving={creatingProject}
        hasScrapeContext={hasScrapeContext}
        competitorUsername={scrapeCompetitorUsername || null}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateProjectFromScrape}
      />
    </div>
  );
}
