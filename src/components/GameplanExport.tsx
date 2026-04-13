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
  { id: "original", label: "Clásico (Cards)", desc: "Tarjetas detalladas, ideal para revisión completa", icon: FileText },
  { id: "horizontal", label: "Tabla Horizontal", desc: "Landscape, una página CT y otra TT por mapa", icon: Table2 },
  { id: "vertical", label: "Tabla Compacta", desc: "Portrait, alto contraste B&N, legible impreso", icon: ListChecks },
  { id: "cheatsheet", label: "Cheat Sheet", desc: "Todo en una sola página A4, referencia rápida", icon: Zap },
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
// ORIGINAL: Card-based
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

    const ctBlock = ctS.length > 0 ? `<h3 style="font-size:16px;margin:14px 0 8px;border-bottom:1px solid #000;padding-bottom:4px;">CT SIDE — ${map}</h3>${ctS.map(renderStrat).join('')}` : '';
    const trBlock = trS.length > 0 ? `<div style="page-break-before:${ctS.length > 0 ? 'always' : 'auto'};"><h3 style="font-size:16px;margin:14px 0 8px;border-bottom:1px solid #000;padding-bottom:4px;">TR SIDE — ${map}</h3>${trS.map(renderStrat).join('')}</div>` : '';

    return `<div style="page-break-before:${mapIdx === 0 ? 'auto' : 'always'};">
      <h2 style="font-size:22px;margin:0 0 10px;border-bottom:3px solid #000;padding-bottom:6px;letter-spacing:1px;">${map.toUpperCase()}</h2>
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
// HORIZONTAL TABLE — CT page + TT page per map
// ═══════════════════════════════════════
function buildHorizontal(strats: Strategy[], player: string | null, descs: Record<string, string>): string {
  const byMap = groupByMap(strats);

  const buildTable = (side: string, list: Strategy[], map: string) => {
    if (list.length === 0) return '';
    const rows = list.map(s => {
      const roles = player && s.playerRoles[player]
        ? `<strong>${player}:</strong> ${s.playerRoles[player]}`
        : Object.entries(s.playerRoles).map(([p, r]) => `<strong>${p}</strong>: ${r}`).join(' · ');
      return `<tr>
        <td style="white-space:nowrap;font-weight:700;">${s.type}</td>
        <td style="font-weight:700;font-size:13px;">${s.name}</td>
        <td style="font-size:11px;">${s.description}</td>
        <td style="font-size:11px;">${roles}</td>
        <td style="font-size:10px;font-style:italic;">${s.notes || '—'}</td>
      </tr>`;
    }).join('');

    const sideLabel = side === "CT" ? "CT SIDE" : "TR SIDE";
    const borderColor = side === "CT" ? "#1565c0" : "#c62828";

    return `<div style="page-break-after:always;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;border-bottom:3px solid ${borderColor};padding-bottom:6px;">
        <span style="font-size:20px;font-weight:900;letter-spacing:1px;">${map.toUpperCase()}</span>
        <span style="font-size:14px;font-weight:800;color:${borderColor};">${sideLabel}</span>
        <span style="font-size:11px;color:#666;">${list.length} strats</span>
      </div>
      <table><thead><tr>
        <th style="width:70px;">Tipo</th>
        <th style="width:130px;">Nombre</th>
        <th style="width:38%;">Descripción</th>
        <th style="width:22%;">Roles</th>
        <th style="width:15%;">Notas</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  };

  const pages = Object.entries(byMap).map(([map, mapStrats]) => {
    const ct = sortByType(mapStrats.filter(s => s.side === "CT"));
    const tr = sortByType(mapStrats.filter(s => s.side === "TR"));
    return buildTable("CT", ct, map) + buildTable("TR", tr, map);
  }).join('');

  return `<html><head><style>
    @page{size:A4 landscape;margin:10mm 12mm;}
    *{box-sizing:border-box;}
    body{font-family:Arial,sans-serif;font-size:12px;color:#000;margin:0;padding:10px;line-height:1.4;}
    table{width:100%;border-collapse:collapse;margin-bottom:10px;}
    th{background:#000;color:#fff;padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;}
    td{border:1px solid #999;padding:5px 8px;vertical-align:top;}
    tr:nth-child(even){background:#f0f0f0;}
    @media print{body{background:#fff;}}
  </style></head><body>
    ${headerHtml(player, descs, strats.length)}
    ${pages}
  </body></html>`;
}

