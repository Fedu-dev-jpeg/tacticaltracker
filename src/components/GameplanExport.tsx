import { useState } from "react";
import { Strategy } from "@/components/Playbook";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileDown, Table2, ListChecks, Zap, FileText } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  strategies: Strategy[];
  selectedPlayer: string | null;
  playerDescriptions: Record<string, string>;
}

type LayoutId = "original" | "horizontal" | "vertical" | "cheatsheet";

const LAYOUTS: { id: LayoutId; label: string; desc: string; icon: typeof Table2 }[] = [
  { id: "original", label: "Clásico (Cards)", desc: "El formato original con tarjetas detalladas, ideal para revisión completa", icon: FileText },
  { id: "horizontal", label: "Tabla Horizontal", desc: "Tabla landscape limpia, una fila por estrategia, buena legibilidad", icon: Table2 },
  { id: "vertical", label: "Tabla Compacta", desc: "Portrait resumido, agrupa por mapa y side, fuente mediana legible", icon: ListChecks },
  { id: "cheatsheet", label: "Cheat Sheet", desc: "Referencia rápida en 2 columnas, solo nombre + tipo + tu rol", icon: Zap },
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

const headerHtml = (player: string | null, descs: Record<string, string>, count: number) => `
  <div style="text-align:center;margin-bottom:16px;border-bottom:3px solid #000;padding-bottom:10px;">
    <h1 style="font-size:28px;margin:0;letter-spacing:3px;">FOCUS</h1>
    <p style="font-size:11px;margin:4px 0;color:#333;">GAMEPLAN${player ? ` · ${player} (${descs[player] || ''})` : ''} · ${new Date().toLocaleDateString('es-AR')} · ${count} estrategias</p>
  </div>`;

const footerHtml = `<div style="text-align:center;margin-top:16px;font-size:8px;color:#888;border-top:1px solid #ccc;padding-top:6px;">FOCUS CS2 Team · Generado automáticamente</div>`;

// ═══════════════════════════════════
// ORIGINAL: Card-based (restored)
// ═══════════════════════════════════
function buildOriginal(strats: Strategy[], player: string | null, descs: Record<string, string>): string {
  const byMap = groupByMap(strats);

  const mapSections = Object.entries(byMap).map(([map, mapStrats], mapIdx) => {
    const ctS = sortByType(mapStrats.filter((s) => s.side === "CT"));
    const trS = sortByType(mapStrats.filter((s) => s.side === "TR"));

    const renderStrat = (s: Strategy) => `
      <div style="page-break-inside:avoid;border:2px solid #000;border-radius:4px;padding:10px 12px;margin-bottom:10px;background:#fff;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="border:2px solid #000;font-size:11px;padding:1px 6px;border-radius:3px;font-weight:900;letter-spacing:1px;">${s.side}</span>
          <span style="border:1px solid #666;font-size:10px;padding:1px 6px;border-radius:3px;color:#333;">${s.type}</span>
          <strong style="color:#000;font-size:14px;">${s.name}</strong>
          <span style="margin-left:auto;font-size:10px;font-weight:bold;color:#000;text-transform:uppercase;border:1px solid #000;padding:1px 5px;border-radius:3px;">${s.status}</span>
        </div>
        <p style="color:#222;font-size:12px;margin:0 0 8px;line-height:1.5;">${s.description}</p>
        ${player && s.playerRoles[player]
          ? `<div style="border:2px solid #000;border-radius:4px;padding:6px 10px;margin-bottom:6px;background:#f0f0f0;"><strong style="font-size:12px;">${player}</strong><span style="font-size:12px;margin-left:8px;">${s.playerRoles[player]}</span></div>`
          : (Object.keys(s.playerRoles).length > 0
            ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">${Object.entries(s.playerRoles).map(([p, r]) => `<span style="font-size:11px;background:#f0f0f0;padding:3px 8px;border-radius:4px;border:1px solid #999;"><strong>${p}</strong>: ${r}</span>`).join('')}</div>`
            : '')}
        ${s.notes ? `<p style="font-size:11px;color:#333;border-left:3px solid #000;padding-left:8px;margin:6px 0;line-height:1.4;">${s.notes}</p>` : ''}
      </div>`;

    const ctBlock = ctS.length > 0 ? `<h3 style="font-size:16px;margin:14px 0 8px;border-bottom:1px solid #000;padding-bottom:4px;">🛡️ CT SIDE — ${map}</h3>${ctS.map(renderStrat).join('')}` : '';
    const trBlock = trS.length > 0 ? `<div style="page-break-before:${ctS.length > 0 ? 'always' : 'auto'};"><h3 style="font-size:16px;margin:14px 0 8px;border-bottom:1px solid #000;padding-bottom:4px;">⚔️ TR SIDE — ${map}</h3>${trS.map(renderStrat).join('')}</div>` : '';

    return `<div style="page-break-before:${mapIdx === 0 ? 'auto' : 'always'};">
      <h2 style="font-size:22px;margin:0 0 10px;border-bottom:3px solid #000;padding-bottom:6px;letter-spacing:1px;">📋 ${map.toUpperCase()}</h2>
      ${ctBlock}${trBlock}
    </div>`;
  }).join('');

  return `<html><head><style>
    @page{size:A4;margin:15mm 18mm;}
    *{box-sizing:border-box;}
    body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000;margin:0;padding:16px;font-size:12px;line-height:1.4;}
    @media print{body{background:#fff;}}
  </style></head><body>
    ${headerHtml(player, descs, strats.length)}
    ${mapSections}
    ${footerHtml}
  </body></html>`;
}

// ═══════════════════════════════════════
// HORIZONTAL TABLE (Landscape, readable)
// ═══════════════════════════════════════
function buildHorizontal(strats: Strategy[], player: string | null, descs: Record<string, string>): string {
  const byMap = groupByMap(strats);

  const mapSections = Object.entries(byMap).map(([map, mapStrats], i) => {
    const sorted = sortByType(mapStrats);
    const rows = sorted.map(s => {
      const roles = player && s.playerRoles[player]
        ? `<strong>${player}:</strong> ${s.playerRoles[player]}`
        : Object.entries(s.playerRoles).map(([p, r]) => `<strong>${p}</strong>: ${r}`).join('<br/>');
      return `<tr>
        <td style="font-weight:800;text-align:center;color:${s.side === 'CT' ? '#1565c0' : '#c62828'}">${s.side}</td>
        <td style="white-space:nowrap;">${s.type}</td>
        <td style="font-weight:700;font-size:12px;">${s.name}</td>
        <td>${s.description}</td>
        <td style="font-size:10px;">${roles}</td>
        <td style="font-size:10px;font-style:italic;">${s.notes || '—'}</td>
      </tr>`;
    }).join('');

    return `<div style="page-break-before:${i > 0 ? 'always' : 'auto'};margin-bottom:20px;">
      <h2 style="font-size:18px;margin:0 0 8px;border-bottom:3px solid #000;padding-bottom:4px;">📋 ${map.toUpperCase()}</h2>
      <table><thead><tr>
        <th style="width:40px;">Side</th>
        <th style="width:80px;">Tipo</th>
        <th style="width:140px;">Nombre</th>
        <th style="width:35%;">Descripción</th>
        <th style="width:20%;">Roles</th>
        <th style="width:15%;">Notas</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }).join('');

  return `<html><head><style>
    @page{size:A4 landscape;margin:12mm 14mm;}
    *{box-sizing:border-box;}
    body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0;padding:12px;line-height:1.4;}
    table{width:100%;border-collapse:collapse;margin-bottom:10px;}
    th{background:#1a1a1a;color:#fff;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;}
    td{border:1px solid #ccc;padding:6px 8px;vertical-align:top;}
    tr:nth-child(even){background:#f8f8f8;}
    tr:hover{background:#f0f0f0;}
    @media print{body{background:#fff;}}
  </style></head><body>
    ${headerHtml(player, descs, strats.length)}
    ${mapSections}
    ${footerHtml}
  </body></html>`;
}

