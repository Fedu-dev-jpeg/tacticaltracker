

## Plan: Agregar usuarios PANK e Ian + Nuevas herramientas de gestión de equipo

### 1. Crear usuarios PANK e Ian

- Actualizar la edge function `seed-users` para incluir `pank` e `ian` en la lista de jugadores
- Redeploy y ejecutar la función para crear las cuentas con contraseña `hambre`
- Actualizar `PLAYERS` en `src/types/match.ts` para incluir "Pank" e "Ian"

### 2. Migrar matches a base de datos (matches todavía usan localStorage)

Los matches siguen en `localStorage`, lo que significa que cada jugador ve datos distintos. Para gestionar el equipo seriamente, necesitamos que todos vean los mismos datos.

- Crear tabla `matches` en la base de datos con las mismas columnas que el tipo `Match`
- Actualizar `useMatches.ts` para leer/escribir desde la DB en vez de localStorage
- Migrar datos existentes de localStorage al primer uso

### 3. Nuevas funcionalidades de gestión de equipo

**A. Notas de treino colaborativas** -- Agregar un campo `recorded_by` a los matches para saber quién registró cada partido.

**B. Agenda / Asistencia** -- Nueva pestaña o sección en el Dashboard que muestre:
- Quién está logueado / activo (último login)
- Checklist de asistencia por sesión de treino

**C. Objetivos del equipo con seguimiento** -- En el Dashboard, una sección de objetivos semanales editables por cualquier miembro (ej: "Ganar 3 pistols CT en Nuke esta semana") con progreso automático calculado desde los matches.

**D. Filtro por tipo de partido en Analysis** -- Poder filtrar el análisis por Treino / Scrim / Oficial para ver rendimiento real vs práctica.

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `supabase/functions/seed-users/index.ts` | Agregar "pank" e "ian" |
| `src/types/match.ts` | Agregar "Pank", "Ian" a PLAYERS |
| `src/hooks/useMatches.ts` | Migrar de localStorage a DB |
| `src/components/Dashboard.tsx` | Agregar sección de objetivos y quién registró |
| `src/components/Analysis.tsx` | Agregar filtro por tipo de partido |
| `src/components/TrainingForm.tsx` | Agregar campo `recorded_by` automático |
| Nueva migración SQL | Crear tabla `matches` con RLS |

### Orden de ejecución

1. Migración DB: crear tabla `matches`
2. Actualizar seed-users con pank e ian, deploy y ejecutar
3. Actualizar PLAYERS en types
4. Migrar useMatches a DB
5. Agregar `recorded_by` al form
6. Agregar filtro por tipo en Analysis
7. Agregar sección de objetivos en Dashboard

