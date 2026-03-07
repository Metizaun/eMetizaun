import { useMemo, useState } from "react";
import { BarChart3, ExternalLink, FileText, FolderKanban, Plus, Save } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { ResearchProjectStats } from "@/features/instagram-analyzer/hooks/useInstagramProjects";

type ProjectsDriveTabProps = {
  projects: ResearchProjectStats[];
  loading: boolean;
  selectedProjectId: string | null;
  selectedItemsCount: number;
  onSelectProject: (projectId: string) => void;
  onOpenCreateDialog: () => void;
  onSaveSelection: (projectId: string) => Promise<void>;
  onGenerateAnalysis: (projectId: string) => Promise<void>;
  onUpdateDescription: (projectId: string, description: string) => Promise<void>;
};

type StatusFilter = "all" | "active" | "archived";

export function ProjectsDriveTab({
  projects,
  loading,
  selectedProjectId,
  selectedItemsCount,
  onSelectProject,
  onOpenCreateDialog,
  onSaveSelection,
  onGenerateAnalysis,
  onUpdateDescription,
}: ProjectsDriveTabProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);
  const [savingSelection, setSavingSelection] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      if (!matchesStatus) return false;

      if (!normalizedQuery) return true;
      return (
        project.name.toLowerCase().includes(normalizedQuery) ||
        project.competitor_username.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [projects, query, statusFilter]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  const currentDescription = selectedProject?.description || "";
  const descriptionValue = descriptionDraft ?? currentDescription;

  const handleSaveSelection = async () => {
    if (!selectedProjectId) return;
    setSavingSelection(true);
    try {
      await onSaveSelection(selectedProjectId);
    } finally {
      setSavingSelection(false);
    }
  };

  const handleSaveDescription = async () => {
    if (!selectedProjectId) return;
    setSavingDescription(true);
    try {
      await onUpdateDescription(selectedProjectId, descriptionValue.trim());
      setDescriptionDraft(null);
    } finally {
      setSavingDescription(false);
    }
  };

  const handleGenerateAnalysis = async () => {
    if (!selectedProjectId) return;
    setGeneratingAnalysis(true);
    try {
      await onGenerateAnalysis(selectedProjectId);
    } finally {
      setGeneratingAnalysis(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="h-full min-h-0 overflow-hidden">
        <CardHeader className="border-b pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">Projetos</CardTitle>
            <Button size="sm" onClick={onOpenCreateDialog}>
              <Plus className="mr-1 h-4 w-4" />
              Novo projeto
            </Button>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_170px]">
            <Input
              placeholder="Buscar por nome ou @concorrente"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="archived">Arquivados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <ScrollArea className="h-full">
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {loading ? (
              <div className="col-span-full rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">Carregando projetos...</p>
              </div>
            ) : null}

            {!loading && !filteredProjects.length ? (
              <div className="col-span-full rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm font-medium">Nenhum projeto encontrado</p>
                <p className="text-xs text-muted-foreground">
                  Ajuste os filtros ou crie um novo projeto com base no scrape.
                </p>
              </div>
            ) : null}

            {filteredProjects.map((project) => {
              const isSelected = project.id === selectedProjectId;

              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    onSelectProject(project.id);
                    setDescriptionDraft(null);
                  }}
                  className={`rounded-lg border p-4 text-left transition ${
                    isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium">{project.name}</p>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {project.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">@{project.competitor_username}</p>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded bg-muted/40 px-2 py-1">{project.saved_items_count} posts</span>
                    <span className="rounded bg-muted/40 px-2 py-1">{project.documents_count} arquivos</span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Atualizado em {new Date(project.updated_at).toLocaleDateString("pt-BR")}
                  </p>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </Card>

      <Card className="h-full min-h-0 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Detalhes do projeto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!selectedProject ? (
            <p className="text-xs text-muted-foreground">
              Selecione um projeto no grid para visualizar detalhes e ações rápidas.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-sm font-medium">{selectedProject.name}</p>
                <p className="text-xs text-muted-foreground">@{selectedProject.competitor_username}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border bg-muted/30 px-2 py-2">
                  <p className="text-muted-foreground">Posts salvos</p>
                  <p className="font-semibold">{selectedProject.saved_items_count}</p>
                </div>
                <div className="rounded-md border bg-muted/30 px-2 py-2">
                  <p className="text-muted-foreground">Arquivos</p>
                  <p className="font-semibold">{selectedProject.documents_count}</p>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="project-description-draft">Descrição rápida</Label>
                <Textarea
                  id="project-description-draft"
                  rows={4}
                  value={descriptionValue}
                  onChange={(event) => setDescriptionDraft(event.target.value)}
                  placeholder="Resumo do objetivo e posicionamento observado."
                />
                <Button size="sm" variant="outline" onClick={() => void handleSaveDescription()} disabled={savingDescription}>
                  <Save className="mr-1 h-4 w-4" />
                  Salvar descrição
                </Button>
              </div>

              <div className="space-y-2">
                <Button asChild size="sm" className="w-full">
                  <Link to={`/instagram-analyzer/projects/${selectedProject.id}`}>
                    <FolderKanban className="mr-1 h-4 w-4" />
                    Abrir projeto
                    <ExternalLink className="ml-auto h-4 w-4" />
                  </Link>
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => void handleGenerateAnalysis()}
                  disabled={generatingAnalysis}
                >
                  <BarChart3 className="mr-1 h-4 w-4" />
                  Gerar análise
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => void handleSaveSelection()}
                  disabled={savingSelection || selectedItemsCount <= 0}
                >
                  <FileText className="mr-1 h-4 w-4" />
                  Salvar seleção ({selectedItemsCount})
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