// ═══════════════════════════════════════
// VERTICAL COMPACT — B&W high contrast
// ═══════════════════════════════════════
function buildVertical(strats: Strategy[], player: string | null, descs: Record<string, string>): string {
  const byMap = groupByMap(strats);

  const mapSections = Object.entries(byMap).map(([map, mapStrats], i) => {
    const ct = sortByType(mapStrats.filter(s => s.side === "CT"));
    const tr = sortByType(mapStrats.filter(s => s.side === "TR"));

    const renderSide = (side: string, list: Strategy[]) => {
      if (list.length === 0) return '';
      const rows = list.map(s => {
        const role = player && s.playerRoles[player]
          ? s.playerRoles[player]
          : Object.entries(s.playerRoles).map(([p, r]) => `${p}: ${r}`).join(' | ');
        return `<tr>
          <td style="font-size:10px;color:#333;white-space:nowrap;">${s.type}</td>
          <td style="font-weight:800;font-size:12px;">${s.name}</td>
          <td style="font-size:11px;">${s.description}</td>
          <td style="font-size:10px;">${role}</td>
          <td style="font-size:9px;font-style:italic;color:#444;">${s.notes || ''}</td>
        </tr>`;
      }).join('');

      return `<div style="margin-bottom:8px;">
        <div style="background:#000;color:#fff;font-weight:800;font-size:11px;padding:4px 8px;letter-spacing:1px;">
          ${side} SIDE
        </div>
        <table><thead><tr>
          <th style="width:60px;">Tipo</th>
          <th style="width:100px;">Nombre</th>
          <th>Descripción</th>
          <th style="width:22%;">Roles</th>
          <th style="width:12%;">Notas</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    };

    return `<div style="page-break-before:${i > 0 ? 'always' : 'auto'};margin-bottom:12px;">
      <h2 style="font-size:16px;margin:0 0 6px;border-bottom:3px solid #000;padding-bottom:3px;letter-spacing:1px;">${map.toUpperCase()}</h2>
      ${renderSide("CT", ct)}
      ${renderSide("TR", tr)}
    </div>`;
  }).join('');

  return `<html><head><style>
    @page{size:A4 portrait;margin:10mm 12mm;}
    *{box-sizing:border-box;}
    body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0;padding:10px;line-height:1.3;}
    table{width:100%;border-collapse:collapse;}
    th{background:#333;color:#fff;padding:3px 6px;text-align:left;font-size:9px;text-transform:uppercase;border:1px solid #000;}
    td{border:1px solid #666;padding:3px 6px;vertical-align:top;}
    tr:nth-child(odd){background:#fff;}
    tr:nth-child(even){background:#e8e8e8;}
    @media print{body{background:#fff;}}
  </style></head><body>
    ${headerHtml(player, descs, strats.length)}
    ${mapSections}
    ${footerHtml}
  </body></html>`;
}

// ═══════════════════════════════════════
// CHEAT SHEET — Everything on 1 A4 page
// ═══════════════════════════════════════
function buildCheatSheet(strats: Strategy[], player: string | null, descs: Record<string, string>): string {
  const byMap = groupByMap(strats);
  const totalStrats = strats.length;
  // Dynamic font sizing based on total strats
  const fontSize = totalStrats > 40 ? 6 : totalStrats > 25 ? 7 : 8;

  const mapBlocks = Object.entries(byMap).map(([map, mapStrats]) => {
    const ct = sortByType(mapStrats.filter(s => s.side === "CT"));
    const tr = sortByType(mapStrats.filter(s => s.side === "TR"));

    const renderList = (side: string, list: Strategy[]) => {
      if (list.length === 0) return '';
      const items = list.map(s => {
        const role = player && s.playerRoles[player] ? s.playerRoles[player] : '';
        return `<tr>
          <td style="font-size:${fontSize}px;color:#555;padding:1px 2px;">${s.type}</td>
          <td style="font-weight:800;font-size:${fontSize + 1}px;padding:1px 2px;">${s.name}</td>
          ${role ? `<td style="font-size:${fontSize}px;padding:1px 2px;color:#333;">${role}</td>` : `<td></td>`}
        </tr>`;
      }).join('');
      return `<div style="margin-bottom:2px;">
        <div style="font-weight:900;font-size:${fontSize + 1}px;color:#000;border-bottom:1px solid #000;margin-bottom:1px;">${side}</div>
        <table style="width:100%;border-collapse:collapse;">${items}</table>
      </div>`;
    };

    return `<div style="break-inside:avoid;margin-bottom:6px;border:1.5px solid #000;padding:4px 5px;">
      <div style="font-weight:900;font-size:${fontSize + 3}px;border-bottom:2px solid #000;padding-bottom:1px;margin-bottom:2px;">${map.toUpperCase()}</div>
      ${renderList("CT", ct)}
      ${renderList("TR", tr)}
    </div>`;
  }).join('');

  return `<html><head><style>
    @page{size:A4 portrait;margin:6mm 8mm;}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,sans-serif;font-size:${fontSize}px;color:#000;line-height:1.2;}
    .content{columns:2;column-gap:10px;}
    table td{border-bottom:1px dotted #ccc;}
    @media print{body{background:#fff;}}
  </style></head><body>
    <div style="text-align:center;margin-bottom:4px;border-bottom:2px solid #000;padding-bottom:3px;">
      <span style="font-size:14px;font-weight:900;letter-spacing:2px;">FOCUS CHEAT SHEET</span>
      <span style="font-size:${fontSize + 1}px;color:#333;margin-left:8px;">${player || 'Team'} · ${new Date().toLocaleDateString('es-AR')} · ${totalStrats} strats</span>
    </div>
    <div class="content">${mapBlocks}</div>
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
