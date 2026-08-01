import { useEffect, useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  Activity,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  FileText,
  GraduationCap,
  Link as LinkIcon,
  Maximize2,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Users2,
  X,
  Youtube,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MAPS } from "@/types/match";
import { useUserRole } from "@/hooks/useUserRole";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Json } from "@/integrations/supabase/types";

type ContentCategory = "playbook" | "class" | "routine";

type ContentItem = {
  id: string;
  category: ContentCategory;
  assigned_user_ids: string[];
  map: string | null;
  title: string;
  url: string | null;
  description: string;
  content_type: string | null;
  questions: Json;
  requires_file: boolean;
  requires_response: boolean;
  routine_group: string | null;
  source_format: string;
  status: "draft" | "ready" | "archived";
  created_at: string;
};

type ContentResponse = {
  id: string;
  content_item_id: string;
  user_id: string;
  response_text: string;
  attachment_url: string | null;
  completed: boolean;
};

type ContentComment = {
  id: string;
  content_item_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type FormState = {
  category: ContentCategory;
  map: string;
  title: string;
  url: string;
  description: string;
  content_type: string;
  assigned_user_ids: string[];
  questionsText: string;
  requires_file: boolean;
  requires_response: boolean;
  routine_group: string;
  source_format: string;
  status: "draft" | "ready" | "archived";
};

const EMPTY_FORM: FormState = {
  category: "playbook",
  map: "Nuke",
  title: "",
  url: "",
  description: "",
  content_type: "guia-playbook",
  assigned_user_ids: [],
  questionsText: "",
  requires_file: false,
  requires_response: false,
  routine_group: "general",
  source_format: "link",
  status: "draft",
};

const CLASS_TYPES = [
  { value: "tacticas", label: "Tácticas por mapa" },
  { value: "clases", label: "Clases" },
  { value: "demo-retake", label: "Correcciones demo" },
  { value: "tactica-equipo", label: "Correcciones táctica por equipo" },
  { value: "nuevo-contenido", label: "Nuevos contenidos" },
];

const ROUTINE_GROUPS = [
  { value: "rifle", label: "Rutina Rifle" },
  { value: "ray", label: "Rutina Ray" },
  { value: "general", label: "Rutina demás jugadores" },
];

const STATUS_LABEL: Record<ContentItem["status"], string> = {
  draft: "Draft",
  ready: "Ready",
  archived: "Archivado",
};

const SOURCE_FORMATS = [
  { value: "link", label: "Google Doc / Link" },
  { value: "sheet", label: "Excel / Google Sheets" },
  { value: "pdf", label: "PDF" },
  { value: "youtube", label: "Video de YouTube" },
] as const;

const MEDIA_LABEL: Record<string, string> = {
  link: "Doc/Link",
  doc: "Doc",
  sheet: "Sheets",
  pdf: "PDF",
  youtube: "YouTube",
};

export default function Contenidos() {
  const { user } = useAuth();
  const { isAdmin, isCoach } = useUserRole();
  const { members } = useTeamMembers();
  const canManage = isAdmin || isCoach;
  const [items, setItems] = useState<ContentItem[]>([]);
  const [responses, setResponses] = useState<ContentResponse[]>([]);
  const [comments, setComments] = useState<ContentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [activeSection, setActiveSection] = useState<"playbooks" | "classes" | "routines">("playbooks");
  const [selectedPlaybookMap, setSelectedPlaybookMap] = useState<string>(MAPS[0]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);
  const [playbookFullscreen, setPlaybookFullscreen] = useState(false);
  const [selectedRoutineGroup, setSelectedRoutineGroup] = useState<string>(ROUTINE_GROUPS[0].value);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [routineFullscreen, setRoutineFullscreen] = useState(false);
  const [classTypeFilter, setClassTypeFilter] = useState<string>("all");
  const [classMapFilter, setClassMapFilter] = useState<string>("all");

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("content_items")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("No se pudieron cargar contenidos");
      setItems([]);
    } else {
      setItems((data as ContentItem[]) ?? []);
      const ids = ((data as ContentItem[]) ?? []).map((item) => item.id);
      if (ids.length > 0) {
        const [{ data: responseRows }, { data: commentRows }] = await Promise.all([
          supabase.from("content_responses").select("*").in("content_item_id", ids),
          supabase.from("content_comments").select("*").in("content_item_id", ids).order("created_at", { ascending: true }),
        ]);
        setResponses((responseRows as ContentResponse[]) ?? []);
        setComments((commentRows as ContentComment[]) ?? []);
      } else {
        setResponses([]);
        setComments([]);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const byCategory = useMemo(() => ({
    playbook: items.filter((item) => item.category === "playbook"),
    class: items.filter((item) => item.category === "class"),
    routine: items.filter((item) => item.category === "routine"),
  }), [items]);

  const playbooksForMap = useMemo(
    () => byCategory.playbook.filter((item) => item.map === selectedPlaybookMap),
    [byCategory.playbook, selectedPlaybookMap],
  );

  const selectedPlaybook = useMemo(() => {
    if (playbooksForMap.length === 0) return null;
    return playbooksForMap.find((item) => item.id === selectedPlaybookId) ?? playbooksForMap[0];
  }, [playbooksForMap, selectedPlaybookId]);

  useEffect(() => {
    if (!playbooksForMap.some((item) => item.id === selectedPlaybookId)) {
      setSelectedPlaybookId(playbooksForMap[0]?.id ?? null);
    }
  }, [playbooksForMap, selectedPlaybookId]);

  const routinesForGroup = useMemo(
    () => byCategory.routine.filter((item) => (item.routine_group ?? "general") === selectedRoutineGroup),
    [byCategory.routine, selectedRoutineGroup],
  );

  const selectedRoutine = useMemo(() => {
    if (routinesForGroup.length === 0) return null;
    return routinesForGroup.find((item) => item.id === selectedRoutineId) ?? routinesForGroup[0];
  }, [routinesForGroup, selectedRoutineId]);

  useEffect(() => {
    if (!routinesForGroup.some((item) => item.id === selectedRoutineId)) {
      setSelectedRoutineId(routinesForGroup[0]?.id ?? null);
    }
  }, [routinesForGroup, selectedRoutineId]);

  const mapStats = useMemo(() => MAPS.map((map) => {
    const mapItems = items.filter((item) => item.map === map);
    return {
      map,
      total: mapItems.length,
      playbooks: mapItems.filter((item) => item.category === "playbook").length,
      classes: mapItems.filter((item) => item.category === "class").length,
      routines: mapItems.filter((item) => item.category === "routine").length,
    };
  }), [items]);

  const filteredClasses = useMemo(() => {
    return byCategory.class.filter((item) => {
      const typeOk = classTypeFilter === "all" || item.content_type === classTypeFilter;
      const mapOk =
        classMapFilter === "all"
        || (classMapFilter === "general" && (!item.map || item.map === "general"))
        || item.map === classMapFilter;
      return typeOk && mapOk;
    });
  }, [byCategory.class, classTypeFilter, classMapFilter]);

  const maxMapItems = Math.max(1, ...mapStats.map((stat) => stat.total));

  const openNew = (category: ContentCategory, map?: string) => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      category,
      map: map ?? (category === "routine" ? "general" : "Nuke"),
      content_type: category === "class" ? "tacticas" : category === "routine" ? "rutina" : "guia-playbook",
      source_format: category === "routine" ? "sheet" : "link",
      requires_response: category !== "playbook",
      routine_group: category === "routine" ? selectedRoutineGroup : "general",
    });
    setOpen(true);
  };

  const openEdit = (item: ContentItem) => {
    setEditing(item);
    setForm({
      category: item.category,
      map: item.map ?? "general",
      title: item.title,
      url: item.url ?? "",
      description: item.description,
      content_type: item.content_type ?? "",
      assigned_user_ids: item.assigned_user_ids ?? [],
      questionsText: questionsToText(item.questions),
      requires_file: item.requires_file,
      requires_response: item.requires_response,
      routine_group: item.routine_group ?? "general",
      source_format: item.source_format ?? "link",
      status: item.status,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("Poné un título");
      return;
    }
    const payload = {
      category: form.category,
      map: form.map === "general" ? null : form.map,
      title: form.title.trim(),
      url: normalizeUrl(form.url),
      description: form.description.trim(),
      content_type: form.content_type || null,
      assigned_user_ids: form.assigned_user_ids,
      questions: textToQuestions(form.questionsText) as Json,
      requires_file: form.requires_file,
      requires_response: form.requires_response,
      routine_group: form.routine_group || null,
      source_format: form.source_format || "link",
      status: form.status,
    };
    const result = editing
      ? await supabase.from("content_items").update(payload).eq("id", editing.id).select("id").single()
      : await supabase.from("content_items").insert(payload).select("id").single();
    const { data, error } = result;
    if (error) {
      toast.error("No se pudo guardar", { description: error.message });
      return;
    }
    if ((form.requires_response || form.requires_file) && form.assigned_user_ids.length > 0 && data?.id) {
      await ensureAssignedResponses(data.id, form.assigned_user_ids);
    }
    toast.success(editing ? "Contenido actualizado" : "Contenido agregado");
    setOpen(false);
    fetchItems();
  };

  const remove = async (item: ContentItem) => {
    if (!confirm(`¿Eliminar "${item.title}"?`)) return;
    const { error } = await supabase.from("content_items").delete().eq("id", item.id);
    if (error) toast.error("No se pudo eliminar");
    else {
      toast.success("Contenido eliminado");
      fetchItems();
    }
  };

  const ensureAssignedResponses = async (contentItemId: string, userIds: string[]) => {
    const rows = userIds.map((userId) => ({
      content_item_id: contentItemId,
      user_id: userId,
    }));
    await supabase.from("content_responses").upsert(rows, { onConflict: "content_item_id,user_id" });
  };

  const saveResponse = async (item: ContentItem, responseText: string, attachmentUrl: string) => {
    if (!user) return;
    const { error } = await supabase.from("content_responses").upsert(
      {
        content_item_id: item.id,
        user_id: user.id,
        response_text: responseText.trim(),
        attachment_url: normalizeUrl(attachmentUrl),
        completed: true,
      },
      { onConflict: "content_item_id,user_id" },
    );
    if (error) toast.error("No se pudo guardar respuesta", { description: error.message });
    else {
      toast.success("Respuesta enviada");
      fetchItems();
    }
  };

  const saveComment = async (item: ContentItem, body: string) => {
    if (!user) return;
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error("Escribí un comentario");
      return;
    }
    const { error } = await supabase.from("content_comments").insert({
      content_item_id: item.id,
      user_id: user.id,
      body: trimmed,
    });
    if (error) toast.error("No se pudo guardar el comentario", { description: error.message });
    else {
      toast.success("Comentario publicado");
      fetchItems();
    }
  };

  const deleteComment = async (comment: ContentComment) => {
    const { error } = await supabase.from("content_comments").delete().eq("id", comment.id);
    if (error) toast.error("No se pudo borrar el comentario", { description: error.message });
    else {
      toast.success("Comentario eliminado");
      fetchItems();
    }
  };

  const responsesByItem = useMemo(() => {
    const map = new Map<string, ContentResponse[]>();
    for (const response of responses) {
      const arr = map.get(response.content_item_id) ?? [];
      arr.push(response);
      map.set(response.content_item_id, arr);
    }
    return map;
  }, [responses]);

  const commentsByItem = useMemo(() => {
    const map = new Map<string, ContentComment[]>();
    for (const comment of comments) {
      const arr = map.get(comment.content_item_id) ?? [];
      arr.push(comment);
      map.set(comment.content_item_id, arr);
    }
    return map;
  }, [comments]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-heading">Contenidos</h1>
            <p className="text-sm text-muted-foreground">
              Playbooks hiperlinkeados, clases tácticas y rutinas del equipo.
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openNew("class")}>
              <GraduationCap className="h-4 w-4 mr-2" /> Nueva clase
            </Button>
            <Button onClick={() => openNew("playbook")} className="gradient-accent">
              <Plus className="h-4 w-4 mr-2" /> Nuevo contenido
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SectionCard active={activeSection === "playbooks"} icon={BookOpen} title="Playbooks" desc="Documentos Google embebidos por mapa" onClick={() => setActiveSection("playbooks")} />
        <SectionCard active={activeSection === "classes"} icon={GraduationCap} title="Clases / Tareas" desc="Asignaciones con preguntas, respuesta y archivo" onClick={() => setActiveSection("classes")} />
        <SectionCard active={activeSection === "routines"} icon={Activity} title="Rutinas" desc="Rutinas por grupo/persona con Sheets/Excel embebido" onClick={() => setActiveSection("routines")} />
      </div>

      {activeSection === "playbooks" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {MAPS.map((map) => {
              const count = byCategory.playbook.filter((item) => item.map === map).length;
              const active = selectedPlaybookMap === map;
              return (
                <button
                  key={map}
                  type="button"
                  onClick={() => setSelectedPlaybookMap(map)}
                  className={cn(
                    "rounded-md border px-2.5 py-2 text-left transition",
                    active
                      ? "border-accent bg-accent/15 shadow-[0_0_0_1px_hsl(var(--accent)/0.35)]"
                      : "border-border bg-card/70 hover:border-accent/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-heading text-sm font-semibold truncate">{map}</span>
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">{count}</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Guía playbook</div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            <Card className="card-glow border-border/80">
              <CardHeader className="py-3 px-3 space-y-0">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Docs · {selectedPlaybookMap}</CardTitle>
                  {canManage && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openNew("playbook", selectedPlaybookMap)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0 space-y-1.5">
                {loading && <p className="text-xs text-muted-foreground py-3">Cargando...</p>}
                {!loading && playbooksForMap.length === 0 && (
                  <p className="text-xs text-muted-foreground py-3">Sin guías todavía.</p>
                )}
                {playbooksForMap.map((item) => {
                  const active = selectedPlaybook?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-md border px-2.5 py-2 transition",
                        active ? "border-accent bg-accent/10" : "border-border bg-card/60",
                      )}
                    >
                      <button type="button" className="w-full text-left" onClick={() => setSelectedPlaybookId(item.id)}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium truncate">{item.title}</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1">{STATUS_LABEL[item.status]}</Badge>
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                        )}
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {item.url && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[11px] px-2"
                              onClick={() => {
                                setSelectedPlaybookId(item.id);
                                setPlaybookFullscreen(true);
                              }}
                            >
                              <Eye className="h-3 w-3 mr-1" /> Previsualizar
                            </Button>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" /> Abrir
                            </a>
                          </>
                        )}
                        {canManage && (
                          <div className="ml-auto flex gap-0.5">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEdit(item)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => remove(item)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="card-glow border-accent/20 overflow-hidden">
              <CardHeader className="py-3 px-4 flex-row items-center justify-between space-y-0 gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-sm truncate">
                    {selectedPlaybook ? selectedPlaybook.title : `Playbook ${selectedPlaybookMap}`}
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Vista del documento dentro de Playbooks · tamaño hoja A4
                  </p>
                </div>
                {selectedPlaybook?.url && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => setPlaybookFullscreen(true)}
                    >
                      <Maximize2 className="h-3.5 w-3.5 mr-1.5" /> Pantalla completa
                    </Button>
                    <a href={selectedPlaybook.url} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="sm" className="h-8">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  </div>
                )}
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0 space-y-3">
                {selectedPlaybook?.url ? (
                  <MediaViewer
                    item={selectedPlaybook}
                    orientation="portrait"
                    className="h-[min(72vh,820px)]"
                    comments={commentsByItem.get(selectedPlaybook.id) ?? []}
                    members={members}
                    currentUserId={user?.id ?? null}
                    canManage={canManage}
                    onSaveComment={saveComment}
                    onDeleteComment={deleteComment}
                  />
                ) : (
                  <div className="flex h-[min(52vh,520px)] items-center justify-center rounded-md border border-dashed border-border bg-card/40 px-6 text-center">
                    <div>
                      <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {loading
                          ? "Cargando playbook..."
                          : "Elegí o creá una guía con Doc, PDF o YouTube para verla acá."}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <ContentPreviewDialog
            open={playbookFullscreen}
            onOpenChange={setPlaybookFullscreen}
            item={selectedPlaybook}
            orientation="portrait"
            subtitle="Vista ampliada"
            comments={selectedPlaybook ? commentsByItem.get(selectedPlaybook.id) ?? [] : []}
            members={members}
            currentUserId={user?.id ?? null}
            canManage={canManage}
            onSaveComment={saveComment}
            onDeleteComment={deleteComment}
          />
        </div>
      )}

      {activeSection === "playbooks" && (
        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="card-glow border-accent/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-accent" />
                Stats de contenido por mapa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mapStats.map((stat) => (
                <div key={stat.map} className="rounded-md border border-border bg-card/70 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-heading font-bold">{stat.map}</span>
                    <span className="text-xs text-muted-foreground">{stat.total} contenidos</span>
                  </div>
                  <Progress value={(stat.total / maxMapItems) * 100} className="h-2" />
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">PB {stat.playbooks}</Badge>
                    <Badge variant="outline" className="text-[10px]">Clases {stat.classes}</Badge>
                    <Badge variant="outline" className="text-[10px]">Rutinas {stat.routines}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="card-glow">
            <CardContent className="p-5">
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Resumen biblioteca</div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <Summary label="Playbooks" value={byCategory.playbook.length} />
                <Summary label="Clases" value={byCategory.class.length} />
                <Summary label="Rutinas" value={byCategory.routine.length} />
              </div>
              <div className="mt-5 rounded-md border border-accent/25 bg-accent/5 p-3 text-sm text-muted-foreground">
                Organizá el material por mapa, dejá links externos y usá clases para correcciones de demos, retakes o nuevos contenidos.
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {activeSection === "classes" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
              Filtrá por tipo y mapa
            </div>
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => openNew("class")}>
                <Plus className="h-4 w-4 mr-1" /> Nueva clase
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Tipo</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setClassTypeFilter("all")}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm transition",
                  classTypeFilter === "all"
                    ? "border-accent bg-accent/15 shadow-[0_0_0_1px_hsl(var(--accent)/0.35)]"
                    : "border-border bg-card/70 hover:border-accent/40",
                )}
              >
                <span className="font-heading font-semibold">Todas</span>
                <Badge variant="outline" className="ml-2 text-[10px] h-5 px-1.5">{byCategory.class.length}</Badge>
              </button>
              {CLASS_TYPES.map((type) => {
                const count = byCategory.class.filter((item) => item.content_type === type.value).length;
                const active = classTypeFilter === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setClassTypeFilter(type.value)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition",
                      active
                        ? "border-accent bg-accent/15 shadow-[0_0_0_1px_hsl(var(--accent)/0.35)]"
                        : "border-border bg-card/70 hover:border-accent/40",
                    )}
                  >
                    <span className="font-heading font-semibold">{type.label}</span>
                    <Badge variant="outline" className="ml-2 text-[10px] h-5 px-1.5">{count}</Badge>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Mapa</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setClassMapFilter("all")}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm transition",
                  classMapFilter === "all"
                    ? "border-accent bg-accent/15 shadow-[0_0_0_1px_hsl(var(--accent)/0.35)]"
                    : "border-border bg-card/70 hover:border-accent/40",
                )}
              >
                <span className="font-heading font-semibold">Todos</span>
              </button>
              <button
                type="button"
                onClick={() => setClassMapFilter("general")}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm transition",
                  classMapFilter === "general"
                    ? "border-accent bg-accent/15 shadow-[0_0_0_1px_hsl(var(--accent)/0.35)]"
                    : "border-border bg-card/70 hover:border-accent/40",
                )}
              >
                <span className="font-heading font-semibold">General</span>
              </button>
              {MAPS.map((map) => {
                const count = byCategory.class.filter((item) => {
                  const typeOk = classTypeFilter === "all" || item.content_type === classTypeFilter;
                  return typeOk && item.map === map;
                }).length;
                const active = classMapFilter === map;
                return (
                  <button
                    key={map}
                    type="button"
                    onClick={() => setClassMapFilter(map)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm transition",
                      active
                        ? "border-accent bg-accent/15 shadow-[0_0_0_1px_hsl(var(--accent)/0.35)]"
                        : "border-border bg-card/70 hover:border-accent/40",
                    )}
                  >
                    <span className="font-heading font-semibold">{map}</span>
                    <Badge variant="outline" className="ml-2 text-[10px] h-5 px-1.5">{count}</Badge>
                  </button>
                );
              })}
            </div>
          </div>

          <Card className="card-glow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-accent" />
                {classTypeFilter === "all"
                  ? "Todas las clases"
                  : CLASS_TYPES.find((type) => type.value === classTypeFilter)?.label ?? "Clases"}
                {classMapFilter !== "all" && (
                  <Badge className="text-[10px] bg-accent/15 text-accent border-accent/30">
                    {classMapFilter === "general" ? "General" : classMapFilter}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] ml-auto">{filteredClasses.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ContentList
                items={filteredClasses}
                loading={loading}
                canManage={canManage}
                onEdit={openEdit}
                onDelete={remove}
                members={members}
                responsesByItem={responsesByItem}
                commentsByItem={commentsByItem}
                currentUserId={user?.id ?? null}
                onRespond={saveResponse}
                onSaveComment={saveComment}
                onDeleteComment={deleteComment}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {activeSection === "routines" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {ROUTINE_GROUPS.map((group) => {
              const count = byCategory.routine.filter((item) => (item.routine_group ?? "general") === group.value).length;
              const active = selectedRoutineGroup === group.value;
              return (
                <button
                  key={group.value}
                  type="button"
                  onClick={() => setSelectedRoutineGroup(group.value)}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left transition",
                    active
                      ? "border-accent bg-accent/15 shadow-[0_0_0_1px_hsl(var(--accent)/0.35)]"
                      : "border-border bg-card/70 hover:border-accent/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading text-sm font-semibold">{group.label}</span>
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5">{count}</Badge>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
            <Card className="card-glow border-border/80">
              <CardHeader className="py-3 px-3 space-y-0">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">
                    {ROUTINE_GROUPS.find((g) => g.value === selectedRoutineGroup)?.label ?? "Rutinas"}
                  </CardTitle>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      onClick={() => openNew("routine")}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Nueva
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0 space-y-1.5">
                {loading && <p className="text-xs text-muted-foreground py-3">Cargando...</p>}
                {!loading && routinesForGroup.length === 0 && (
                  <p className="text-xs text-muted-foreground py-3">Sin rutinas todavía.</p>
                )}
                {routinesForGroup.map((item) => {
                  const active = selectedRoutine?.id === item.id;
                  const itemResponses = responsesByItem.get(item.id) ?? [];
                  const completed = itemResponses.filter((r) => r.completed).length;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedRoutineId(item.id)}
                      className={cn(
                        "w-full rounded-md border px-2.5 py-2 text-left transition",
                        active ? "border-accent bg-accent/10" : "border-border bg-card/60 hover:border-accent/35",
                      )}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium truncate">{item.title}</span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1">{STATUS_LABEL[item.status]}</Badge>
                      </div>
                      {(item.requires_response || item.requires_file) && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Respuestas {completed}/{Math.max(itemResponses.length, item.assigned_user_ids.length)}
                        </p>
                      )}
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <div className="space-y-4 min-w-0">
              <Card className="card-glow border-accent/20 overflow-hidden">
                <CardHeader className="py-3 px-4 flex-row items-center justify-between space-y-0 gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-sm truncate">
                      {selectedRoutine ? selectedRoutine.title : "Vista de rutina"}
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Preview horizontal de Excel / Sheets · legible en pantalla ancha
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {selectedRoutine?.url && (
                      <>
                        <Button variant="outline" size="sm" className="h-8" onClick={() => setRoutineFullscreen(true)}>
                          <Maximize2 className="h-3.5 w-3.5 mr-1.5" /> Ampliar
                        </Button>
                        <a href={selectedRoutine.url} target="_blank" rel="noreferrer">
                          <Button variant="ghost" size="sm" className="h-8">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      </>
                    )}
                    {canManage && selectedRoutine && (
                      <>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(selectedRoutine)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => remove(selectedRoutine)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0 space-y-3">
                  {selectedRoutine?.description && (
                    <p className="text-xs text-muted-foreground px-1">{selectedRoutine.description}</p>
                  )}
                  {selectedRoutine?.url ? (
                    <MediaViewer
                      item={selectedRoutine}
                      orientation="landscape"
                      className="h-[min(58vh,640px)]"
                      comments={commentsByItem.get(selectedRoutine.id) ?? []}
                      members={members}
                      currentUserId={user?.id ?? null}
                      canManage={canManage}
                      onSaveComment={saveComment}
                      onDeleteComment={deleteComment}
                    />
                  ) : (
                    <div className="flex h-[min(40vh,360px)] items-center justify-center rounded-md border border-dashed border-border bg-card/40 px-6 text-center">
                      <div>
                        <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">
                          {loading ? "Cargando rutina..." : "Elegí o creá una rutina con Sheets, PDF o YouTube para verla acá."}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {selectedRoutine && (
                <RoutineDetailsPanel
                  item={selectedRoutine}
                  members={members}
                  responses={responsesByItem.get(selectedRoutine.id) ?? []}
                  currentUserId={user?.id ?? null}
                  canManage={canManage}
                  onRespond={saveResponse}
                  onExpandPreview={() => setRoutineFullscreen(true)}
                />
              )}
            </div>
          </div>

          <ContentPreviewDialog
            open={routineFullscreen}
            onOpenChange={setRoutineFullscreen}
            item={selectedRoutine}
            orientation="landscape"
            subtitle="Vista ampliada horizontal"
            comments={selectedRoutine ? commentsByItem.get(selectedRoutine.id) ?? [] : []}
            members={members}
            currentUserId={user?.id ?? null}
            canManage={canManage}
            onSaveComment={saveComment}
            onDeleteComment={deleteComment}
          />
        </div>
      )}

      <ContentDialog open={open} onOpenChange={setOpen} form={form} setForm={setForm} editing={editing} onSave={save} members={members} />
    </div>
  );
}

function ContentList({
  items,
  loading,
  canManage,
  onEdit,
  onDelete,
  members,
  responsesByItem,
  commentsByItem,
  currentUserId,
  onRespond,
  onSaveComment,
  onDeleteComment,
}: {
  items: ContentItem[];
  loading: boolean;
  canManage: boolean;
  onEdit: (item: ContentItem) => void;
  onDelete: (item: ContentItem) => void;
  members?: Array<{ user_id: string; player_name: string }>;
  responsesByItem?: Map<string, ContentResponse[]>;
  commentsByItem?: Map<string, ContentComment[]>;
  currentUserId?: string | null;
  onRespond?: (item: ContentItem, responseText: string, attachmentUrl: string) => void;
  onSaveComment?: (item: ContentItem, body: string) => void;
  onDeleteComment?: (comment: ContentComment) => void;
}) {
  if (loading) return <p className="text-sm text-muted-foreground py-4">Cargando...</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground py-4">Sin contenidos todavía.</p>;
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <ContentCard
          key={item.id}
          item={item}
          canManage={canManage}
          onEdit={onEdit}
          onDelete={onDelete}
          members={members ?? []}
          responses={responsesByItem?.get(item.id) ?? []}
          comments={commentsByItem?.get(item.id) ?? []}
          currentUserId={currentUserId ?? null}
          onRespond={onRespond}
          onSaveComment={onSaveComment}
          onDeleteComment={onDeleteComment}
        />
      ))}
    </div>
  );
}

function ContentCard({
  item,
  canManage,
  onEdit,
  onDelete,
  members,
  responses,
  comments,
  currentUserId,
  onRespond,
  onSaveComment,
  onDeleteComment,
}: {
  item: ContentItem;
  canManage: boolean;
  onEdit: (item: ContentItem) => void;
  onDelete: (item: ContentItem) => void;
  members: Array<{ user_id: string; player_name: string }>;
  responses: ContentResponse[];
  comments: ContentComment[];
  currentUserId: string | null;
  onRespond?: (item: ContentItem, responseText: string, attachmentUrl: string) => void;
  onSaveComment?: (item: ContentItem, body: string) => void;
  onDeleteComment?: (comment: ContentComment) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [responsesOpen, setResponsesOpen] = useState(false);
  const [responseText, setResponseText] = useState(responses.find((r) => r.user_id === currentUserId)?.response_text ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState(responses.find((r) => r.user_id === currentUserId)?.attachment_url ?? "");
  const questions = questionsFromJson(item.questions);
  const assignedNames = item.assigned_user_ids
    .map((id) => members.find((member) => member.user_id === id)?.player_name)
    .filter(Boolean)
    .join(", ");
  const myResponse = responses.find((r) => r.user_id === currentUserId);
  const assignedToMe = !!currentUserId && (item.assigned_user_ids.length === 0 || item.assigned_user_ids.includes(currentUserId));
  const mediaKind = resolveMediaKind(item);
  const orientation = prefersLandscape(item) ? "landscape" : "portrait";
  const completedCount = responses.filter((r) => r.completed).length;
  const hasInlineMedia = !!item.url && (mediaKind === "youtube" || mediaKind === "pdf");
  const mediaTabLabel = mediaKind === "youtube" ? "Video" : mediaKind === "pdf" ? "PDF" : "Media";

  return (
    <div className="rounded-md border border-border bg-card/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium">{item.title}</h3>
            <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[item.status]}</Badge>
            <Badge variant="outline" className="text-[10px] gap-1">
              {mediaKind === "youtube" ? <Youtube className="h-3 w-3" /> : mediaKind === "pdf" ? <FileText className="h-3 w-3" /> : null}
              {MEDIA_LABEL[mediaKind] ?? mediaKind}
            </Badge>
            {item.map && <Badge className="text-[10px] bg-accent/15 text-accent border-accent/30">{item.map}</Badge>}
            {item.category === "class" && item.content_type && (
              <Badge variant="outline" className="text-[10px]">
                {CLASS_TYPES.find((type) => type.value === item.content_type)?.label ?? item.content_type}
              </Badge>
            )}
            {item.requires_response && <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> Respuesta</Badge>}
            {item.requires_file && <Badge variant="outline" className="text-[10px]"><Paperclip className="h-3 w-3 mr-1" /> Archivo</Badge>}
          </div>
          {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
          {assignedNames && (
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              <Users2 className="h-3 w-3" /> Asignado a: {assignedNames}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {hasInlineMedia && (
              <Button
                variant={mediaOpen ? "default" : "outline"}
                size="sm"
                onClick={() => setMediaOpen((v) => !v)}
                className="h-7 text-xs"
              >
                {mediaOpen ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                {mediaOpen ? `Ocultar ${mediaTabLabel.toLowerCase()}` : `Ver ${mediaTabLabel.toLowerCase()}`}
                {mediaKind === "youtube" && comments.length > 0 && (
                  <Badge variant="outline" className="ml-1.5 text-[10px] h-4 px-1">{comments.length}</Badge>
                )}
              </Button>
            )}
            {item.url && (
              <>
                <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} className="h-7 text-xs">
                  <Eye className="h-3 w-3 mr-1" /> Pantalla completa
                </Button>
                <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                  <LinkIcon className="h-3 w-3" /> Abrir link <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => onEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(item)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        )}
      </div>

      <ContentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        item={item}
        orientation={orientation}
        subtitle={mediaKind === "youtube" ? "Video + comentarios" : mediaKind === "pdf" ? "Vista PDF" : orientation === "landscape" ? "Vista horizontal" : "Vista ampliada"}
        comments={comments}
        members={members}
        currentUserId={currentUserId}
        canManage={canManage}
        onSaveComment={onSaveComment}
        onDeleteComment={onDeleteComment}
      />

      {hasInlineMedia && mediaOpen && (
        <div className="mt-3 space-y-3 rounded-md border border-border/80 bg-background/40 p-2.5">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
              {mediaKind === "youtube" ? <Youtube className="h-3.5 w-3.5 text-accent" /> : <FileText className="h-3.5 w-3.5 text-accent" />}
              {mediaTabLabel}
              {mediaKind === "youtube" && " · comentarios"}
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setMediaOpen(false)}>
              <ChevronUp className="h-3 w-3 mr-1" /> Colapsar
            </Button>
          </div>
          <MediaViewer
            item={item}
            orientation={mediaKind === "youtube" ? "landscape" : orientation}
            className={mediaKind === "youtube" ? "h-[min(42vh,420px)]" : "h-[min(56vh,640px)]"}
            comments={comments}
            members={members}
            currentUserId={currentUserId}
            canManage={canManage}
            onSaveComment={onSaveComment}
            onDeleteComment={onDeleteComment}
            showComments={mediaKind === "youtube"}
          />
        </div>
      )}

      {(item.requires_response || item.requires_file) && assignedToMe && (
        <div className="mt-3 rounded-md border border-accent/25 bg-accent/5 p-3 space-y-2">
          <div className="text-xs font-heading text-accent">Tu respuesta {myResponse?.completed && <span className="text-success">· completada</span>}</div>
          {questions.length > 0 && (
            <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
              {questions.map((q) => <li key={q}>{q}</li>)}
            </ul>
          )}
          {item.requires_response && (
            <Textarea value={responseText} onChange={(e) => setResponseText(e.target.value)} placeholder="Respondé acá..." rows={3} />
          )}
          {item.requires_file && (
            <Input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="Link al archivo / drive / evidencia..." />
          )}
          <Button size="sm" onClick={() => onRespond?.(item, responseText, attachmentUrl)}>Enviar respuesta</Button>
        </div>
      )}

      {canManage && (item.requires_response || item.requires_file || responses.length > 0) && (
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setResponsesOpen((v) => !v)}
          >
            {responsesOpen ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
            Respuestas {completedCount}/{Math.max(responses.length, item.assigned_user_ids.length)}
          </Button>
          {responsesOpen && (
            <ResponsesReviewList
              item={item}
              members={members}
              responses={responses}
              className="mt-2"
            />
          )}
        </div>
      )}
    </div>
  );
}

function RoutineDetailsPanel({
  item,
  members,
  responses,
  currentUserId,
  canManage,
  onRespond,
  onExpandPreview,
}: {
  item: ContentItem;
  members: Array<{ user_id: string; player_name: string; is_coach?: boolean }>;
  responses: ContentResponse[];
  currentUserId: string | null;
  canManage: boolean;
  onRespond: (item: ContentItem, responseText: string, attachmentUrl: string) => void;
  onExpandPreview: () => void;
}) {
  const [responseText, setResponseText] = useState(responses.find((r) => r.user_id === currentUserId)?.response_text ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState(responses.find((r) => r.user_id === currentUserId)?.attachment_url ?? "");
  const questions = questionsFromJson(item.questions);
  const myResponse = responses.find((r) => r.user_id === currentUserId);
  const assignedToMe = !!currentUserId && (item.assigned_user_ids.length === 0 || item.assigned_user_ids.includes(currentUserId));
  const assignedNames = item.assigned_user_ids
    .map((id) => members.find((member) => member.user_id === id)?.player_name)
    .filter(Boolean)
    .join(", ");

  useEffect(() => {
    setResponseText(responses.find((r) => r.user_id === currentUserId)?.response_text ?? "");
    setAttachmentUrl(responses.find((r) => r.user_id === currentUserId)?.attachment_url ?? "");
  }, [item.id, currentUserId, responses]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="card-glow">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Detalle y entrega</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {assignedNames && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users2 className="h-3.5 w-3.5" /> Asignado a: {assignedNames}
            </p>
          )}
          {item.url && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-8" onClick={onExpandPreview}>
                <Maximize2 className="h-3.5 w-3.5 mr-1.5" /> Ver completa
              </Button>
              <a href={item.url} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="sm" className="h-8">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir Sheets
                </Button>
              </a>
            </div>
          )}

          {(item.requires_response || item.requires_file) && assignedToMe ? (
            <div className="rounded-md border border-accent/25 bg-accent/5 p-3 space-y-2">
              <div className="text-xs font-heading text-accent">
                Tu respuesta {myResponse?.completed && <span className="text-success">· completada</span>}
              </div>
              {questions.length > 0 && (
                <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
                  {questions.map((q) => <li key={q}>{q}</li>)}
                </ul>
              )}
              {item.requires_response && (
                <Textarea value={responseText} onChange={(e) => setResponseText(e.target.value)} placeholder="Respondé acá..." rows={3} />
              )}
              {item.requires_file && (
                <Input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="Link al archivo / drive / evidencia..." />
              )}
              <Button size="sm" onClick={() => onRespond(item, responseText, attachmentUrl)}>Enviar respuesta</Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {item.requires_response || item.requires_file
                ? "Esta rutina está asignada a otros jugadores."
                : "Esta rutina no pide respuesta."}
            </p>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card className="card-glow">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users2 className="h-4 w-4 text-accent" />
              Respuestas del equipo
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsesReviewList item={item} members={members} responses={responses} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResponsesReviewList({
  item,
  members,
  responses,
  className,
}: {
  item: ContentItem;
  members: Array<{ user_id: string; player_name: string }>;
  responses: ContentResponse[];
  className?: string;
}) {
  const assignedIds = item.assigned_user_ids.length > 0
    ? item.assigned_user_ids
    : responses.map((r) => r.user_id);
  const uniqueIds = Array.from(new Set(assignedIds));

  if (uniqueIds.length === 0) {
    return <p className={cn("text-xs text-muted-foreground", className)}>Todavía no hay asignados ni respuestas.</p>;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {uniqueIds.map((userId) => {
        const member = members.find((m) => m.user_id === userId);
        const response = responses.find((r) => r.user_id === userId);
        const name = member?.player_name ?? "Jugador";
        return (
          <div key={userId} className="rounded-md border border-border bg-card/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{name}</span>
              <Badge variant="outline" className={cn("text-[10px]", response?.completed ? "border-success/40 text-success" : "")}>
                {response?.completed ? "Completada" : "Pendiente"}
              </Badge>
            </div>
            {response?.response_text ? (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{response.response_text}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">Sin texto de respuesta</p>
            )}
            {response?.attachment_url ? (
              <a
                href={response.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Abrir adjunto / evidencia
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : item.requires_file ? (
              <p className="text-[11px] text-muted-foreground">Sin archivo adjunto</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ContentDialog({
  open,
  onOpenChange,
  form,
  setForm,
  editing,
  onSave,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  editing: ContentItem | null;
  onSave: () => void;
  members: Array<{ user_id: string; player_name: string; is_coach?: boolean }>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar contenido" : "Nuevo contenido"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Sector</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as ContentCategory }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="playbook">Playbook</SelectItem>
                  <SelectItem value="class">Clase</SelectItem>
                  <SelectItem value="routine">Rutina</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Mapa</Label>
              <Select value={form.map} onValueChange={(v) => setForm((f) => ({ ...f, map: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  {MAPS.map((map) => <SelectItem key={map} value={map}>{map}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as FormState["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="archived">Archivado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Título</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ej: Ancient defaults / Retake B / Rutina semanal" />
          </div>
          <div>
            <Label className="text-xs">Tipo de archivo / media</Label>
            <Select
              value={form.source_format}
              onValueChange={(v) => setForm((f) => ({ ...f, source_format: v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCE_FORMATS.map((format) => (
                  <SelectItem key={format.value} value={format.value}>{format.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">
              {form.source_format === "youtube"
                ? "Link de YouTube"
                : form.source_format === "pdf"
                  ? "Link del PDF"
                  : form.source_format === "sheet"
                    ? "Link de Sheets / Excel"
                    : "Link hiperlinkeado"}
            </Label>
            <Input
              value={form.url}
              onChange={(e) => {
                const nextUrl = e.target.value;
                setForm((f) => ({
                  ...f,
                  url: nextUrl,
                  source_format: detectSourceFormat(nextUrl, f.source_format),
                }));
              }}
              placeholder={
                form.source_format === "youtube"
                  ? "https://www.youtube.com/watch?v=... o https://youtu.be/..."
                  : form.source_format === "pdf"
                    ? "https://.../archivo.pdf o Drive"
                    : form.source_format === "sheet"
                      ? "https://docs.google.com/spreadsheets/..."
                      : "https://docs.google.com/document/..."
              }
            />
          </div>
          {form.category === "class" && (
            <div>
              <Label className="text-xs">Tipo de clase</Label>
              <Select value={form.content_type} onValueChange={(v) => setForm((f) => ({ ...f, content_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASS_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {form.category === "routine" && (
            <div>
              <Label className="text-xs">Grupo de rutina</Label>
              <Select value={form.routine_group} onValueChange={(v) => setForm((f) => ({ ...f, routine_group: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROUTINE_GROUPS.map((group) => <SelectItem key={group.value} value={group.value}>{group.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Asignar a jugadores</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm((f) => ({ ...f, assigned_user_ids: members.filter((m) => !m.is_coach).map((m) => m.user_id) }))}
              >
                Todos los jugadores
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {members.filter((member) => !member.is_coach).map((member) => {
                const checked = form.assigned_user_ids.includes(member.user_id);
                return (
                  <label key={member.user_id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          assigned_user_ids: e.target.checked
                            ? [...f.assigned_user_ids, member.user_id]
                            : f.assigned_user_ids.filter((id) => id !== member.user_id),
                        }))
                      }
                    />
                    {member.player_name}
                  </label>
                );
              })}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.requires_response} onChange={(e) => setForm((f) => ({ ...f, requires_response: e.target.checked }))} />
                Requiere respuesta
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.requires_file} onChange={(e) => setForm((f) => ({ ...f, requires_file: e.target.checked }))} />
                Requiere adjuntar archivo/link
              </label>
            </div>
            <div>
              <Label className="text-xs">Preguntas / consigna (una por línea)</Label>
              <Textarea
                rows={3}
                value={form.questionsText}
                onChange={(e) => setForm((f) => ({ ...f, questionsText: e.target.value }))}
                placeholder="¿Qué corregirías del retake?\nSubí link de tu POV o demo corregida..."
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Descripción / notas</Label>
            <Textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Qué contiene, foco, correcciones, timestamps o próximos pasos..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card/70 p-3 text-center">
      <div className="text-2xl font-heading text-accent">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
    </div>
  );
}

function SectionCard({
  active,
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  icon: typeof BookOpen;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-4 text-left transition card-glow",
        active ? "border-accent bg-accent/10" : "border-border bg-card hover:border-accent/35",
      )}
    >
      <Icon className={cn("h-5 w-5 mb-3", active ? "text-accent" : "text-muted-foreground")} />
      <div className="font-heading font-bold">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
    </button>
  );
}

function DocFrame({
  title,
  url,
  orientation = "portrait",
  className,
  defaultZoom,
  forcePdf = false,
}: {
  title: string;
  url: string;
  orientation?: "portrait" | "landscape";
  className?: string;
  defaultZoom?: number;
  forcePdf?: boolean;
}) {
  const landscape = orientation === "landscape";
  const initialZoom = defaultZoom ?? (landscape ? 0.75 : 1);
  const [zoom, setZoom] = useState(initialZoom);
  const supportsCssZoom = useMemo(() => supportsBrowserCssZoom(), []);

  useEffect(() => {
    setZoom(defaultZoom ?? (landscape ? 0.75 : 1));
  }, [url, landscape, defaultZoom]);

  const zoomOut = () => setZoom((z) => clampZoom(z - ZOOM_STEP));
  const zoomIn = () => setZoom((z) => clampZoom(z + ZOOM_STEP));
  const resetZoom = () => setZoom(initialZoom);

  // CSS zoom re-rasterizes text (nítido). transform:scale() se ve borroso.
  // Con zoom: el iframe se agranda 1/zoom y el browser lo reduce con zoom nativo.
  const frameStyle: CSSProperties = supportsCssZoom
    ? {
        width: `${Number((100 / zoom).toFixed(4))}%`,
        height: `${Number((100 / zoom).toFixed(4))}%`,
        minHeight: landscape ? 520 : 720,
        zoom,
        border: 0,
      }
    : {
        width: `${Number((100 / zoom).toFixed(4))}%`,
        height: `${Number((100 / zoom).toFixed(4))}%`,
        minHeight: landscape ? 520 / zoom : 720 / zoom,
        transform: `scale(${zoom})`,
        transformOrigin: "top left",
        border: 0,
        backfaceVisibility: "hidden",
        WebkitFontSmoothing: "antialiased",
      };

  return (
    <div className={cn("flex w-full min-h-0 flex-col gap-2", className)}>
      <div className="flex items-center justify-center gap-1.5 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN + 0.001}
          title="Alejar"
          aria-label="Alejar"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 min-w-[4.5rem] px-2 font-mono text-xs"
          onClick={resetZoom}
          title="Restablecer zoom"
        >
          {Math.round(zoom * 100)}%
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX - 0.001}
          title="Acercar"
          aria-label="Acercar"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      <div className={cn("min-h-0 flex-1 flex", landscape ? "w-full" : "justify-center")}>
        <div
          className={cn(
            "relative h-full overflow-auto rounded-sm border border-border/70 bg-white shadow-[0_22px_60px_rgba(0,0,0,0.38)]",
            landscape ? "w-full" : "max-w-full",
          )}
          style={landscape ? undefined : { aspectRatio: "210 / 297" }}
        >
          <iframe
            src={toEmbedUrl(url, {
              preferReadableSheet: landscape || prefersSpreadsheetUrl(url),
              forcePdf,
            })}
            title={title}
            className="block bg-white"
            style={frameStyle}
            allow="fullscreen"
          />
        </div>
      </div>
    </div>
  );
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

function clampZoom(value: number) {
  // Pasos limpios (50/60/70…) para evitar escalas “sucias” que empastan el texto
  const stepped = Math.round(value * 10) / 10;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, stepped));
}

function supportsBrowserCssZoom() {
  try {
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
      return CSS.supports("zoom", "0.5");
    }
    return typeof document !== "undefined" && "zoom" in document.documentElement.style;
  } catch {
    return false;
  }
}

function prefersSpreadsheetUrl(url: string) {
  return /spreadsheets|\.xlsx?($|\?)|excel/i.test(url);
}

function ContentPreviewDialog({
  open,
  onOpenChange,
  item,
  orientation = "portrait",
  subtitle,
  comments = [],
  members = [],
  currentUserId = null,
  canManage = false,
  onSaveComment,
  onDeleteComment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ContentItem | null;
  orientation?: "portrait" | "landscape";
  subtitle?: string;
  comments?: ContentComment[];
  members?: Array<{ user_id: string; player_name: string }>;
  currentUserId?: string | null;
  canManage?: boolean;
  onSaveComment?: (item: ContentItem, body: string) => void;
  onDeleteComment?: (comment: ContentComment) => void;
}) {
  if (!item?.url) return null;
  const kind = resolveMediaKind(item);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed inset-2 sm:inset-3 left-auto top-auto translate-x-0 translate-y-0 w-auto max-w-none h-auto max-h-none flex flex-col gap-0 p-0 overflow-hidden sm:rounded-lg border-border bg-background">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 pr-12 shrink-0">
          <div className="min-w-0">
            <DialogTitle className="text-base truncate">{item.title}</DialogTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {subtitle ?? (kind === "youtube" ? "Video" : kind === "pdf" ? "PDF" : "Vista ampliada")}
              {item.map ? ` · ${item.map}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={item.url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="h-8">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir original
              </Button>
            </a>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
              <X className="h-3.5 w-3.5 mr-1.5" /> Cerrar
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-[radial-gradient(circle_at_top,hsl(var(--muted)/0.55),hsl(var(--background)))] p-3 sm:p-5">
          <MediaViewer
            item={item}
            orientation={orientation}
            className={kind === "youtube" ? "min-h-[70vh]" : orientation === "landscape" ? "h-[min(88vh,900px)] min-h-0" : "h-[min(92vh,1200px)] mx-auto min-h-0"}
            comments={comments}
            members={members}
            currentUserId={currentUserId}
            canManage={canManage}
            onSaveComment={onSaveComment}
            onDeleteComment={onDeleteComment}
            showComments={kind === "youtube"}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MediaViewer({
  item,
  orientation = "portrait",
  className,
  comments = [],
  members = [],
  currentUserId = null,
  canManage = false,
  onSaveComment,
  onDeleteComment,
  showComments,
}: {
  item: ContentItem;
  orientation?: "portrait" | "landscape";
  className?: string;
  comments?: ContentComment[];
  members?: Array<{ user_id: string; player_name: string }>;
  currentUserId?: string | null;
  canManage?: boolean;
  onSaveComment?: (item: ContentItem, body: string) => void;
  onDeleteComment?: (comment: ContentComment) => void;
  showComments?: boolean;
}) {
  if (!item.url) return null;
  const kind = resolveMediaKind(item);
  const includeComments = showComments ?? kind === "youtube";

  if (kind === "youtube") {
    const videoId = extractYoutubeId(item.url);
    return (
      <div className={cn("space-y-3 w-full", className)}>
        <div className="relative w-full overflow-hidden rounded-md border border-border bg-black aspect-video shadow-[0_22px_60px_rgba(0,0,0,0.38)]">
          {videoId ? (
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?rel=0`}
              title={item.title}
              className="absolute inset-0 h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-card">
              No se pudo leer el link de YouTube
            </div>
          )}
        </div>
        {includeComments && onSaveComment && onDeleteComment && (
          <YouTubeCommentsPanel
            item={item}
            comments={comments}
            members={members}
            currentUserId={currentUserId}
            canManage={canManage}
            onSaveComment={onSaveComment}
            onDeleteComment={onDeleteComment}
          />
        )}
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <DocFrame
        title={item.title}
        url={item.url}
        orientation={orientation === "landscape" ? "landscape" : "portrait"}
        className={className}
        defaultZoom={orientation === "landscape" ? 0.85 : 1}
        forcePdf
      />
    );
  }

  return (
    <DocFrame
      title={item.title}
      url={item.url}
      orientation={orientation}
      className={className}
    />
  );
}

function YouTubeCommentsPanel({
  item,
  comments,
  members,
  currentUserId,
  canManage,
  onSaveComment,
  onDeleteComment,
}: {
  item: ContentItem;
  comments: ContentComment[];
  members: Array<{ user_id: string; player_name: string }>;
  currentUserId: string | null;
  canManage: boolean;
  onSaveComment: (item: ContentItem, body: string) => void;
  onDeleteComment: (comment: ContentComment) => void;
}) {
  const [body, setBody] = useState("");

  return (
    <Card className="card-glow">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-accent" />
          Comentarios del video
          <Badge variant="outline" className="text-[10px]">{comments.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
          {comments.length === 0 && (
            <p className="text-xs text-muted-foreground">Todavía no hay comentarios. Dejá el primero.</p>
          )}
          {comments.map((comment) => {
            const author = members.find((m) => m.user_id === comment.user_id)?.player_name ?? "Jugador";
            const canDelete = canManage || comment.user_id === currentUserId;
            return (
              <div key={comment.id} className="rounded-md border border-border bg-card/60 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{author}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(comment.created_at).toLocaleString("es-AR")}
                    </div>
                  </div>
                  {canDelete && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDeleteComment(comment)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
                <p className="text-sm mt-1.5 whitespace-pre-wrap">{comment.body}</p>
              </div>
            );
          })}
        </div>
        {currentUserId ? (
          <div className="space-y-2">
            <Textarea
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escribí un comentario sobre el video..."
            />
            <Button
              size="sm"
              onClick={() => {
                onSaveComment(item, body);
                setBody("");
              }}
            >
              Publicar comentario
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Iniciá sesión para comentar.</p>
        )}
      </CardContent>
    </Card>
  );
}

function prefersLandscape(item: ContentItem) {
  const kind = resolveMediaKind(item);
  if (kind === "youtube" || kind === "sheet") return true;
  if (item.category === "routine" && kind !== "pdf") return true;
  return false;
}

function resolveMediaKind(item: ContentItem): "youtube" | "pdf" | "sheet" | "link" {
  const format = (item.source_format || "").toLowerCase();
  if (format === "youtube" || format === "pdf" || format === "sheet") return format;
  if (format === "doc") return "link";
  return detectSourceFormat(item.url ?? "", "link") as "youtube" | "pdf" | "sheet" | "link";
}

function detectSourceFormat(url: string, fallback = "link") {
  const value = url.trim();
  if (!value) return fallback;
  if (extractYoutubeId(value)) return "youtube";
  if (/\.pdf($|\?)/i.test(value) || /drive\.google\.com\/file\//i.test(value)) return "pdf";
  if (/spreadsheets|\.xlsx?($|\?)/i.test(value)) return "sheet";
  if (/docs\.google\.com\/document/i.test(value)) return "link";
  return fallback;
}

function extractYoutubeId(url: string): string | null {
  const normalized = normalizeUrl(url) ?? url;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function toEmbedUrl(url: string, opts?: { preferReadableSheet?: boolean; forcePdf?: boolean }) {
  const normalized = normalizeUrl(url) ?? url;
  if (opts?.forcePdf || /\.pdf($|\?)/i.test(normalized) || /drive\.google\.com\/file\//i.test(normalized)) {
    const drive = normalized.match(/drive\.google\.com\/file\/d\/([^/]+)/i)?.[1];
    if (drive) return `https://drive.google.com/file/d/${drive}/preview`;
    return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(normalized)}`;
  }
  const doc = normalized.match(/docs\.google\.com\/document\/d\/([^/]+)/i)?.[1];
  if (doc) return `https://docs.google.com/document/d/${doc}/preview`;
  const sheet = normalized.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i)?.[1];
  if (sheet) {
    if (opts?.preferReadableSheet) {
      return `https://docs.google.com/spreadsheets/d/${sheet}/htmlview?usp=sharing`;
    }
    return `https://docs.google.com/spreadsheets/d/${sheet}/preview`;
  }
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(normalized)}`;
}

function textToQuestions(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function questionsToText(value: Json) {
  return Array.isArray(value) ? value.map(String).join("\n") : "";
}

function questionsFromJson(value: Json) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}
