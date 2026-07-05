# Plan: Rebrand → TacticalTracker + Sidebar + Demo Parser + Admin del Equipo

## 1. Rebrand visual (FOCUS → TacticalTracker)

**Identidad**
- Reemplazar "FOCUS" por "TacticalTracker" en Header, Login, `index.html` (title/description/og), memoria del proyecto.
- Subir el logo azul (`user-uploads://image.png`) como asset Lovable y usarlo como logo principal + favicon (reemplaza el icono `Focus` de lucide).

**Paleta azul** (reescribir `src/index.css`)
- `--accent`: `210 100% 55%` (azul brillante del logo)
- `--primary`: `215 70% 25%` (azul profundo)
- `--background`: `220 25% 5%` (casi negro, tipo referencia)
- `--card`: `220 20% 8%`, `--border`: `220 20% 14%`, `--ring`: `210 100% 55%`
- Gradientes y glows a base azul.
- Auditar componentes para quitar cualquier `#ED7D31` / `text-orange-*` hardcoded.

## 2. Nueva shell: Sidebar lateral + header con stats

Reemplazar el nav de `Layout.tsx` por `SidebarProvider` + `AppSidebar` (shadcn, colapsable a icon-only, offcanvas en mobile):

```text
┌──────────┬──────────────────────────────┐
│ [logo]   │ breadcrumb  W/DRW/LOSS/WR%   │
│ team     ├──────────────────────────────┤
│ Home     │                              │
│ Registrar│        contenido             │
│ Stats    │                              │
│ Historial│                              │
│ Torneos  │                              │
│ Agenda   │                              │
│ Playbook │                              │
│ Awards   │                              │
│ Mapa     │                              │
│ Equipo ★ │  ← solo visible para admin   │
│ ──────── │                              │
│ [avatar] │                              │
│ Cerrar   │                              │
└──────────┴──────────────────────────────┘
```

- Header sticky delgado: breadcrumb `equipo / sección`, contadores W/DRW/LOSS/WR%, reloj y toggles EXP/IMP a la derecha.
- Footer del sidebar: avatar + nombre + badge de rol (Player/Coach/Admin) + logout.
- Routing real con `react-router-dom` (adiós al tabs local state).

## 3. Reset de usuarios + roles + admin

**Roster**: Boke, kud, koda, ray  
**Cuerpo técnico**: pakito, ema  
**Admin**: fedu  
**Contraseña única**: `tactical1`

**Tabla `user_roles`** con enum `app_role` = `player | coach | admin`:
```sql
create type public.app_role as enum ('player', 'coach', 'admin');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
-- + GRANTs, RLS, has_role() SECURITY DEFINER function
```

Fedu obtiene rol `admin`. Coaches (`pakito`, `ema`) rol `coach`. Los demás `player`.

**Edge function `seed-users`** reescrita:
1. Lista todos los users, borra los que no estén en el roster oficial.
2. Crea faltantes con `email_confirm: true` y `user_metadata.player_name`.
3. Sincroniza `user_roles` con el rol correspondiente.
4. Ejecutable manualmente para reset.

**Hook `useUserRole()`**: expone `{ role, isAdmin, isCoach, isPlayer }` para condicionar UI (ej: item "Equipo" solo si `isAdmin`).

## 4. Administración del Equipo (solo Fedu)

Nueva ruta `/equipo` protegida por `isAdmin`. Si un no-admin entra, redirige a `/`.

**Tabla `team_members`**:
```sql
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  player_name text not null,       -- "Boke", "kud"...
  steam_id text,                    -- SteamID64: "76561198..."
  steam_tag text,                   -- nick in-game usado en la demo (ej "boke-")
  role_in_team text,                -- Rifler / AWPer / IGL / Support / Lurker
  is_coach boolean default false,
  created_at, updated_at
);
```

- GRANT + RLS: SELECT para authenticated, INSERT/UPDATE/DELETE solo si `has_role(auth.uid(), 'admin')`.
- Seed inicial con los 4 jugadores + 2 coaches.

