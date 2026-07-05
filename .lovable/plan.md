# Perfil de Jugador (click en nombre del sidebar) + Avatares Steam

## 1. Trigger UI
- En el footer del `AppSidebar` (abajo a la derecha, donde está el nombre + logout), el bloque de usuario pasa a ser un botón.
- Click en el nombre/avatar → abre `PlayerProfileDialog` (shadcn `Dialog`) con el layout de la referencia.
- El botón "Cerrar Sesión" se mueve dentro del modal (como en la imagen), dejando el footer del sidebar limpio (solo avatar + nombre + rol).

## 2. Contenido del modal (según screenshot)
Header:
- Avatar grande (foto de Steam si está sincronizada, fallback iniciales).
- Nombre in-game (`steam_tag` o username).
- `SteamID: <steamid64>` en mono, con botón copiar.
- Badge del rol en el equipo (Rifler, AWPer, IGL, Coach, etc.).

**Estadísticas Globales** (grid 4 col → 2 en mobile), calculadas desde `player_stats` del usuario logueado:
- Kills Totales · Deaths Totales · ADR Promedio · Win Rate Rondas
- HS% Promedio · Asistencias
Cada card con ícono, valor grande, label chico. Win Rate en color acento.

**Mejores Mapas (ADR)**: lista top 3 mapas del jugador ordenados por ADR promedio (agrupando `player_stats` join `matches.map`).

**Distribución de Impacto**: donut chart (recharts) con Kills / Deaths / Assists totales, leyenda debajo.

Footer del modal: `Cerrar Sesión` (destructivo outline) + `Cerrar`.

Estado vacío: si no hay `player_stats` aún, mostrar mensaje "Todavía no subiste demos" con CTA a `/registrar`.

## 3. Sincronización de avatares de Steam
- Nueva columna `steam_avatar_url text` en `team_members` (migración).
- Edge function `sync-steam-avatars` (usa `STEAM_API_KEY` ya planificado):
  - Recorre `team_members` con `steam_id` seteado.
  - Llama `ISteamUser/GetPlayerSummaries/v2` en batch.
  - Guarda `avatarfull` en `steam_avatar_url`.
- Trigger:
  - Botón "Sincronizar avatares Steam" en `/equipo` (solo admin).
  - Auto: se invoca cuando el admin guarda un `steam_id` nuevo/editado.
- El modal y el footer del sidebar leen `steam_avatar_url` del `team_member` vinculado al `user_id` logueado.

## 4. Secret requerido
`STEAM_API_KEY` — lo pediré vía `add_secret` en build mode cuando implemente la edge function.

## 5. Archivos
Nuevos:
- `src/components/PlayerProfileDialog.tsx`
- `src/hooks/useMyPlayerProfile.ts` (agrega stats, mejores mapas, impacto)
- `supabase/functions/sync-steam-avatars/index.ts`
- Migración: `alter table team_members add column steam_avatar_url text`

Modificados:
- `src/components/AppSidebar.tsx` — footer clickeable, quita botón logout
- `src/pages/Equipo.tsx` — botón "Sincronizar avatares"

## Fuera de alcance
- Fotos históricas / cache de avatares en storage propio (usamos URL directa de Steam CDN).
- Perfiles de otros jugadores del equipo (solo el propio del usuario logueado; si querés vista cruzada, lo agregamos después).

## Pendiente que necesito de vos
Pasame los SteamID64 de Boke, kud, koda, ray, pakito, ema (y confirmá el tuyo `76561199536800035`) para cargarlos en `team_members` y correr la primera sync.
