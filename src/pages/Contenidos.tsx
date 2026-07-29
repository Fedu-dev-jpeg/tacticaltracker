import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  Activity,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Eye,
  GraduationCap,
  Link as LinkIcon,
  Maximize2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Users2,
  X,
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
  { value: "demo-retake", label: "Correcciones demo / retake" },
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

export default function Contenidos() {
  const { user } = useAuth();
  const { isAdmin, isCoach } = useUserRole();
  const { members } = useTeamMembers();
  const canManage = isAdmin || isCoach;
  const [items, setItems] = useState<ContentItem[]>([]);
  const [responses, setResponses] = useState<ContentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [activeSection, setActiveSection] = useState<"playbooks" | "classes" | "routines">("playbooks");
  const [selectedPlaybookMap, setSelectedPlaybookMap] = useState<string>(MAPS[0]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);
  const [playbookFullscreen, setPlaybookFullscreen] = useState(false);

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
        const { data: responseRows } = await supabase
          .from("content_responses")
          .select("*")
          .in("content_item_id", ids);
        setResponses((responseRows as ContentResponse[]) ?? []);
      } else {
        setResponses([]);
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
      routine_group: category === "routine" ? "rifle" : "general",
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

  const responsesByItem = useMemo(() => {
    const map = new Map<string, ContentResponse[]>();
    for (const response of responses) {
      const arr = map.get(response.content_item_id) ?? [];
      arr.push(response);
      map.set(response.content_item_id, arr);
    }
    return map;
  }, [responses]);

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
              <CardContent className="px-3 pb-3 pt-0">
                {selectedPlaybook?.url ? (
                  <A4DocFrame
                    title={selectedPlaybook.title}
                    url={selectedPlaybook.url}
                    className="h-[min(72vh,820px)]"
                  />
                ) : (
                  <div className="flex h-[min(52vh,520px)] items-center justify-center rounded-md border border-dashed border-border bg-card/40 px-6 text-center">
                    <div>
                      <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {loading
                          ? "Cargando playbook..."
                          : "Elegí o creá una guía con link de Google Docs para verla acá."}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <PlaybookFullscreenDialog
            open={playbookFullscreen}
            onOpenChange={setPlaybookFullscreen}
            item={selectedPlaybook}
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
          <div className="grid gap-4 lg:grid-cols-3">
            {CLASS_TYPES.map((type) => (
              <Card key={type.value} className="card-glow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-accent" />
                      {type.label}
                    </CardTitle>
                    {canManage && (
                      <Button variant="ghost" size="sm" onClick={() => openNew("class")}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ContentList
                    items={byCategory.class.filter((item) => item.content_type === type.value)}
                    loading={loading}
                    canManage={canManage}
                    onEdit={openEdit}
                    onDelete={remove}
                    members={members}
                    responsesByItem={responsesByItem}
                    currentUserId={user?.id ?? null}
                    onRespond={saveResponse}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
      )}

      {activeSection === "routines" && (
          <div className="grid gap-4 lg:grid-cols-2">
            {ROUTINE_GROUPS.map((group) => (
          <Card className="card-glow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-accent" />
                      {group.label}
                </CardTitle>
                {canManage && (
                  <Button onClick={() => openNew("routine")} size="sm">
                    <Plus className="h-4 w-4 mr-2" /> Nueva rutina
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
                  <ContentList
                    items={byCategory.routine.filter((item) => (item.routine_group ?? "general") === group.value)}
                    loading={loading}
                    canManage={canManage}
                    onEdit={openEdit}
                    onDelete={remove}
                    members={members}
                    responsesByItem={responsesByItem}
                    currentUserId={user?.id ?? null}
                    onRespond={saveResponse}
                  />
            </CardContent>
          </Card>
            ))}
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
  currentUserId,
  onRespond,
}: {
  items: ContentItem[];
  loading: boolean;
  canManage: boolean;
  onEdit: (item: ContentItem) => void;
  onDelete: (item: ContentItem) => void;
  members?: Array<{ user_id: string; player_name: string }>;
  responsesByItem?: Map<string, ContentResponse[]>;
  currentUserId?: string | null;
  onRespond?: (item: ContentItem, responseText: string, attachmentUrl: string) => void;
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
          currentUserId={currentUserId ?? null}
          onRespond={onRespond}
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
  currentUserId,
  onRespond,
}: {
  item: ContentItem;
  canManage: boolean;
  onEdit: (item: ContentItem) => void;
  onDelete: (item: ContentItem) => void;
  members: Array<{ user_id: string; player_name: string }>;
  responses: ContentResponse[];
  currentUserId: string | null;
  onRespond?: (item: ContentItem, responseText: string, attachmentUrl: string) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [responseText, setResponseText] = useState(responses.find((r) => r.user_id === currentUserId)?.response_text ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState(responses.find((r) => r.user_id === currentUserId)?.attachment_url ?? "");
  const questions = questionsFromJson(item.questions);
  const assignedNames = item.assigned_user_ids
    .map((id) => members.find((member) => member.user_id === id)?.player_name)
    .filter(Boolean)
    .join(", ");
  const myResponse = responses.find((r) => r.user_id === currentUserId);
  const assignedToMe = !!currentUserId && (item.assigned_user_ids.length === 0 || item.assigned_user_ids.includes(currentUserId));

  return (
    <div className="rounded-md border border-border bg-card/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium">{item.title}</h3>
            <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[item.status]}</Badge>
            {item.map && <Badge className="text-[10px] bg-accent/15 text-accent border-accent/30">{item.map}</Badge>}
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
            {item.url && (
              <>
                <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} className="h-7 text-xs">
                  <Eye className="h-3 w-3 mr-1" /> Previsualizar
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

      {previewOpen && item.url && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="fixed inset-3 sm:inset-4 left-auto top-auto translate-x-0 translate-y-0 w-auto max-w-none h-auto max-h-none flex flex-col gap-0 p-0 overflow-hidden sm:rounded-lg">
            <DialogHeader className="px-4 py-3 border-b border-border shrink-0 pr-12">
              <DialogTitle className="text-base truncate">{item.title}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 bg-muted/40 p-3 sm:p-5 overflow-auto">
              <A4DocFrame title={item.title} url={item.url} className="h-[min(88vh,1100px)] mx-auto" />
            </div>
          </DialogContent>
        </Dialog>
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

      {canManage && responses.length > 0 && (
        <div className="mt-3 text-xs text-muted-foreground">
          Respuestas: {responses.filter((r) => r.completed).length}/{responses.length}
        </div>
      )}
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
            <Label className="text-xs">Link hiperlinkeado</Label>
            <Input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://docs.google.com/..." />
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
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Grupo de rutina</Label>
                <Select value={form.routine_group} onValueChange={(v) => setForm((f) => ({ ...f, routine_group: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROUTINE_GROUPS.map((group) => <SelectItem key={group.value} value={group.value}>{group.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Formato</Label>
                <Select value={form.source_format} onValueChange={(v) => setForm((f) => ({ ...f, source_format: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sheet">Excel / Google Sheets</SelectItem>
                    <SelectItem value="doc">Google Doc</SelectItem>
                    <SelectItem value="link">Link externo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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

function A4DocFrame({
  title,
  url,
  className,
}: {
  title: string;
  url: string;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full items-center justify-center", className)}>
      <div
        className="relative h-full max-w-full overflow-hidden rounded-sm border border-border/70 bg-white shadow-[0_22px_60px_rgba(0,0,0,0.38)]"
        style={{ aspectRatio: "210 / 297" }}
      >
        <iframe
          src={toEmbedUrl(url)}
          title={title}
          className="absolute inset-0 h-full w-full border-0 bg-white"
          allow="fullscreen"
        />
      </div>
    </div>
  );
}

function PlaybookFullscreenDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ContentItem | null;
}) {
  if (!item?.url) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed inset-2 sm:inset-3 left-auto top-auto translate-x-0 translate-y-0 w-auto max-w-none h-auto max-h-none flex flex-col gap-0 p-0 overflow-hidden sm:rounded-lg border-border bg-background">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 pr-12 shrink-0">
          <div className="min-w-0">
            <DialogTitle className="text-base truncate">{item.title}</DialogTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Vista ampliada · hoja A4 legible
              {item.map ? ` · ${item.map}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={item.url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="h-8">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir en Google
              </Button>
            </a>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
              <X className="h-3.5 w-3.5 mr-1.5" /> Cerrar
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-[radial-gradient(circle_at_top,hsl(var(--muted)/0.55),hsl(var(--background)))] p-3 sm:p-6">
          <A4DocFrame title={item.title} url={item.url} className="h-[min(92vh,1200px)] mx-auto" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function toEmbedUrl(url: string) {
  const normalized = normalizeUrl(url) ?? url;
  const doc = normalized.match(/docs\.google\.com\/document\/d\/([^/]+)/i)?.[1];
  if (doc) return `https://docs.google.com/document/d/${doc}/preview`;
  const sheet = normalized.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i)?.[1];
  if (sheet) return `https://docs.google.com/spreadsheets/d/${sheet}/preview`;
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
