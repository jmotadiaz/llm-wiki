## 1. Hook de persistencia

- [ ] 1.1 Crear `client/src/hooks/useChatSession.ts` con la lógica de sessionStorage
- [ ] 1.2 Implementar `getLatestSessionKey()`: leer claves `chat_*` de sessionStorage y devolver la de mayor timestamp
- [ ] 1.3 Implementar `loadSession(key)`: parsear JSON y reconstruir `createdAt` como `Date`; retornar `[]` si no existe o falla
- [ ] 1.4 Implementar `saveSession(key, messages)`: serializar con `JSON.stringify` en try/catch, loguear `QuotaExceededError`
- [ ] 1.5 Implementar `generateSessionKey()`: devolver `chat_${Date.now()}`

## 2. Integración en ChatPage

- [ ] 2.1 Importar `useChatSession` en `ChatPage.tsx`
- [ ] 2.2 Al montar, determinar si restaurar sesión existente o generar nueva clave
- [ ] 2.3 Pasar `initialMessages` a `useChat` con los mensajes restaurados
- [ ] 2.4 Añadir `useEffect([messages])` que llama a `saveSession` en cada cambio del array de mensajes

## 3. Verificación

- [ ] 3.1 Comprobar que al navegar fuera y volver, los mensajes se restauran en la UI
- [ ] 3.2 Comprobar que el LLM recibe el historial como contexto (el assistant recuerda lo dicho antes)
- [ ] 3.3 Comprobar en DevTools → Application → Session Storage que la clave `chat_*` existe y contiene los mensajes
- [ ] 3.4 Comprobar que cerrar el tab elimina las entradas de sessionStorage
