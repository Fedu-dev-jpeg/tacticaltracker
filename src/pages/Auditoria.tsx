import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShieldAlert } from "lucide-react";

type AuditRow = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  user_id: string | null;
  user_email: string | null;
  changed_at: string;
  old_data: any;
  new_data: any;
};

const TABLE_LABELS: Record<string, string> = {
  matches: "Partidas / Demos",
  team_objectives: "Objetivos",
  agenda_events: "Agenda",
};

const ACTION_LABELS: Record<AuditRow["action"], string> = {
  INSERT: "Creación",
  UPDATE: "Edición",
  DELETE: "Eliminación",
};

const ACTION_VARIANT: Record<AuditRow["action"], "default" | "secondary" | "destructive"> = {
  INSERT: "default",
  UPDATE: "secondary",
  DELETE: "destructive",
};

export default function Auditoria() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [detail, setDetail] = useState<AuditRow | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(500);
      if (!cancelled) {
        if (!error && data) setRows(data as AuditRow[]);
        setLoading(false);
      }
    })();

    const channel = supabase
      .channel("audit_log_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_log" },
        (payload) => {
          setRows((prev) => [payload.new as AuditRow, ...prev].slice(0, 500));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  if (roleLoading) {
    return <div className="text-muted-foreground text-sm">Cargando…</div>;
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-3 text-muted-foreground">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          Solo los administradores pueden ver el panel de auditoría.
        </CardContent>
      </Card>
    );
  }

  const filtered = rows.filter(
    (r) =>
      (tableFilter === "all" || r.table_name === tableFilter) &&
      (actionFilter === "all" || r.action === actionFilter),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-heading font-bold tracking-wide">Auditoría</h1>
        <p className="text-sm text-muted-foreground">
          Registro de creaciones, ediciones y eliminaciones en partidas, demos, objetivos y agenda.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={tableFilter} onValueChange={setTableFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Entidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las entidades</SelectItem>
            {Object.entries(TABLE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Acción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las acciones</SelectItem>
            <SelectItem value="INSERT">Creación</SelectItem>
            <SelectItem value="UPDATE">Edición</SelectItem>
            <SelectItem value="DELETE">Eliminación</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Eventos ({filtered.length}
            {rows.length >= 500 && " · últimos 500"})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[170px]">Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Registro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Sin eventos.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => setDetail(r)}
                    >
                      <TableCell className="text-xs font-mono">
                        {new Date(r.changed_at).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.user_email ?? (
                          <span className="text-muted-foreground italic">Sistema</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {TABLE_LABELS[r.table_name] ?? r.table_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ACTION_VARIANT[r.action]}>{ACTION_LABELS[r.action]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-[220px]">
                        {r.record_id ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del evento</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Fecha</div>
                  <div>{new Date(detail.changed_at).toLocaleString("es-AR")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Usuario</div>
                  <div>{detail.user_email ?? "Sistema"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Entidad</div>
                  <div>{TABLE_LABELS[detail.table_name] ?? detail.table_name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Acción</div>
                  <div>
                    <Badge variant={ACTION_VARIANT[detail.action]}>
                      {ACTION_LABELS[detail.action]}
                    </Badge>
                  </div>
                </div>
              </div>

              {detail.old_data && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Antes
                  </div>
                  <pre className="bg-muted/40 rounded-md p-3 text-[11px] overflow-x-auto">
                    {JSON.stringify(detail.old_data, null, 2)}
                  </pre>
                </div>
              )}
              {detail.new_data && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Después
                  </div>
                  <pre className="bg-muted/40 rounded-md p-3 text-[11px] overflow-x-auto">
                    {JSON.stringify(detail.new_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