**UI `/equipo`** (solo visible para Fedu):
- Grid de cards por jugador, cada card editable inline:
  - Avatar + player_name
  - Input **SteamID64** con botón "Validar" (llama edge function `resolve-steam-id` que consulta la API pública de Steam por `GetPlayerSummaries` → devuelve nick, avatar, perfil).
  - Input **Steam tag** (el nick tal como aparece en la demo — se usa como fallback de matching).
  - Select de rol táctico.
  - Botón "Sincronizar" que refresca datos desde Steam.
- Botón "Agregar jugador/coach".
- Card informativa: "Los SteamID vinculan automáticamente las stats de cada demo al jugador correcto".
- Requiere **secret `STEAM_API_KEY`** (Fedu debe pegarla, se pide con `add_secret`).

## 5. Registrar Partida + Demo Parser

Reestructurar `TrainingForm` con el layout de la referencia (dos cards claras):

**Card A — Importar Demo (.dem)**
- Dropzone grande + botón "Seleccionar archivo .dem / .dem.bz2".
- Al soltar el archivo:
  1. Sube el `.dem` al bucket privado `demos` (storage).
  2. Invoca edge function `parse-demo` con el path.
  3. La function usa **[demofile](https://github.com/saul/demofile) via `npm:demofile@2`** en Deno para parsear:
     - Mapa, score final, lados, resultado, rounds (incluido pistol/2nd/setup/finalización de cada lado).
     - Por cada jugador presente en la demo: SteamID64 + tag + kills, deaths, assists, ADR, HS%, KAST%, K/R, D/R, FK, FD, flash assists, util damage, 2K/3K/4K/5K, rating.
  4. Devuelve un JSON estructurado al front, que precompleta el form.
- Muestra estado en vivo: `Subiendo → Parseando → Match jugadores → Listo`.
- **Vinculación de stats a jugadores**: la function cruza cada player de la demo contra `team_members` por `steam_id` (match exacto), y si no hay steam_id contra `steam_tag` (case-insensitive). Los que matchean se insertan en `player_stats(match_id, user_id, ...)`. Los que no matchean quedan en un panel "Jugadores sin vincular" con botón "Asignar a…" que crea el link y guarda el steam_id para futuros parseos.
- Cache: la function guarda el JSON parseado en storage para no re-parsear si se re-sube.

**Card B — Completar manualmente** (fallback)
- Fecha, Tipo (Treino/Scrim/Oficial), Rival.
- Acordeón "Datos manuales" con score, lado inicial, WIN/LOSS por rounds (pistol/2nd/setup/finalización, CT y TR).
- Notas.

**Botón "Guardar Registro"** al final.

**Nuevas tablas / cambios**
```sql
-- extiende matches con score detallado ya está
create table public.player_stats (
  id uuid pk, match_id uuid fk matches on delete cascade,
  user_id uuid null fk auth.users,   -- null = sin vincular
  steam_id text, steam_tag text,      -- crudo desde la demo
  kills int, deaths int, assists int,
  adr numeric, hs_pct numeric, kast_pct numeric,
  kr numeric, dr numeric,
  fk int, fd int, flash_assists int, util_dmg int,
  k2 int, k3 int, k4 int, k5 int,
  rating numeric,
  created_at, updated_at
);
-- índices en match_id y user_id
```

- Storage bucket privado `demos` (RLS: subida para authenticated, lectura solo admin + service_role).
- Edge function `parse-demo` con `verify_jwt = true` para asegurar user autenticado; usa service_role para leer storage y escribir `player_stats`.

## 6. Stats / Master Analyst (`/stats`)

Refactor de la vista `Analysis` con el layout de la referencia:
- Filtros: rango partidas, período, torneo, mapa.
- Selector "Individual" o "Todos los jugadores".
- **Comparativa del Equipo**: tabla con Rating, KAST%, K/D, ADR, HS%, K/R, D/R, Kills, Muertes, Asist, FK, FD, Flash/Rnd, Util Dmg/P, 2K/3K/4K+, Partidas — con colores verde/rojo según rendimiento vs promedio del equipo.
- **K/D por mapa — Comparativa**: matriz jugadores × mapas.
- Todo alimentado por `player_stats`. Si no hay stats (nadie subió demos), muestra empty state que linkea a Registrar.

## 7. Torneos (`/torneos`)

Nuevas tablas `tournaments` + `tournament_maps` (nombre, fecha, formato BO1/BO3/BO5, estado próximo/en_curso/finalizado, mapas jugados con resultado).

Vista:
- Card superior "Próximos torneos" con countdown.
- **Estado por mapa**: grid de los 9 mapas competitivos (Mirage, Inferno, Dust2, Nuke, Overpass, Ancient, Anubis, Vertigo, Train) con WR% + racha, calculado desde `matches`.
- Filtros: Siempre / Torneos / Treinos.
- Sección "Por Jugar" (próximos) y "Jugados" (con resultados).

## 8. Awards (`/awards`)

Derivado de `player_stats`, sin tabla nueva:
- MVP del mes/torneo/global (mayor rating promedio).
- Mejor AWPer (más kills con AWP — requiere info del arma; si el parser lo trae, se calcula, si no queda placeholder).
- Clutch King (2K+/3K+ en rounds decisivos).
- Entry King (más FK).
- HS King (mayor HS%).
- Cards con avatar, valor, mapa/fecha.

## 9. UX/UI transversal

- **Loading states**: skeletons en todas las tablas, no spinners genéricos.
- **Empty states**: cada sección con ilustración/icono + CTA claro (ej: "Aún no hay demos parseadas — subí una en Registrar").
- **Toasts**: éxito/error en verde/rojo del nuevo tema azul.
- **Animaciones sutiles**: fade-in en cards, transiciones suaves al colapsar sidebar.
- **Responsive**: todas las tablas con scroll horizontal en mobile, sidebar offcanvas.
- **Accesibilidad**: aria-labels en iconos, focus rings visibles con el nuevo `--ring` azul.

## Detalles técnicos — archivos

**Nuevos**
- `src/components/AppSidebar.tsx`, `src/components/AppHeader.tsx`
- `src/pages/Torneos.tsx`, `src/pages/Stats.tsx`, `src/pages/Awards.tsx`, `src/pages/Equipo.tsx`
- `src/hooks/useUserRole.ts`, `src/hooks/useTeamMembers.ts`, `src/hooks/usePlayerStats.ts`
- `src/components/DemoUploader.tsx`
- `src/assets/logo.png.asset.json`
- `supabase/functions/parse-demo/index.ts`
- `supabase/functions/resolve-steam-id/index.ts`

**Modificados**
- `src/App.tsx` (SidebarProvider + rutas)
- `src/components/Layout.tsx` → app-shell nuevo
- `src/pages/Index.tsx`, `src/pages/Login.tsx`
- `src/components/TrainingForm.tsx` (dropzone + form referencia)
- `src/components/Analysis.tsx` (Master Analyst)
- `src/index.css` (paleta azul)
- `index.html` (SEO TacticalTracker)
- `supabase/functions/seed-users/index.ts`
- `.lovable/memory/index.md`

**Migraciones SQL** (orden)
1. Enum `app_role` con `admin` + tabla `user_roles` + `has_role()` + GRANT + RLS.
2. Tabla `team_members` + seed + GRANT + RLS (solo admin escribe).
3. Tabla `player_stats` + GRANT + RLS.
4. Tablas `tournaments` + `tournament_maps` + GRANT + RLS.
5. Storage bucket `demos` (via tool) + policies en `storage.objects` (upload authenticated, read admin).

**Secrets**
- `STEAM_API_KEY` (Fedu la pega en un formulario seguro — se pide con `add_secret`).

**Deploy edge functions**: `seed-users`, `parse-demo`, `resolve-steam-id` tras crear/editar.

## Fuera de alcance
- Sincronización real con Discord/Google Calendar (mock).
- Import masivo CSV/JSON de historial.
- Sistema multi-team ("workspaces" tipo la referencia).
- Parseo de granadas/heatmaps de la demo (solo stats numéricas).
