import { useState } from "react";
import { Strategy } from "@/components/Playbook";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileDown, Table2, ListChecks, Zap, Monitor } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  strategies: Strategy[];
  selectedPlayer: string | null;
  playerDescriptions: Record<string, string>;
}

type LayoutId = "horizontal" | "vertical" | "cheatsheet" | "steam";

const LAYOUTS: { id: LayoutId; label: string; desc: string; icon: typeof Table2 }[] = [
  { id: "horizontal", label: "Tabla Horizontal", desc: "Tabla completa con toda la info, ideal para imprimir en A4 landscape", icon: Table2 },
  { id: "vertical", label: "Tabla Vertical", desc: "Resumida, 1 strat por fila, ocupa menos espacio", icon: ListChecks },
  { id: "cheatsheet", label: "Cheat Sheet", desc: "Ultra compacto en 2 columnas, ideal para tener al lado del monitor", icon: Zap },
  { id: "steam", label: "Steam Overlay", desc: "Fondo oscuro, letra grande, pensado para leer en el overlay de Steam", icon: Monitor },
];

function sortByType(strats: Strategy[]): Strategy[] {
  const order = ["Pistol", "Anti-Eco", "Forzado", "Default", "Exec", "Setup", "Dominio", "Retake", "Postplant", "Finalización", "Calls de base", "Sorpresa"];
  return [...strats].sort((a, b) => {
    const ai = order.indexOf(a.type);
    const bi = order.indexOf(b.type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function groupByMap(strats: Strategy[]): Record<string, Strategy[]> {
  const byMap: Record<string, Strategy[]> = {};
  strats.forEach((s) => { if (!byMap[s.map]) byMap[s.map] = []; byMap[s.map].push(s); });
  return byMap;
}

function rolesStr(s: Strategy, player: string | null, descs: Record<string, string>): string {
  if (player && s.playerRoles[player]) return `${player}: ${s.playerRoles[player]}`;
  return Object.entries(s.playerRoles).map(([p, r]) => `${p}: ${r}`).join(" · ");
}

function rolesCompact(s: Strategy, player: string | null): string {
  if (player && s.playerRoles[player]) return s.playerRoles[player];
  return Object.entries(s.playerRoles).map(([p, r]) => `${p[0]}:${r}`).join(" ");
}

// ═══════════════════════════════════════
// LAYOUT 1: Horizontal Table (Landscape)
// ═══════════════════════════════════════
function buildHorizontal(strats: Strategy[], player: string | null, descs: Record<string, string>): string {
  const byMap = groupByMap(strats);

  const mapSections = Object.entries(byMap).map(([map, mapStrats]) => {
    const ct = sortByType(mapStrats.filter(s => s.side === "CT"));
    const tr = sortByType(mapStrats.filter(s => s.side === "TR"));

    const renderRows = (list: Strategy[]) => list.map(s => `
      <tr>
        <td style="font-weight:700;white-space:nowrap;">${s.side}</td>
        <td>${s.type}</td>
        <td style="font-weight:700;">${s.name}</td>
        <td style="max-width:220px;">${s.description}</td>
        <td style="font-size:9px;">${rolesStr(s, player, descs)}</td>
        <td style="font-style:italic;font-size:9px;">${s.notes || '—'}</td>
        <td style="text-align:center;font-size:9px;">${s.status}</td>
      </tr>`).join('');

    return `
      <div style="page-break-inside:avoid;margin-bottom:16px;">
        <h2 style="font-size:16px;margin:12px 0 6px;border-bottom:2px solid #000;padding-bottom:3px;">📋 ${map.toUpperCase()}</h2>
        <table>
          <thead><tr>
            <th style="width:35px;">Side</th><th style="width:70px;">Tipo</th><th style="width:120px;">Nombre</th>
            <th>Descripción</th><th>Roles</th><th>Notas</th><th style="width:55px;">Estado</th>
          </tr></thead>
          <tbody>
            ${ct.length > 0 ? renderRows(ct) : ''}
            ${ct.length > 0 && tr.length > 0 ? '<tr><td colspan="7" style="border:none;height:6px;background:transparent;"></td></tr>' : ''}
            ${tr.length > 0 ? renderRows(tr) : ''}
          </tbody>
        </table>
      </div>`;
  }).join('');

  return `<html><head><style>
    @page{size:A4 landscape;margin:10mm 12mm;}
    *{box-sizing:border-box;}
    body{font-family:Arial,sans-serif;font-size:10px;color:#000;margin:0;padding:10px;}
    table{width:100%;border-collapse:collapse;margin-bottom:8px;}
    th,td{border:1px solid #333;padding:4px 6px;text-align:left;vertical-align:top;}
    th{background:#222;color:#fff;font-size:9px;text-transform:uppercase;}
    tr:nth-child(even){background:#f5f5f5;}
  </style></head><body>
    <div style="text-align:center;margin-bottom:10px;">
      <h1 style="font-size:22px;margin:0;letter-spacing:2px;">FOCUS · GAMEPLAN</h1>
      <p style="font-size:9px;color:#555;margin:2px 0;">${player ? `${player} (${descs[player] || ''}) · ` : ''}${new Date().toLocaleDateString('es-AR')} · ${strats.length} estrategias</p>
    </div>
    ${mapSections}
    <div style="text-align:center;font-size:8px;color:#999;margin-top:8px;">FOCUS CS2 Team · Generado automáticamente</div>
  </body></html>`;
}

// ═══════════════════════════════════
// LAYOUT 2: Vertical Compact Table
// ═══════════════════════════════════
function buildVertical(strats: Strategy[], player: string | null, descs: Record<string, string>): string {
  const byMap = groupByMap(strats);

  const mapSections = Object.entries(byMap).map(([map, mapStrats]) => {
    const ct = sortByType(mapStrats.filter(s => s.side === "CT"));
    const tr = sortByType(mapStrats.filter(s => s.side === "TR"));

    const renderBlock = (side: string, list: Strategy[]) => {
      if (list.length === 0) return '';
      const emoji = side === "CT" ? "🛡️" : "⚔️";
      const rows = list.map(s => `
        <tr>
          <td style="font-size:8px;color:#666;">${s.type}</td>
          <td style="font-weight:700;">${s.name}</td>
          <td style="font-size:8px;">${rolesCompact(s, player)}</td>
          <td style="font-size:8px;font-style:italic;">${s.notes ? s.notes.substring(0, 60) + (s.notes.length > 60 ? '…' : '') : ''}</td>
        </tr>`).join('');
      return `
        <div style="margin-bottom:6px;">
          <div style="font-size:10px;font-weight:700;margin:4px 0 2px;color:${side === 'CT' ? '#1a5276' : '#922b21'};">${emoji} ${side}</div>
          <table><thead><tr><th>Tipo</th><th>Nombre</th><th>Roles</th><th>Notas</th></tr></thead><tbody>${rows}</tbody></table>
        </div>`;
    };

    return `
      <div style="page-break-inside:avoid;margin-bottom:12px;">
        <h3 style="font-size:13px;margin:8px 0 3px;border-bottom:2px solid #000;padding-bottom:2px;">${map.toUpperCase()}</h3>
        ${renderBlock("CT", ct)}
        ${renderBlock("TR", tr)}
      </div>`;
  }).join('');

  return `<html><head><style>
    @page{size:A4 portrait;margin:10mm 14mm;}
    *{box-sizing:border-box;}
    body{font-family:Arial,sans-serif;font-size:9px;color:#000;margin:0;padding:10px;}
    table{width:100%;border-collapse:collapse;}
    th,td{border:1px solid #666;padding:2px 5px;text-align:left;vertical-align:top;}
    th{background:#333;color:#fff;font-size:8px;text-transform:uppercase;}
    tr:nth-child(even){background:#f0f0f0;}
  </style></head><body>
    <div style="text-align:center;margin-bottom:8px;">
      <h1 style="font-size:18px;margin:0;letter-spacing:2px;">FOCUS · GAMEPLAN RESUMIDO</h1>
      <p style="font-size:8px;color:#555;margin:2px 0;">${player ? `${player} · ` : ''}${new Date().toLocaleDateString('es-AR')}</p>
    </div>
    ${mapSections}
    <div style="text-align:center;font-size:7px;color:#999;margin-top:6px;">FOCUS CS2 Team</div>
  </body></html>`;
}

// ═══════════════════════════════════
// LAYOUT 3: Cheat Sheet (2 columns)
// ═══════════════════════════════════
function buildCheatSheet(strats: Strategy[], player: string | null, descs: Record<string, string>): string {
  const byMap = groupByMap(strats);

  const mapBlocks = Object.entries(byMap).map(([map, mapStrats]) => {
    const ct = sortByType(mapStrats.filter(s => s.side === "CT"));
    const tr = sortByType(mapStrats.filter(s => s.side === "TR"));

    const renderMini = (s: Strategy) => {
      const role = player && s.playerRoles[player] ? ` → ${s.playerRoles[player]}` : '';
      return `<div style="margin-bottom:3px;padding:2px 4px;border-left:3px solid ${s.side === 'CT' ? '#2980b9' : '#c0392b'};background:${s.side === 'CT' ? '#eaf2f8' : '#fdedec'};">
        <span style="font-weight:700;font-size:9px;">${s.type}</span> <span style="font-weight:900;font-size:10px;">${s.name}</span>${role ? `<span style="font-size:8px;color:#555;">${role}</span>` : ''}
        ${s.notes ? `<div style="font-size:7px;color:#444;margin-top:1px;">${s.notes.substring(0, 80)}${s.notes.length > 80 ? '…' : ''}</div>` : ''}
      </div>`;
    };

    const ctHtml = ct.length > 0 ? `<div style="font-size:9px;font-weight:700;color:#2980b9;margin:3px 0 1px;">🛡️ CT</div>${ct.map(renderMini).join('')}` : '';
    const trHtml = tr.length > 0 ? `<div style="font-size:9px;font-weight:700;color:#c0392b;margin:3px 0 1px;">⚔️ TR</div>${tr.map(renderMini).join('')}` : '';

    return `<div style="break-inside:avoid;margin-bottom:8px;">
      <div style="font-size:11px;font-weight:900;border-bottom:2px solid #000;margin-bottom:3px;padding-bottom:1px;">${map.toUpperCase()}</div>
      ${ctHtml}${trHtml}
    </div>`;
  }).join('');

  return `<html><head><style>
    @page{size:A4 portrait;margin:8mm 10mm;}
    *{box-sizing:border-box;}
    body{font-family:Arial,sans-serif;font-size:8px;color:#000;margin:0;padding:6px;columns:2;column-gap:14px;}
  </style></head><body>
    <div style="column-span:all;text-align:center;margin-bottom:6px;border-bottom:2px solid #000;padding-bottom:4px;">
      <span style="font-size:16px;font-weight:900;letter-spacing:2px;">FOCUS CHEAT SHEET</span>
      <span style="font-size:8px;color:#666;margin-left:8px;">${player || 'Team'} · ${new Date().toLocaleDateString('es-AR')}</span>
    </div>
    ${mapBlocks}
  </body></html>`;
}

// ═══════════════════════════════════════
// LAYOUT 4: Steam Overlay (dark, large)
// ═══════════════════════════════════════
function buildSteamOverlay(strats: Strategy[], player: string | null, descs: Record<string, string>): string {
  const byMap = groupByMap(strats);

  const mapSections = Object.entries(byMap).map(([map, mapStrats]) => {
    const ct = sortByType(mapStrats.filter(s => s.side === "CT"));
    const tr = sortByType(mapStrats.filter(s => s.side === "TR"));

    const renderCard = (s: Strategy) => {
      const sideColor = s.side === "CT" ? "#4fc3f7" : "#ef5350";
      const role = player && s.playerRoles[player] ? s.playerRoles[player] : '';
      return `<div style="background:#1e1e1e;border:1px solid ${sideColor};border-radius:6px;padding:8px 10px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="color:${sideColor};font-weight:900;font-size:11px;border:1px solid ${sideColor};padding:1px 5px;border-radius:3px;">${s.side}</span>
          <span style="color:#aaa;font-size:10px;">${s.type}</span>
          <span style="color:#fff;font-weight:700;font-size:13px;">${s.name}</span>
          ${role ? `<span style="margin-left:auto;color:#ED7D31;font-size:11px;font-weight:600;">→ ${role}</span>` : ''}
        </div>
        <div style="color:#ccc;font-size:11px;line-height:1.4;">${s.description}</div>
        ${s.notes ? `<div style="color:#999;font-size:10px;border-left:2px solid #ED7D31;padding-left:6px;margin-top:4px;">${s.notes}</div>` : ''}
      </div>`;
    };

    const ctHtml = ct.length > 0 ? `<div style="color:#4fc3f7;font-size:12px;font-weight:700;margin:8px 0 4px;">🛡️ CT SIDE</div>${ct.map(renderCard).join('')}` : '';
    const trHtml = tr.length > 0 ? `<div style="color:#ef5350;font-size:12px;font-weight:700;margin:8px 0 4px;">⚔️ TR SIDE</div>${tr.map(renderCard).join('')}` : '';

    return `<div style="margin-bottom:16px;">
      <h2 style="color:#ED7D31;font-size:16px;margin:0 0 6px;border-bottom:1px solid #444;padding-bottom:4px;">${map.toUpperCase()}</h2>
      ${ctHtml}${trHtml}
    </div>`;
  }).join('');

  return `<html><head><style>
    @page{size:A4 portrait;margin:10mm 14mm;}
    *{box-sizing:border-box;}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#121212;color:#fff;margin:0;padding:14px;font-size:11px;}
    @media print{body{background:#121212;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  </style></head><body>
    <div style="text-align:center;margin-bottom:12px;border-bottom:1px solid #ED7D31;padding-bottom:8px;">
      <h1 style="font-size:24px;margin:0;color:#ED7D31;letter-spacing:3px;">FOCUS</h1>
      <p style="font-size:10px;color:#888;margin:2px 0;">GAMEPLAN${player ? ` · ${player}` : ''} · ${new Date().toLocaleDateString('es-AR')}</p>
    </div>
    ${mapSections}
    <div style="text-align:center;font-size:8px;color:#555;margin-top:10px;border-top:1px solid #333;padding-top:6px;">FOCUS CS2 Team · Steam Overlay Ready</div>
  </body></html>`;
}

const builders: Record<LayoutId, typeof buildHorizontal> = {
  horizontal: buildHorizontal,
  vertical: buildVertical,
  cheatsheet: buildCheatSheet,
  steam: buildSteamOverlay,
};

export default function GameplanExport({ open, onClose, strategies, selectedPlayer, playerDescriptions }: Props) {
  const [selected, setSelected] = useState<LayoutId>("horizontal");

  const handleExport = () => {
    if (strategies.length === 0) { toast.error("No hay estrategias seleccionadas"); return; }
    const html = builders[selected](strategies, selectedPlayer, playerDescriptions);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    }
    toast.success("Gameplan listo para imprimir");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <FileDown className="h-5 w-5 text-accent" />
            Exportar Gameplan ({strategies.length} strats)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Elegí el formato que mejor se adapte a tu uso:</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LAYOUTS.map((layout) => {
              const Icon = layout.icon;
              const isSelected = selected === layout.id;
              return (
                <button
                  key={layout.id}
                  onClick={() => setSelected(layout.id)}
                  className={cn(
                    "text-left p-3 rounded-lg border-2 transition-all",
                    isSelected
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent/40 bg-card"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("h-4 w-4", isSelected ? "text-accent" : "text-muted-foreground")} />
                    <span className="font-heading font-bold text-sm">{layout.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{layout.desc}</p>
                </button>
              );
            })}
          </div>

          <Button onClick={handleExport} className="w-full gradient-accent text-white font-heading">
            <FileDown className="h-4 w-4 mr-2" /> Imprimir / Guardar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
