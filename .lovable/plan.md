# Mejoras al flujo de Demos y al diálogo de Stats

Cuatro bloques de trabajo, todos frontend salvo el reuso del `demo_data` ya guardado en la DB.

---

## 1. Filtros y resaltado en el Round Timeline

En `MatchStatsDialog.tsx`, sobre el timeline de 24 rondas del "Full Stats":

- Barra de filtros arriba del timeline con toggles:
  - Lado: `Todos / CT / TR`
  - Resultado: `Todos / Ganadas / Perdidas`
  - Motivo: multi-chip (`Bomb`, `Defuse`, `Elimination`, `Time`)
  - Solo `Pistol` (rondas 1 y 13)
  - Solo `Clutch` (rondas donde `survivors === 1` o marcadas como clutch en `demo_data`)
- Rondas que no matchean se muestran atenuadas (opacidad baja, sin color de lado), las que matchean se resaltan con anillo `ring-2 ring-accent` y un badge del motivo.
- Contador "Mostrando X / 24" al lado de los filtros y botón "Reset".
- El mini-panel (compact stats) recibe los mismos filtros vía prop opcional para mostrar "3 clutches · 2 pistols" resaltados.

## 2. Exportación CSV / JSON

Nuevo helper `src/lib/exportStats.ts` con dos funciones puras:

- `exportRoundsCSV(match, demoData)` → columnas: `round, side, winner, reason, survivors, our_econ, their_econ, our_buy_type, their_buy_type, our_score, their_score`.
- `exportEconomyCSV(demoData)` → filas por `buy_type` (Pistol / Full Eco / Eco / Half Buy / Full Buy) con `team, buy_type, wins, losses, win_rate`.
- Versión JSON: dumpea `demo_data` completo (rondas + economía + roles + charts) con metadatos del match.

En `MatchStatsDialog.tsx`, dropdown "Exportar" con 4 items:
- Rondas CSV, Rondas JSON, Economía CSV, Análisis completo JSON.

Descargas vía `Blob` + `URL.createObjectURL` — nombre del archivo `hambrientos-<map>-<yyyy-MM-dd>-<tipo>.csv/json`.

## 3. Abrir Stats desde el historial (sin reparsear)

- El `demo_data` ya se guarda en `matches` (columna JSONB creada previamente). Confirmar con un fetch mínimo.
- En `Historial.tsx` (tabla de partidos), añadir columna/acción "Stats":
  - Si `match.demo_data` existe → botón activo que abre `MatchStatsDialog` con los datos guardados (sin llamar a `parse-demo`).
  - Si no existe → botón deshabilitado con tooltip "Sin demo parseada".
- Igual tratamiento en el mini-listado del `Dashboard` ("Últimos 10 Partidos") si el match tiene `demo_data`.
- `MatchStatsDialog` ya acepta el blob de análisis; se pasa directamente desde la fila.

## 4. Cancelar y reintentar la subida/parseo

En `DemoUploader.tsx`:

- Guardar el `File` original en state (`lastFile`) y un `AbortController` por subida.
- Botón "Cancelar" visible durante `subiendo | parseando | vinculando | guardando`:
  - Llama `controller.abort()` (para el `supabase.functions.invoke` y el upload al storage).
  - Marca el estado como `Cancelado` y deja las etapas visibles en gris.
- Si la promesa falla o se cancela, mostrar bloque de error con:
  - Mensaje corto (`error.message`)
  - Botón "Reintentar" que vuelve a lanzar el flujo con `lastFile`, reiniciando el progreso desde 0 y avanzando por las mismas etapas.
- Las 4 etapas siguen visibles siempre (ya está la barra multi-stage); se agrega un check verde ✓ por etapa completada, un spinner en la actual y un ícono ✕ en la que falló.

---

## Detalles técnicos

- `AbortSignal` compatible con `supabase.functions.invoke({ signal })` — supabase-js lo soporta desde v2.
- `demo_data` es `Record<string, unknown>` en `types.ts`; casteo local a un tipo `DemoAnalysis` reutilizable extraído a `src/types/demo.ts`.
- El export CSV escapa comillas y separa con `,` (Excel/Sheets friendly). Sin dependencias nuevas.
- `MatchStatsDialog` pasa a aceptar `mode: "live" | "stored"` para saber si mostrar el hint "análisis guardado el DD/MM".

### Archivos afectados

```text
src/components/MatchStatsDialog.tsx   (filtros + export dropdown + mode stored)
src/components/DemoUploader.tsx       (cancel + retry + estados por etapa)
src/components/Historial.tsx          (botón Stats por fila)
src/components/Dashboard.tsx          (botón Stats en Últimos 10)
src/lib/exportStats.ts                (nuevo — CSV/JSON helpers)
src/types/demo.ts                     (nuevo — tipo DemoAnalysis)
```

Sin cambios de schema ni edge functions.