// ═══════════════════════════════════════
// VERTICAL COMPACT (Portrait, readable)
// ═══════════════════════════════════════
function buildVertical(strats: Strategy[], player: string | null, descs: Record<string, string>): string {
  const byMap = groupByMap(strats);

  const mapSections = Object.entries(byMap).map(([map, mapStrats], i) => {
    const ct = sortByType(mapStrats.filter(s => s.side === "CT"));
    const tr = sortByType(mapStrats.filter(s => s.side === "TR"));

    const renderSide = (side: string, list: Strategy[]) => {
      if (list.length === 0) return '';
      const sideColor = side === "CT" ? "#1565c0" : "#c62828";
      const sideBg = side === "CT" ? "#e3f2fd" : "#ffebee";
      const rows = list.map(s => {
        const role = player && s.playerRoles[player] ? s.playerRoles[player] : Object.entries(s.playerRoles).map(([p,r]) => `${p}: ${r}`).join(' · ');
        return `<div style="padding:8px 10px;border-bottom:1px solid #ddd;page-break-inside:avoid;">
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:3px;">
            <span style="font-size:9px;color:#666;min-width:60px;">${s.type}</span>
            <span style="font-weight:700;font-size:13px;">${s.name}</span>
          </div>
          <div style="font-size:11px;color:#333;margin-bottom:2px;">${s.description}</div>
          <div style="display:flex;gap:12px;font-size:10px;">
            <span style="color:#555;">👥 ${role}</span>
            ${s.notes ? `<span style="color:#777;font-style:italic;">💡 ${s.notes}</span>` : ''}
          </div>
        </div>`;
      }).join('');

      return `<div style="margin-bottom:10px;">
        <div style="background:${sideBg};color:${sideColor};font-weight:700;font-size:12px;padding:5px 10px;border-left:4px solid ${sideColor};">
          ${side === "CT" ? "🛡️" : "⚔️"} ${side} SIDE
        </div>
        ${rows}
      </div>`;
    };

    return `<div style="page-break-before:${i > 0 ? 'always' : 'auto'};margin-bottom:16px;">
      <h2 style="font-size:16px;margin:0 0 8px;border-bottom:3px solid #000;padding-bottom:4px;">${map.toUpperCase()}</h2>
      ${renderSide("CT", ct)}
      ${renderSide("TR", tr)}
    </div>`;
  }).join('');

  return `<html><head><style>
    @page{size:A4 portrait;margin:12mm 16mm;}
    *{box-sizing:border-box;}
    body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0;padding:14px;line-height:1.4;}
    @media print{body{background:#fff;}}
  </style></head><body>
    ${headerHtml(player, descs, strats.length)}
    ${mapSections}
    ${footerHtml}
  </body></html>`;
}

