## Context

`ChatPage.tsx` usa `useChat` del AI SDK (`@ai-sdk/react`) que mantiene el estado de mensajes en memoria React. Cada vez que el componente se desmonta (navegación fuera de `/chat`), el array `messages` se pierde. En el siguiente montaje, `useChat` empieza vacío y el servidor recibe solo el nuevo mensaje — sin historial previo.

El servidor (`routes/api/chat.ts`) ya acepta y reenvía el array completo de mensajes al LLM en cada request. No requiere cambios.

## Goals / Non-Goals

**Goals:**
- Restaurar la sesión de chat más reciente al volver a `/chat`.
- Que el LLM reciba el historial completo como contexto (opción B).
- Soporte a múltiples sesiones identificadas por timestamp (base para future sesión-switcher).
- Serialización completa del objeto `UIMessage` incluyendo `createdAt`.

**Non-Goals:**
- Selector de sesiones en la UI (fuera de alcance ahora).
- Límite de mensajes por sesión.
- Persistencia cross-tab o cross-session (localStorage queda fuera).
- Cambios en el backend.

**Goals (Nueva iteración: Limpiar sesión):**
- Añadir botón "Clear Session" en la UI del chat.
- Al hacer clic, eliminar la sesión actual y empezar una nueva.

## Decisions

### 1. Custom hook `useChatSession`

**Decisión**: Extraer toda la lógica de sessionStorage en `client/src/hooks/useChatSession.ts`.

**Rationale**: Mantiene `ChatPage` limpio y permite testear/reutilizar la lógica de persistencia de forma independiente. El hook encapsula: generar el key de sesión, leer/escribir, y serializar/deserializar.

**Alternativa descartada**: Inline en `ChatPage` — mezcla UI con lógica de persistencia.

---

### 2. Clave de sesión: `chat_${timestamp}`

**Decisión**: La clave se genera una vez al montar (`Date.now()`) y se mantiene estable durante la vida de la sesión.

**Rationale**: Permite múltiples sesiones dentro del mismo tab (si el usuario hace un "nueva sesión" en el futuro). El timestamp es inmutable una vez creado.

**Formato**: `chat_1713200000000`

---

### 3. Sesión a restaurar: la más reciente

**Decisión**: Al montar, se leen todas las claves de `sessionStorage` con prefijo `chat_`, se ordena por timestamp descendente, y se carga la primera.

**Rationale**: Comportamiento intuitivo — el usuario retoma donde lo dejó. No requiere estado adicional (no hace falta guardar "sesión activa" por separado).

---

### 4. Serialización de `UIMessage`

**Decisión**: Guardar el array completo con `JSON.stringify`. En la restauración, reconstruir `createdAt` como `Date` desde el string ISO.

```ts
// Al guardar
sessionStorage.setItem(key, JSON.stringify(messages));

// Al leer
const raw = JSON.parse(stored);
return raw.map((m: any) => ({
  ...m,
  createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
}));
```

**Rationale**: `useChat` acepta `initialMessages: UIMessage[]` — si `createdAt` es string en vez de `Date`, puede haber warnings. La reconversión explícita es robusta y simple.

---

### 5. Sincronización: `useEffect` en cambios de `messages`

**Decisión**: Un `useEffect([messages])` en el hook escribe a sessionStorage cada vez que el array cambia.

**Rationale**: Es el patrón más simple. No hay race conditions porque `useChat` es síncrono en sus actualizaciones de estado. El coste de serializar en cada mensaje es despreciable (conversaciones cortas).

---

### 6. Limpiar sesión: botón en la UI

**Decisión**: Añadir función `clearSession(key)` en `useChatSession.ts` que elimine la sesión del sessionStorage. En `ChatPage`, un botón "Clear Session" llama a esta función y reinicia el chat con `setMessages([])`.

**Rationale**: Permite al usuario empezar una conversación nueva sin navegar. Es destructivo (elimina el historial), pero reversible (el usuario puede recargar si fue accidental). El botón es visible junto al input para ser fácil de encontrar.

**Alternativa descartada**: Confirmación modal — añade fricción innecesaria para una acción que es trivial deshacer (recargar la página).

## Risks / Trade-offs

| Riesgo | Mitigación |
|--------|------------|
| sessionStorage llena (quota ~5MB) | Conversaciones de texto normales no llegarán a ese límite. Si ocurre, el `setItem` lanza `QuotaExceededError` — capturar en try/catch y loguear. |
| Mensajes con contexto stale (wiki cambió) | Aceptado. El LLM puede contradecirse si la wiki cambió entre mensajes. Es una limitación conocida y documentada del diseño. |
| `UIMessage` shape cambia con versión de AI SDK | La restauración hace `JSON.parse` — si el schema cambia, los mensajes viejos pueden causar error. Mitigación: envolver `initialMessages` en try/catch y hacer fallback a `[]`. |

## Migration Plan

No hay migración de datos. `sessionStorage` es nueva — no hay estado previo que preservar. El despliegue es transparente: en la primera visita post-deploy, no hay sesión guardada y el chat arranca vacío (comportamiento actual).
