import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  Activity,
  BarChart3,
  BookOpen,
  ExternalLink,
  GraduationCap,
  Link as LinkIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MAPS, MapName } from "@/types/match";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type ContentCategory = "playbook" | "class" | "routine";

type ContentItem = {
  id: string;
  category: ContentCategory;
  map: string | null;
  title: string;
  url: string | null;
  description: string;
  content_type: string | null;
  status: "draft" | "ready" | "archived";
  created_at: string;
};

type FormState = {
  category: ContentCategory;
  map: string;
  title: string;
  url: string;
  description: string;
  content_type: string;
  status: "draft" | "ready" | "archived";
};

const EMPTY_FORM: FormState = {
  category: "playbook",
  map: "Nuke",
  title: "",
  url: "",
  description: "",
  content_type: "guia-playbook",
  status: "draft",
};

const CLASS_TYPES = [
  { value: "tacticas", label: "Tácticas por mapa" },
  { value: "demo-retake", label: "Correcciones demo / retake" },
  { value: "nuevo-contenido", label: "Nuevos contenidos" },
];

const STATUS_LABEL: Record<ContentItem["status"], string> = {
  draft: "Draft",
  ready: "Ready",
  archived: "Archivado",
};

export default function Contenidos() {
  const { isAdmin, isCoach } = useUserRole();
  const canManage = isAdmin || isCoach;
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

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
      status: form.status,
    };
    const { error } = editing
      ? await supabase.from("content_items").update(payload).eq("id", editing.id)
      : await supabase.from("content_items").insert(payload);
    if (error) {
      toast.error("No se pudo guardar", { description: error.message });
      return;
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

      <Tabs defaultValue="playbooks" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="playbooks">Playbooks</TabsTrigger>
          <TabsTrigger value="classes">Clases</TabsTrigger>
          <TabsTrigger value="routines">Rutinas</TabsTrigger>
        </TabsList>

        <TabsContent value="playbooks">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {MAPS.map((map) => {
              const mapItems = byCategory.playbook.filter((item) => item.map === map);
              return (
                <Card key={map} className="card-glow">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Guía playbook {map}</CardTitle>
                      {canManage && (
                        <Button variant="ghost" size="sm" onClick={() => openNew("playbook", map)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ContentList items={mapItems} loading={loading} canManage={canManage} onEdit={openEdit} onDelete={remove} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="classes">
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
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="routines">
          <Card className="card-glow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-accent" />
                  Rutinas generadas
                </CardTitle>
                {canManage && (
                  <Button onClick={() => openNew("routine")} size="sm">
                    <Plus className="h-4 w-4 mr-2" /> Nueva rutina
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ContentList items={byCategory.routine} loading={loading} canManage={canManage} onEdit={openEdit} onDelete={remove} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ContentDialog open={open} onOpenChange={setOpen} form={form} setForm={setForm} editing={editing} onSave={save} />
    </div>
  );
}

function ContentList({
  items,
  loading,
  canManage,
  onEdit,
  onDelete,
}: {
  items: ContentItem[];
  loading: boolean;
  canManage: boolean;
  onEdit: (item: ContentItem) => void;
  onDelete: (item: ContentItem) => void;
}) {
  if (loading) return <p className="text-sm text-muted-foreground py-4">Cargando...</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground py-4">Sin contenidos todavía.</p>;
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="rounded-md border border-border bg-card/70 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium">{item.title}</h3>
                <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[item.status]}</Badge>
                {item.map && <Badge className="text-[10px] bg-accent/15 text-accent border-accent/30">{item.map}</Badge>}
              </div>
              {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-accent hover:underline">
                  <LinkIcon className="h-3 w-3" /> Abrir material <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {canManage && (
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => onEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(item)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
              </div>
            )}
          </div>
        </div>
      ))}
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  editing: ContentItem | null;
  onSave: () => void;
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

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
