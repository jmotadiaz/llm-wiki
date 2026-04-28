# chat-session-persistence Specification

## Purpose
TBD - created by archiving change chat-session-history. Update Purpose after archive.
## Requirements
### Requirement: Session creation on first message
El sistema SHALL crear una nueva sesión de chat al enviar el primer mensaje, identificada por un timestamp (`chat_${Date.now()}`), y persistirla en `sessionStorage`.

#### Scenario: Primera sesión en tab limpio
- **WHEN** el usuario abre `/chat` por primera vez en el tab (sin sesiones previas en sessionStorage)
- **THEN** el chat arranca con el array de mensajes vacío

#### Scenario: Sesión creada al primer mensaje
- **WHEN** el usuario envía su primer mensaje
- **THEN** el sistema genera una clave `chat_${timestamp}` y guarda el array de mensajes en `sessionStorage`

---

### Requirement: Session persistence on navigation
El sistema SHALL persistir el array completo de mensajes en `sessionStorage` cada vez que el array de mensajes cambia (nueva pregunta o nueva respuesta).

#### Scenario: Mensaje guardado tras respuesta del asistente
- **WHEN** el asistente termina de responder
- **THEN** el array actualizado (incluyendo el nuevo mensaje del asistente) se escribe en `sessionStorage` bajo la clave de sesión activa

#### Scenario: Mensaje del usuario guardado inmediatamente
- **WHEN** el usuario envía un mensaje
- **THEN** el mensaje del usuario se persiste en `sessionStorage` antes de recibir la respuesta del asistente

---

### Requirement: Session restoration on mount
El sistema SHALL restaurar la sesión de chat más reciente al montar `ChatPage`, pasando los mensajes almacenados como `initialMessages` a `useChat`.

#### Scenario: Restauración tras navegar fuera y volver
- **WHEN** el usuario navega a otra página y luego vuelve a `/chat`
- **THEN** los mensajes previos se muestran en el chat
- **AND** el LLM recibe el historial completo como contexto en el siguiente request

#### Scenario: No hay sesión previa
- **WHEN** no existe ninguna clave con prefijo `chat_` en `sessionStorage`
- **THEN** el chat arranca con el array de mensajes vacío (comportamiento actual)

---

### Requirement: Multiple sessions by timestamp
El sistema SHALL soportar múltiples sesiones en `sessionStorage`, cada una con clave única `chat_${timestamp}`, siendo la sesión activa la identificada por el timestamp más reciente.

#### Scenario: Sesión más reciente restaurada
- **WHEN** existen múltiples claves `chat_*` en `sessionStorage`
- **THEN** se carga la sesión con el timestamp más alto (la más reciente)

---

### Requirement: Message serialization
El sistema SHALL serializar el array `UIMessage[]` completo con `JSON.stringify` al guardar, y reconstruir `createdAt` como objeto `Date` al restaurar.

#### Scenario: Serialización de fecha
- **WHEN** un mensaje con `createdAt: Date` se guarda en `sessionStorage`
- **THEN** al restaurarlo, `createdAt` es un objeto `Date` válido (no un string)

#### Scenario: Error de quota
- **WHEN** `sessionStorage.setItem` lanza `QuotaExceededError`
- **THEN** el error se captura silenciosamente (sin crash) y se registra en consola

---

### Requirement: Session cleared on tab close
El sistema SHALL depender del comportamiento nativo de `sessionStorage` para la limpieza: los datos se eliminan automáticamente al cerrar el tab, sin lógica adicional en la aplicación.

#### Scenario: Limpieza al cerrar tab
- **WHEN** el usuario cierra el tab del navegador
- **THEN** todas las sesiones `chat_*` desaparecen (comportamiento nativo de sessionStorage)