// ═══════════════════════════════════════
// CHEAT SHEET (2-col, quick reference)
// ═══════════════════════════════════════
function buildCheatSheet(strats: Strategy[], player: string | null, descs: Record<string, string>): string {
  const byMap = groupByMap(strats);

  const mapBlocks = Object.entries(byMap).map(([map, mapStrats]) => {
    const ct = sortByType(mapStrats.filter(s => s.side === "CT"));
    const tr = sortByType(mapStrats.filter(s => s.side === "TR"));

    const renderList = (side: string, list: Strategy[]) => {
      if (list.length === 0) return '';
      const color = side === "CT" ? "#1565c0" : "#c62828";
      const items = list.map(s => {
        const role = player && s.playerRoles[player] ? ` → ${s.playerRoles[player]}` : '';
        return `<div style="padding:3px 0;border-bottom:1px dotted #ccc;display:flex;gap:6px;align-items:baseline;">
          <span style="font-size:9px;color:#888;min-width:50px;">${s.type}</span>
          <span style="font-weight:700;font-size:11px;">${s.name}</span>
          ${role ? `<span style="font-size:10px;color:#555;">${role}</span>` : ''}
        </div>`;
      }).join('');
      return `<div style="margin-bottom:4px;">
        <div style="color:${color};font-weight:700;font-size:10px;margin-bottom:2px;">${side === "CT" ? "🛡️" : "⚔️"} ${side}</div>
        ${items}
      </div>`;
    };

    return `<div style="break-inside:avoid;margin-bottom:12px;border:1px solid #999;border-radius:4px;padding:8px;">
      <div style="font-weight:900;font-size:13px;border-bottom:2px solid #000;padding-bottom:3px;margin-bottom:5px;">${map.toUpperCase()}</div>
      ${renderList("CT", ct)}
      ${renderList("TR", tr)}
    </div>`;
  }).join('');

  return `<html><head><style>
    @page{size:A4 portrait;margin:10mm 12mm;}
    *{box-sizing:border-box;}
    body{font-family:Arial,sans-serif;font-size:10px;color:#000;margin:0;padding:8px;}
    .content{columns:2;column-gap:16px;}
    @media print{body{background:#fff;}}
  </style></head><body>
    <div style="text-align:center;margin-bottom:8px;border-bottom:2px solid #000;padding-bottom:6px;">
      <span style="font-size:18px;font-weight:900;letter-spacing:2px;">FOCUS · CHEAT SHEET</span>
      <span style="font-size:9px;color:#666;margin-left:10px;">${player || 'Team'} · ${new Date().toLocaleDateString('es-AR')}</span>
    </div>
    <div class="content">${mapBlocks}</div>
    ${footerHtml}
  </body></html>`;
}

const builders: Record<LayoutId, typeof buildOriginal> = {
  original: buildOriginal,
  horizontal: buildHorizontal,
  vertical: buildVertical,
  cheatsheet: buildCheatSheet,
};

export default function GameplanExport({ open, onClose, strategies, selectedPlayer, playerDescriptions }: Props) {
  const [selected, setSelected] = useState<LayoutId>("original");

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
          <p className="text-sm text-muted-foreground">Elegí el formato de impresión:</p>

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
