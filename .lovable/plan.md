# Refactor de demos — Paso 3 (simulador con schema real) — v2 con ajustes

Objetivo: `demo_data` y la UI cumplen exactamente el schema del prompt (sección 13), usando **enums reales del engine** para que cuando enchufemos el parser WASM en el Paso 2 no haya que traducir nada.

## Schema `demo_data` (v2 ajustado)

- **`match`**: `map`, `server`, `date`, `match_type`, `total_rounds`, `score {team1, team2}`, `teams {team1, team2}` con `name`, `first_half_side` (`"CT"` | `"TERRORIST"`), `player_steamids[]`.
- **`rounds[]`**:
  - `round_number`, `is_pistol`
  - `winner_side`: **`"CT"` | `"TERRORIST"`** (valores del engine, no nombres largos)
  - `end_reason`: **enums reales del engine** — `target_bombed`, `bomb_defused`, `ct_elimination`, `t_elimination`, `round_time_expired`
  - `clutch {player_steamid, vs (1-4), won}` o `null`
  - `bomb {planted, site: "A"|"B", planter_steamid, tick, defused, defuser_steamid}` o `null`
  - `buy_types {team1, team2}`: **`full_eco` | `eco` | `half_buy` | `full_buy` | `pistol`**
  - `kills[]`: `attacker`, `victim`, `assister`, `weapon`, `headshot`, `wallbang`, `distance`, `is_opening`, `tick`
  - `economy {team1, team2}`: `avg_equip`, `avg_balance`, `buy_type`
- **`players`** (dict por steamid): `name`, `team`, `role_deduced` (`"AWPer" | "Entry" | "Lurker" | "Support" | null`), `stats` (kills, deaths, assists, hs_kills, damage, adr, kast, rating, first_kills, first_deaths, clutches_won, clutches_total, utility_damage, enemies_flashed, mvps), `per_round[]`.
- **`buy_type_summary {team1, team2}`**: wins/losses por tipo de compra.

Fuera del blob:
- **`charts`** se calculan on-the-fly en el frontend con `buildChartData(demoData)`. No se persisten.

### Helpers de presentación (`src/lib/demoLabels.ts`)

```ts
END_REASON_LABEL = {
  target_bombed: "Bomba explotó",
  bomb_defused: "Bomba desactivada",
  ct_elimination: "CT eliminados",
  t_elimination: "T eliminados",
  round_time_expired: "Tiempo agotado",
}
SIDE_LABEL = { CT: "Counter-Terrorist", TERRORIST: "Terrorist" }
BUY_LABEL = { full_eco: "Full Eco", eco: "Eco", half_buy: "Half Buy", full_buy: "Full Buy", pistol: "Pistola" }
BUY_SHORT = { full_eco: "F.Eco", eco: "Eco", half_buy: "Half", full_buy: "Full", pistol: "Pistol" }
```

### Rangos de `avg_equip` → `buy_type` (calibrados)

- `< 1000` → `full_eco`
- `1000–2500` → `eco`
- `2500–4000` → `half_buy`
- `>= 4000` → `full_buy`
- Ronda 1 y 13 (post-halftime) → `pistol` (override por número de ronda)

## Archivos

1. **`src/types/demo.ts`** — interfaces v2 con los enums del engine: `EndReason`, `BuyType`, `Side` (`"CT" | "TERRORIST"`), `DemoData`, `DemoMatch`, `DemoRound`, `DemoKill`, `DemoBomb`, `DemoClutch`, `DemoPlayer`. Sin `charts` en `DemoData`.
2. **`src/lib/demoLabels.ts`** — helpers `END_REASON_LABEL`, `SIDE_LABEL`, `BUY_LABEL`, `BUY_SHORT`.
3. **`src/lib/demoCharts.ts`** — `buildChartData(demoData)` que deriva `player_rating`, `damage_per_round`, `total_damage`, `clutch`, `entry` desde `rounds[]` + `players{}`.
4. **`src/lib/demoData.ts`** — `migrateLegacyDemoData()` para envolver blobs viejos al schema v2 (mapea end_reasons viejos → enums del engine, buy_types viejos → nuevos, etc.).
5. **`supabase/functions/parse-demo/index.ts`** — reescribir `generateAnalysis`:
   - `winner_side` corto (`"CT"` / `"TERRORIST"`).
   - `end_reason` con enums del engine.
   - `bomb` estructurado con `site` A/B, `planter_steamid`, `tick`.
   - `buy_types` derivados de `avg_equip` con los 5 valores calibrados.
   - `kills[]` con `is_opening` en la primera kill de cada ronda.
   - `detectClutch()` para 1vN.
   - `buildPlayers()` con heurística de `role_deduced`: AWPer (kills con AWP), Entry (first_kills altos), Lurker (posición promedio separada), Support (assists + util damage). **IGL nunca hardcodeado — si no se puede deducir, `null`.**
   - Sin `charts` en el output.
   - Sigue insertando `player_stats` como hoy.
6. **`src/components/MatchStatsDialog.tsx`** — consumir schema v2:
   - `ScoreHeader` desde `match.teams.*.name` y `match.score`.
   - `RoundsTimeline` usa `BUY_SHORT[buy_type]` y `END_REASON_LABEL[end_reason]`.
   - `FullTeamTable` muestra `role_deduced` como pill (o "—" si es `null`).
   - Splits CT/T por `first_half_side` + número de ronda.
   - `PerformanceCharts` llama `buildChartData(demoData)` en un `useMemo`.
   - Nueva pestaña "Rondas Detalladas" con timeline + kills.
7. **`src/lib/exportStats.ts`** — actualizar exports + agregar `exportKillsCSV`.
8. Consumidores livianos (`useMatches`, `usePendingMatches`, `HistoryView`, `Dashboard`, `DemoUploader`, `PendingConfirmations`) — remapeo de campos.

## Fuera de alcance (Paso 2)

- Web Worker + `@laihoe/demoparser2` (WASM).
- Descompresión `.bz2` en browser.
- Endpoint de ingesta del JSON parseado.
- Heatmaps, callouts, detección real de roles.

## Verificación

- `tsgo` limpio.
- Demo dummy → schema v2 en DB, `MatchStatsDialog` renderiza todas las pestañas.
- Match viejo se abre bien vía `migrateLegacyDemoData`.
- Playwright: abrir un match legacy y uno nuevo, verificar timeline + tabla + charts derivados.

Con los 5 ajustes aplicados. ¿Arranco?