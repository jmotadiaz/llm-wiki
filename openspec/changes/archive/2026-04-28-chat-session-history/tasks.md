## 1. Hook de persistencia

- [x] 1.1 Crear `client/src/hooks/useChatSession.ts` con la lógica de sessionStorage
- [x] 1.2 Implementar `getLatestSessionKey()`: leer claves `chat_*` de sessionStorage y devolver la de mayor timestamp
- [x] 1.3 Implementar `loadSession(key)`: parsear JSON y reconstruir `createdAt` como `Date`; retornar `[]` si no existe o falla
- [x] 1.4 Implementar `saveSession(key, messages)`: serializar con `JSON.stringify` en try/catch, loguear `QuotaExceededError`
- [x] 1.5 Implementar `generateSessionKey()`: devolver `chat_${Date.now()}`

## 2. Integración en ChatPage

- [x] 2.1 Importar `useChatSession` en `ChatPage.tsx`
- [x] 2.2 Al montar, determinar si restaurar sesión existente o generar nueva clave
- [x] 2.3 Pasar `initialMessages` a `useChat` con los mensajes restaurados
- [x] 2.4 Añadir `useEffect([messages])` que llama a `saveSession` en cada cambio del array de mensajes

## 3. Verificación

- [x] 3.1 Comprobar que al navegar fuera y volver, los mensajes se restauran en la UI
- [x] 3.2 Comprobar que el LLM recibe el historial como contexto (el assistant recuerda lo dicho antes)
- [x] 3.3 Comprobar en DevTools → Application → Session Storage que la clave `chat_*` existe y contiene los mensajes
- [x] 3.4 Comprobar que cerrar el tab elimina las entradas de sessionStorage

## 4. Limpiar sesión (Nueva iteración)

- [x] 4.1 Implementar `clearSession(key)` en `useChatSession.ts`: elimina la clave del sessionStorage
- [x] 4.2 Importar `clearSession` en `ChatPage.tsx`
- [x] 4.3 Añadir botón "Clear Session" en la UI (junto al input o en header)
- [x] 4.4 Al hacer clic, ejecutar `clearSession(sessionKey)` y `setMessages([])`
- [x] 4.5 Generar nueva sessionKey después de limpiar (para nuevos mensajes se guarden en nueva sesión)
- [x] 4.6 Verificar que al hacer clic, los mensajes desaparecen y sessionStorage queda limpio
