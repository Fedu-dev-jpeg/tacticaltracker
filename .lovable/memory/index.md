# Project Memory

## Core
CS2 team tracker app "TacticalTracker" (formerly FOCUS/Hambrientos). Dark theme, azul brillante #0088FF como accent, sobre fondo casi negro.
Team players: Boke, kud, koda, ray. Coaches: pakito, ema. Admin: fedu.
Todos los usuarios (excepto fedu = "admin1") tienen password "tactical1". Login usa dominio interno @hambrientos.com para compatibilidad.
Roles en tabla `user_roles` con enum app_role: player | coach | admin. Función `has_role()` SECURITY DEFINER.
UI en español (Argentina). Shell con sidebar shadcn colapsable + header con stats. Routing con react-router-dom.
Solo admin (fedu) ve la sección /equipo para configurar Steam IDs de cada jugador.
Bucket privado `demos` para uploads de .dem. Edge function `parse-demo` es stub (real parser pendiente).

## Memories
- [Team roles](mem://features/team-roles) — Player roles and descriptions
