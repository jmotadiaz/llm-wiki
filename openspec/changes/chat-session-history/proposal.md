## Why

El chat actual pierde toda la conversación al navegar fuera de la página `/chat`. Esto hace imposible mantener el contexto conversacional entre navegaciones, obligando al usuario a repetir preguntas y al LLM a empezar desde cero en cada visita.

## What Changes

- El historial de mensajes de cada sesión de chat se persiste en `sessionStorage` del navegador.
- Cada sesión se identifica por un timestamp de creación (`chat_history_${timestamp}`).
- Al montar `ChatPage`, se restaura la sesión más reciente (si existe) y se pasa como `initialMessages` a `useChat`.
- El LLM recibe el historial completo en cada request, manteniendo el contexto conversacional.
- Al cerrar la pestaña, `sessionStorage` se limpia automáticamente (comportamiento nativo).
- No hay límite artificial de mensajes por sesión.

## Capabilities

### New Capabilities

- `chat-session-persistence`: Persistencia del historial de chat en sessionStorage del browser con soporte para múltiples sesiones identificadas por timestamp.

### Modified Capabilities

_(ninguna)_

## Impact

- **Modificado**: `client/src/pages/ChatPage.tsx` — integra lógica de sessionStorage con `useChat`.
- **Nuevo**: `client/src/hooks/useChatSession.ts` — hook personalizado que encapsula la lectura/escritura en sessionStorage.
- **Sin cambios en backend**: el servidor ya recibe y usa el array completo de mensajes como contexto del LLM.
- **Sin dependencias nuevas**: solo APIs nativas del browser (`sessionStorage`, `JSON`).
