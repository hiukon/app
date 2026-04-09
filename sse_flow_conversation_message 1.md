# Assistant — API & Data Protocol Reference

> Framework-agnostic documentation for the **Seinetime Intelligent Agentic**
> assistant backend protocol. Covers every API endpoint, SSE event type, data
> structure, and flow needed to build a client from scratch on any frontend
> stack.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [API Endpoints](#3-api-endpoints)
4. [SSE Streaming Protocol](#4-sse-streaming-protocol)
5. [Conversation Lifecycle Flows](#5-conversation-lifecycle-flows)
6. [Message Data Model](#6-message-data-model)
7. [Tool Call Protocol](#7-tool-call-protocol)
8. [Delegate Agent (Sub-Agent) Protocol](#8-delegate-agent-sub-agent-protocol)
9. [HITL Interrupt Protocol](#9-hitl-interrupt-protocol)
10. [Artifact Protocol](#10-artifact-protocol)
11. [Citation Protocol](#11-citation-protocol)
12. [Trigger Token Format](#12-trigger-token-format)
13. [Reconnect & Recovery Strategy](#13-reconnect--recovery-strategy)
14. [Attachment Upload Protocol](#14-attachment-upload-protocol)

---

## 1. Overview

```
┌──────────────────────┐          SSE stream
│     Frontend UI      │◄─────────────────────────►│  Agent API Server  │
│                      │   POST /api/v1/messages   │                    │
│                      │   REST endpoints          │                    │
└──────────────────────┘                           └────────────────────┘
```

The protocol is entirely HTTP-based:
- **REST** for CRUD operations (conversations, attachments, citations, artifacts).
- **SSE** (Server-Sent Events) over a single `POST` for real-time message streaming.

**Base URLs**:

| Variable | Value | Used for |
|---|---|---|
| `AGENT_API_URL` | `https://agent.next.seinetime.ai` | All agent/conversation endpoints (§3, §7) |
| `CORE_API_URL` | `https://api.next.seinetime.ai` | Auth, user, connector, and other platform endpoints (§2, §7.6.3, §7.6.5) |

---

## 2. Authentication

All authenticated requests must include the access token as a Bearer header:

```
Authorization: Bearer <access_token>
```

All auth endpoints use `CORE_API_URL` (`https://api.next.seinetime.ai`).

### 2.1 Login

```
POST {CORE_API_URL}/api/v1/authentication/login
Content-Type: application/json
```

**Request body**:

```json
{
  "email": "user@example.com",
  "password": "secret",
  "role_id": "role-uuid",     // optional — pre-select role
  "partner_id": "partner-uuid" // optional — pre-select partner
}
```

**Response**:

```json
{
  "code": 200,
  "msg": "ok",
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "access_expires_in": "2026-04-08T11:00:00Z",  // ISO 8601 or Unix seconds
    "refresh_expires_in": "2026-04-15T10:00:00Z",
    "token_type": "Bearer",
    "role_id": "role-uuid",
    "partner_id": "partner-uuid",
    "user": { /* User object — see §2.6 */ }
  }
}
```

### 2.2 Refresh Token

Exchange a refresh token for a new access token. Call this proactively when the access token is within 60 seconds of expiry.

```
POST {CORE_API_URL}/api/v1/authentication/refresh
Content-Type: application/json
```

**Request body**:

```json
{ "refresh_token": "eyJ..." }
```

**Response**: Same shape as Login (§2.1).

## 3. API Endpoints

### 3.1 Send Message (SSE Stream)

The primary endpoint. Sends a user message (or resumes an interrupt) and
receives a streaming response.

```
POST {AGENT_API_URL}/api/v1/messages
Content-Type: application/json
Accept: text/event-stream
Authorization: Bearer <token>
```

**Request body** — `CreateMessageRequest`:

```typescript
{
  agent?: string;                    // Agent code. Omit for default agent
  agent_type?: "single" | "group";   // Execution mode
  message?: string;                  // User text (omit when resuming or joining)
  conversation_id?: string;          // Omit to create a new conversation
  run_id?: string;                   // Continue a specific run
  message_id?: string;               // Client-generated message ID (UUIDv4)
  context?: Record<string, any>;     // Client context (see §3.1.1)
  resume?: {                         // Present only when resolving an interrupt
    interrupt_id: string;
    payload: ResumePayload;          // See §9
  };
  user_time_zone?: string;           // e.g. "Asia/Ho_Chi_Minh"
}
```

**Response**: SSE stream — see [§4 SSE Streaming Protocol](#4-sse-streaming-protocol).

#### 3.1.1 Context Object

The `context` field carries client-side state so the agent understands what the user is viewing:

```typescript
{
  // Current canvas/panel content the user is looking at
  canvas?: { type: string; data: any };
  // Uploaded file references (from attachment upload API)
  attachments?: Array<{
    type: "image" | "file";
    name: string;
    original_file: string;    // Server storage path
    extracted_file?: string;  // Parsed/extracted text file path
    mimeType?: string;
    size?: number;
  }>;
}
```

### 3.2 List Conversations

```
GET {AGENT_API_URL}/api/v1/conversations
Authorization: Bearer <token>
```

**Query parameters**:

| Param             | Type      | Default        | Description                      |
|-------------------|-----------|----------------|----------------------------------|
| `limit`           | `number`  | `20`           | Page size                        |
| `offset`          | `number`  | `0`            | Offset for pagination            |
| `order`           | `string`  | `"created_at"` | Sort field                       |
| `direction`       | `string`  | `"desc"`       | `"asc"` or `"desc"`             |
| `user_id`         | `string`  | —              | Filter by user                   |
| `thread_id`       | `string`  | —              | Filter by thread                 |
| `include_deleted` | `boolean` | `false`        | Include soft-deleted             |

**Response**:

```json
{
  "code": 200,
  "message": "ok",
  "data": [
    {
      "id": "conv-uuid",
      "title": "Conversation title",
      "thread_id": "thread-uuid",
      "user_id": "user-uuid",
      "partner_id": "partner-uuid",
      "partner_system_id": 1,
      "system_id": 1,
      "metadata": {},
      "created_at": "2026-04-08T10:00:00Z",
      "updated_at": "2026-04-08T10:05:00Z",
      "deleted_at": null
    }
  ],
  "pagination": {
    "total_items": 100,
    "current_page": 1,
    "next_page": 2,
    "prev_page": 0,
    "last_page": 5
  }
}
```

### 3.3 Delete Conversation

```
DELETE {AGENT_API_URL}/api/v1/conversation/:id
Authorization: Bearer <token>
```

**Response**: `{ "code": 200, "message": "ok" }`

### 3.4 Cancel Running Conversation

Aborts the active agent run for a conversation.

```
POST {AGENT_API_URL}/api/v1/conversation/:id/cancel
Authorization: Bearer <token>
```

**Response**: `{ "code": 200, "message": "ok" }`

### 3.5 Download Artifact

```
GET {AGENT_API_URL}/api/v1/conversation/:id/artifact
Authorization: Bearer <token>
```

**Query parameters**:

| Param     | Type     | Description                     |
|-----------|----------|---------------------------------|
| `type`    | `string` | Always `"workspace"`            |
| `name`    | `string` | Artifact display name           |
| `content` | `string` | Workspace file path             |

**Response**: Raw file bytes (`Blob`). Content-Type matches the file MIME type.

### 3.6 Artifact Signed Download Token

For secure one-time downloads:

```
POST {AGENT_API_URL}/api/v1/conversation/:id/artifact/signed-url
Content-Type: application/json
Authorization: Bearer <token>
```

**Body**: `{ "type": "workspace", "name": "...", "content": "..." }`

**Response**: `{ "code": 200, "data": "<encrypted-token>" }`

### 3.7 Upload Attachment

```
POST {AGENT_API_URL}/api/v1/messages/attachment
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

**Form fields**:

| Field  | Type   | Required | Description              |
|--------|--------|----------|--------------------------|
| `file` | `File` | Yes      | The file to upload       |
| `name` | `string` | No    | Override display name     |

**Response**:

```json
{
  "code": 200,
  "msg": "ok",
  "data": {
    "name": "report.pdf",
    "original_file": "/storage/path/report.pdf",
    "extracted_file": "/storage/path/report_extracted.txt"
  }
}
```

### 3.8 Fetch Citations

```
GET {AGENT_API_URL}/api/v1/run/:runId/citations
Authorization: Bearer <token>
```

**Response**:

```json
{
  "code": 200,
  "message": "ok",
  "data": {
    "passages": [
      {
        "id": 1,
        "chunk_index": 0,
        "page_range": "3-5",
        "text": "The actual chunk content from the knowledge base...",
        "file_id": "file-uuid",
        "chunk_content_id": "chunk-uuid",
        "metadata": {
          "reference": "source ref",
          "content_size": 1024,
          "page_range": "3-5",
          "type": "text",
          "asset_mime_type": "application/pdf",
          "token_count": 256
        }
      }
    ],
    "files": [
      {
        "id": "file-uuid",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "original_name": "quarterly-report.pdf",
        "file_extension": "pdf",
        "mime_type": "application/pdf",
        "partner_id": "partner-uuid",
        "user_id": "user-uuid"
      }
    ]
  }
}
```

---

## 4. SSE Streaming Protocol

### 4.1 Wire Format

Each SSE line:

```
data: { "type": "EVENT_TYPE", "seq": 1, "thread_id": "...", "run_id": "...", ... }\n\n
```

Stream terminator:

```
data: [DONE]\n\n
```

### 4.2 Parsing Algorithm

```
buffer = ""

on_data_received(chunk):
  buffer += decode_utf8(chunk)
  lines = buffer.split("\n")
  buffer = lines.pop()            // Keep unterminated last line

  for line in lines:
    line = line.trim()
    if line == "" or line == "data: [DONE]":
      continue
    if line.starts_with("data: "):
      json_str = line[6:]         // Strip "data: " prefix
      event = JSON.parse(json_str)
      handle_event(event)
```

### 4.3 Event Types — Complete Enum

```typescript
enum EventType {
  // ── Run lifecycle ──────────────────────────
  RUN_STARTED                    // Run begins
  RUN_FINISHED                   // Run ends (check outcome field)
  RUN_ERROR                      // Run crashed
  USER_CANCELLED                 // User aborted the run

  // ── Review ─────────────────────────────────
  REVIEW_STARTED                 // Review phase begins
  REVIEW_END                     // Review phase ends

  // ── Thinking (internal reasoning) ──────────
  THINKING_START                 // Start of thinking container
  THINKING_TEXT_MESSAGE_START    // Start of a thinking text block
  THINKING_TEXT_MESSAGE_CONTENT  // Incremental thinking text (delta)
  THINKING_ARTIFACTS             // Artifacts generated during thinking
  THINKING_TEXT_MESSAGE_END      // End of thinking text block
  THINKING_END                   // End of thinking container

  // ── Text message (assistant output) ────────
  TEXT_MESSAGE_START             // Start of assistant text block
  TEXT_MESSAGE_CONTENT           // Incremental text chunk (delta)
  TEXT_MESSAGE_ARTIFACTS         // Artifacts attached to text
  TEXT_MESSAGE_END               // End of text block

  // ── Tool calls ─────────────────────────────
  TOOL_CALL_START                // Tool invoked
  TOOL_CALL_ARGS                 // Incremental JSON arguments (delta)
  TOOL_CALL_RESULT               // Tool returned a result
  TOOL_CALL_END                  // Tool execution complete

  // ── Delegate agents (sub-agents) ───────────
  DELEGATE_AGENT_START           // Sub-agent invoked
  DELEGATE_AGENT_RESULT          // Sub-agent finished
  DELEGATE_AGENT_END             // Delegate container closed

  // ── HITL (Human-in-the-Loop) ───────────────
  HITL_INTERRUPT_MESSAGE         // Agent requests human input
  HITL_ANSWER_RECEIVED           // Human response acknowledged

  // ── State snapshots (reconnection) ─────────
  STATE_SNAPSHOT                 // Full run state on reconnect
  STATE_DELTA                    // Incremental state update
  MESSAGES_SNAPSHOT              // Full conversation messages on reconnect

  // ── Notifications ──────────────────────────
  NOTIFY                         // Status notification
  ERROR                          // Error notification

  // ── Raw ────────────────────────────────────
  RAW                            // Unstructured event
}
```

### 4.4 Event Object — `SeinetimeAgentEvent`

Every SSE JSON payload conforms to this shape:

```typescript
type SeinetimeAgentEvent = {
  type: EventType;
  seq: number;                        // Monotonic sequence number
  thread_id: string;                  // Conversation / thread ID
  run_id: string;                     // Current run ID

  // ── Identity ────────────────────────────
  message_id?: string;                // Target message ID
  tool_call_id?: string;              // For TOOL_CALL_* and DELEGATE_* events
  tool_name?: string;                 // Tool name or delegate agent name
  agent?: string;                     // Agent that emitted this event
  parent_id?: string;                 // Parent message ID (for nesting)
  depth?: number;                     // Nesting depth level

  // ── Streaming content ───────────────────
  delta?: string;                     // Incremental text/JSON chunk
  text?: string;                      // Full text content (non-streaming)

  // ── Tool results ────────────────────────
  result?: string;                    // Tool call result (JSON string or plain text)
  is_error?: boolean;                 // Tool call failed

  // ── Run outcome ─────────────────────────
  outcome?: "success" | "interrupt";  // For RUN_FINISHED only
  interrupt?: SeinetimeInterruptData; // For RUN_FINISHED with outcome "interrupt"
  interrupt_id?: string;
  is_finished?: boolean;

  // ── Artifacts ───────────────────────────
  artifacts?: Artifact[];             // Workspace file artifacts

  // ── Notifications ───────────────────────
  level?: "info" | "warning" | "error"; // For NOTIFY / ERROR events

  // ── Metadata ────────────────────────────
  iteration?: number;
  is_from_sub_run?: boolean;          // true when forwarded from a sub-agent
  data?: Record<string, any>;         // Extended structured payload
};
```

### 4.5 Event Handling Reference

How to process each event type:

| Event                          | Action                                                                |
|--------------------------------|-----------------------------------------------------------------------|
| `RUN_STARTED`                  | Save `thread_id` as conversation ID, `run_id`. Mark message running.  |
| `RUN_FINISHED`                 | If `outcome === "success"`: mark complete. If `"interrupt"`: show HITL UI (§9). |
| `RUN_ERROR`                    | Mark message as error. Show `result` or `data` as error details.      |
| `USER_CANCELLED`               | Mark message as cancelled.                                           |
| `THINKING_TEXT_MESSAGE_CONTENT`| Append `delta` to thinking/reasoning text buffer.                     |
| `THINKING_ARTIFACTS`           | Store `artifacts[]` array attached to the thinking block.             |
| `TEXT_MESSAGE_CONTENT`         | Append `delta` to assistant text buffer.                              |
| `TEXT_MESSAGE_ARTIFACTS`       | Store `artifacts[]` array attached to the text message.               |
| `TOOL_CALL_START`              | Create tool call entry with `tool_call_id`, `tool_name`. Status: running. |
| `TOOL_CALL_ARGS`               | Append `delta` to tool call's argument text. Try `JSON.parse()`.     |
| `TOOL_CALL_RESULT`             | Store `result`, `is_error` on the tool call entry.                   |
| `TOOL_CALL_END`                | Mark tool call complete.                                              |
| `DELEGATE_AGENT_START`         | Create delegate entry (like tool call) with empty `messages[]`.       |
| `DELEGATE_AGENT_RESULT`        | Store result on delegate entry.                                       |
| `DELEGATE_AGENT_END`           | Mark delegate complete.                                               |
| `HITL_INTERRUPT_MESSAGE`       | Store interrupt data for UI rendering.                                |
| `HITL_ANSWER_RECEIVED`         | Mark interrupt as resolved.                                           |
| `STATE_SNAPSHOT`               | Replace local run state (reconnect). See `data` payload (§13.3).     |
| `MESSAGES_SNAPSHOT`            | Replace local message list (reconnect). See §6.4 for snapshot format.|
| `NOTIFY`                       | Show notification with `text` and `level`.                            |
| `ERROR`                        | Show error notification with `text` and `level`.                      |

---

## 5. Conversation Lifecycle Flows

### 5.1 New Conversation

```
Client                                   Server
  │                                        │
  │  POST /api/v1/messages                 │
  │  { message: "Hello",                   │
  │    agent: "default",                   │
  │    message_id: "client-uuid" }         │
  │ ──────────────────────────────────────► │
  │                                        │
  │  SSE: RUN_STARTED                      │
  │  { thread_id: "new-conv-id",           │
  │    run_id: "run-1" }                   │
  │ ◄────────────────────────────────────── │  ← Save thread_id as conversation_id
  │                                        │
  │  SSE: TEXT_MESSAGE_START               │
  │  SSE: TEXT_MESSAGE_CONTENT (delta)     │  ← Repeat N times
  │  SSE: TEXT_MESSAGE_CONTENT (delta)     │
  │  SSE: TEXT_MESSAGE_END                 │
  │                                        │
  │  SSE: RUN_FINISHED { outcome:"success"}│
  │ ◄────────────────────────────────────── │
  │                                        │
  │  SSE: data: [DONE]                     │
  │ ◄────────────────────────────────────── │
```

**Key**: The `thread_id` from `RUN_STARTED` becomes the `conversation_id` for all subsequent requests.

### 5.2 Continue Existing Conversation

```
Client                                   Server
  │                                        │
  │  POST /api/v1/messages                 │
  │  { message: "Follow up",              │
  │    conversation_id: "conv-id" }        │
  │ ──────────────────────────────────────► │
  │                                        │
  │  SSE: RUN_STARTED { run_id: "run-2" }  │
  │  SSE: ... (events) ...                 │
  │  SSE: RUN_FINISHED                     │
  │  SSE: [DONE]                           │
```

### 5.3 Join / Reconnect to Conversation

To load an existing conversation's history (switch to thread or reconnect):

```
Client                                   Server
  │                                        │
  │  POST /api/v1/messages                 │
  │  { conversation_id: "conv-id" }        │
  │  (no message field)                    │
  │ ──────────────────────────────────────► │
  │                                        │
  │  SSE: MESSAGES_SNAPSHOT                │  ← Full message history
  │  { data: { messages: [...] } }         │
  │                                        │
  │  SSE: STATE_SNAPSHOT                   │  ← Current run state
  │  { data: { run, open_containers,       │
  │    interrupt_data, resolved_interrupts,│
  │    last_completed_seq } }              │
  │                                        │
  │  If run is still active:               │
  │  SSE: TEXT_MESSAGE_CONTENT (live)      │  ← Continue receiving events
  │  ...                                   │
  │                                        │
  │  If run is finished:                   │
  │  SSE: [DONE]                           │
```

### 5.4 Cancel a Running Conversation

```
Client                                   Server
  │                                        │
  │  1. Close SSE reader (abort)           │
  │                                        │
  │  POST /api/v1/conversation/:id/cancel  │
  │ ──────────────────────────────────────► │
  │                                        │
  │  { "code": 200, "message": "ok" }     │
  │ ◄────────────────────────────────────── │
```

### 5.5 Complete Flow: Text + Tool Call + Artifact

```
Client                                   Server
  │  POST /api/v1/messages                 │
  │  { message: "Analyze sales data" }     │
  │ ──────────────────────────────────────► │
  │                                        │
  │  SSE: RUN_STARTED                      │
  │                                        │
  │  SSE: THINKING_START                   │  ← Thinking phase
  │  SSE: THINKING_TEXT_MESSAGE_CONTENT    │
  │    { delta: "I need to search..." }    │
  │  SSE: THINKING_END                     │
  │                                        │
  │  SSE: TOOL_CALL_START                  │  ← Tool call
  │    { tool_call_id: "tc-1",             │
  │      tool_name: "knowledge_search" }   │
  │  SSE: TOOL_CALL_ARGS                   │
  │    { delta: '{"query":"sales Q3"}' }   │
  │  SSE: TOOL_CALL_RESULT                 │
  │    { result: '{"passages_count":5}'  } │
  │  SSE: TOOL_CALL_END                    │
  │                                        │
  │  SSE: TEXT_MESSAGE_START               │  ← Response text
  │  SSE: TEXT_MESSAGE_CONTENT             │
  │    { delta: "Based on the data [^1]" } │
  │  SSE: TEXT_MESSAGE_CONTENT             │
  │    { delta: ", sales grew 15% [^2]." } │
  │  SSE: TEXT_MESSAGE_ARTIFACTS           │  ← Artifact generated
  │    { artifacts: [{                     │
  │        type: "workspace",              │
  │        name: "sales_analysis.csv",     │
  │        content: "/ws/sales_analysis.csv"│
  │    }] }                                │
  │  SSE: TEXT_MESSAGE_END                 │
  │                                        │
  │  SSE: RUN_FINISHED { outcome:"success"}│
  │  SSE: [DONE]                           │
```

---

## 6. Message Data Model

### 6.1 Backend Message — `ApiMessage`

Returned in `MESSAGES_SNAPSHOT` and REST endpoints:

```typescript
type ApiMessage = {
  id: string;
  created_at: string;               // ISO 8601
  updated_at: string;
  deleted_at?: string;
  role: "user" | "assistant" | "system";
  type: string;                      // See §6.2
  content: string;                   // Text content or JSON string
  data?: string;                     // Additional JSON data
  metadata?: Record<string, unknown>;
  user_id: string;
  partner_id: string;
  partner_system_id: number;
  conversation_id: string;
  run_id: string;
  seq: number;                       // Ordering sequence
  parent_id?: string;                // Parent message (for nesting)
  tool_call_id?: string;
  depth: number;                     // Nesting depth
};
```

### 6.2 Message Types (Backend `type` field)

| Type          | Description                              |
|---------------|------------------------------------------|
| `"text"`      | Standard text message (user or assistant)|
| `"tool_call"` | Tool invocation record                   |
| `"thinking"`  | Agent's internal reasoning               |
| `"interrupt"` | HITL interrupt record                    |

### 6.3 Message Metadata Fields

The `metadata` object on `ApiMessage` can contain:

```typescript
{
  tool_call_id?: string;        // For tool_call messages
  tool_name?: string;           // Tool that was called
  tool_sub_event?: string;      // "start" | "args" | "result"
  tool_args?: Record<string, unknown>;
  interrupt_id?: string;        // For interrupt messages
}
```

### 6.4 Snapshot Message Format (`MESSAGES_SNAPSHOT`)

The `MESSAGES_SNAPSHOT` event contains `data.messages[]` — a union of these types:

#### Text Message

```json
{
  "id": "msg-uuid",
  "role": "user" | "assistant" | "system",
  "content": "message text",
  "metadata": {}
}
```

#### Activity — Thinking / Notify / Error

```json
{
  "id": "msg-uuid",
  "role": "activity",
  "activityType": "thinking" | "notify" | "error",
  "content": { "text": "thinking text..." },
  "metadata": {}
}
```

#### Activity — Tool Call

```json
{
  "id": "msg-uuid",
  "role": "activity",
  "activityType": "tool_call",
  "content": {
    "sub_event": "start" | "args" | "result",
    "tool_call_id": "tc-uuid",
    "tool_name": "knowledge_search",
    "text": "description",
    "result": "{\"data\": ...}",
    "is_error": false,
    "tool_args": { "query": "sales Q3" }
  },
  "metadata": {}
}
```

#### Activity — Delegate Agent

```json
{
  "id": "msg-uuid",
  "role": "activity",
  "activityType": "delegate_agent",
  "content": {
    "sub_event": "delegate_start" | "delegate_result",
    "tool_call_id": "tc-uuid",
    "tool_name": "research_agent",
    "text": "description",
    "result": "agent output",
    "is_error": false
  },
  "metadata": {}
}
```

#### Tool-Call Assistant Message

```json
{
  "id": "msg-uuid",
  "role": "assistant",
  "toolCalls": [
    {
      "id": "tc-uuid",
      "type": "function",
      "function": {
        "name": "knowledge_search",
        "arguments": "{\"query\": \"sales Q3\"}"
      }
    }
  ]
}
```

---

## 7. Tool Call Protocol

### 7.1 Event Sequence

```
TOOL_CALL_START
  │  Fields: tool_call_id, tool_name, agent, message_id, parent_id, depth
  ▼
TOOL_CALL_ARGS          ← May repeat N times
  │  Fields: tool_call_id, delta (incremental JSON argument text)
  ▼
TOOL_CALL_RESULT
  │  Fields: tool_call_id, result (JSON string or plain text), is_error
  ▼
TOOL_CALL_END
     Fields: tool_call_id
```

### 7.2 Building Tool Call Data from Events

```
State per tool_call_id:
  toolName    = ""
  argsText    = ""
  args        = {}
  result      = null
  isError     = false
  status      = "running"

On TOOL_CALL_START:
  toolName = event.tool_name
  status = "running"

On TOOL_CALL_ARGS:
  argsText += event.delta
  try: args = JSON.parse(argsText)

On TOOL_CALL_RESULT:
  result = event.result
  isError = event.is_error ?? false
  status = isError ? "error" : "complete"

On TOOL_CALL_END:
  status = result != null ? "complete" : "incomplete"
```

### 7.3 Tool Call Status Derivation

```
if result !== undefined → "complete"
if parent message is incomplete → "incomplete"
else → "running"
```

### 7.4 Nested Tool Calls

Tool calls can be nested inside delegate agents (see §8). Use `parent_id` and `depth` to build the nesting tree.

### 7.5 Citation Count in Tool Results

Some tool call results include a `passages_count` field (as JSON). This indicates how many knowledge base passages were loaded. Useful for UI indicators like "5 references loaded".

### 7.6 Tool Call Names — Complete Reference

Below is every known `toolName` with its exact `args` and `result` data types.

---

#### 7.6.1 Workspace — File Operations

##### `workspace_read_file`

```typescript
args: {
  path: string;             // File path in workspace
}
result: {
  content: string;          // File content (may be base64-encoded with "data:*;base64," prefix)
}
```

##### `workspace_write_file`

```typescript
args: {
  path: string;             // Target file path
  content: string;          // File content to write
}
result: {
  // File metadata (path, size, etc.)
}
```

##### `workspace_append_file`

```typescript
args: {
  path: string;
  content?: string;
}
result: {
  new_content: string;      // Content after append
  old_content: string;      // Content before append
}
```

##### `workspace_patch_file`

```typescript
args: {
  path: string;
  // ...patch-specific args (diffs, line ranges, etc.)
}
result: {
  new_content: string;      // Content after patch
  old_content: string;      // Content before patch
}
```

##### `workspace_move_file`

```typescript
args: {
  source: string;
  destination: string;
}
result: {
  source: string;
  destination: string;
  success: boolean;
  message?: string;
}
```

##### `workspace_remove_file`

```typescript
args: {
  path: string;
}
result: {
  path: string;
  success: boolean;
  message?: string;
}
```

##### `workspace_get_info`

```typescript
args: {}                    // No arguments
result: {
  dir_count: number;
  file_count: number;
  total_size_bytes: number;
  created_at: string;       // ISO 8601
  top_level_entries: Array<{
    path: string;
    is_dir: boolean;
    size: number;
    modified_at: string;
  }>;
}
```

##### `workspace_list_files`

```typescript
args: {
  // Pagination / filter args
}
result: Array<{
  path: string;
  is_dir: boolean;
  size: number;
  modified_at: string;
}>
```

---

#### 7.6.2 Python Execution

##### `execute_python_code`

```typescript
args: {
  code: string;             // Python code to execute
}
result: string | any        // stdout/stderr output or structured result
```

##### `execute_python_script`

```typescript
args: {
  script: string;           // Python script content
}
result: string | any        // Execution output
```

##### `get_execution_status`

```typescript
args: {}                    // No arguments
result: {
  status: "running" | "complete";
  execution_id?: string;
}
```

---

#### 7.6.3 Connector

##### `connector_execute`

Executes a write/DDL SQL statement.

```typescript
args: {
  query: string;            // SQL statement
  connector_id?: string;    // Target connector
}
result: {
  success: boolean;
  affected_rows: number;
  execution_time_ms: number;
  connector_id?: string;
  message?: string;
} | string                  // String on error
```

##### `connector_query`

Executes a read SQL query and returns tabular data.

```typescript
args: {
  query: string;            // SQL SELECT statement
  connector_id?: string;
}
result: {
  columns: string[];        // Column names
  rows: any[][];            // Row data (array of arrays)
  row_count: number;
  execution_time_ms: number;
  connector_id?: string;
  source_sql?: string;
} | string                  // String on error
```

##### `connector_describe_database`

```typescript
args: {
  connector_id?: string;
}
result: {
  schema: string;           // Schema name
  tables: Array<{
    schema: string;
    name: string;
    type: string;           // "TABLE", "VIEW", etc.
  }>;
  source_sql?: string;
  connector_id?: string;
}
```

##### `connector_describe_table`

```typescript
args: {
  table?: string;           // Table name
  connector_id?: string;
}
result: {
  schema: string;
  name: string;
  columns: Array<{
    name: string;
    type: string;           // Data type (e.g. "VARCHAR", "INTEGER")
    nullable: boolean;
    primaryKey: boolean;
    defaultValue?: string;
  }>;
  source_sql?: string;
  connector_id?: string;
}
```

##### `connector_discover_databases`

```typescript
args: {}                    // No arguments
result: {
  databases: Array<{
    name: string;
    type: string;
    status: string;         // "active" | "inactive" | "error"
  }>;
}
```

##### `connector_list_connectors`

```typescript
args: {}                    // No arguments
result: Array<{
  id: string;
  name: string;
  type: string;
  status: string;
}>
```

---

#### 7.6.4 Email

##### `send_email`

```typescript
args: {
  to: string;               // Recipient email
  subject: string;
  body: string;             // Email body (may contain HTML)
}
result: {
  success: boolean;
  message?: string;
}
```

---

#### 7.6.5 Visualization & Canvas

##### `canvas_preview`

Renders a visual preview in the canvas panel. **Displayed inline in chat.**

```typescript
args: {
  type: "visualize_template";
  run_id: string;
  content: {
    name: string;
    blocks: VisualizeBlock[];    // Chart/table/metric blocks
    params: Record<string, unknown>;
    status: string;
    sources: VisualizeSource[];
    description: string;
  };
  user_id?: string;
  language?: string;
  partner_id?: string;
  tool_call_id?: string;
}
result: any                 // Canvas state
```

##### `visualize_create`

Creates a new visualization. **Displayed inline in chat.**

```typescript
args: {
  tool_call_id: string;
  body: string;             // JSON string (parsed for display — see note)
  run_id: string;
  user_id: string;
  language: string;
  partner_id: string;
}
result: {
  data?: { id: string };    // Created visualization ID
  body?: string;            // JSON string of visualization spec
}
```

> **Note**: When parsing `body` for display, these metadata keys are omitted:
> `user_id`, `conversation_id`, `file_ids`, `domain_ids`, `language`,
> `partner_id`, `is_partner_admin`, `toolcall_id`, `tool_call_id`, `run_id`.

**Client-side data fetching**: After the tool call completes, the client fetches live data for each connector source in the visualization spec:

1. Parse `sources[]` from the visualization template (from `args.body` or `result.body`)
2. Filter sources where `type === "connector"`, `connector_id` is set, and `query` is non-empty
3. For each connector source, populate SQL query parameters by replacing `{{$paramName}}` / `{{paramName}}` placeholders:
   - `string` / `date` → `'value'`
   - `number` → `value` (unquoted)
   - `boolean` → `true` / `false`
   - `select` → `value` if numeric, `'value'` otherwise
4. Call the connector query endpoint for each source:

   ```
   POST {CORE_API_URL}/api/v1/connector/{connector_id}/query
   Content-Type: application/json
   Authorization: Bearer <token>

   { "query": "<populated SQL string>" }
   ```

   **Response**:
   ```json
   {
     "code": 200,
     "msg": "ok",
     "data": {
       "columns": ["col1", "col2"],
       "rows": [["val1", "val2"]],
       "row_count": 1,
       "execution_time_ms": 42,
       "cached": false,
       "partner_id": "...",
       "connector_code": "..."
     }
   }
   ```

5. Convert `rows` + `columns` into `records[]` (array of objects) and store in a map keyed by `source.id`; pass to the renderer

Subsequent param changes (e.g. user adjusts a filter) should re-trigger steps 3–5 to refresh the displayed data.

##### `visualize_update`

Updates an existing visualization. **Displayed inline in chat.** No dedicated detail block — falls back to JSON renderer.

##### `visualize_delete`

Deletes a visualization. **Displayed inline in chat.** No dedicated detail block.

---

#### 7.6.6 Knowledge Base

##### `knowledge_search` / `search_knowledge`

```typescript
args: {
  query: string;            // Search query
  // Additional filter args
}
result: {
  passages_count: number;   // Number of passages retrieved
  passages: Array<{
    id: string;
    text: string;
    file_id: string;
    metadata: any;
  }>;
}
```
#### 7.6.7 Todo / Task Management

##### `todo_create`

```typescript
args: {
  goal?: string;
  tasks?: Array<{ text: string }>;
}
result: {
  run_id: string;           // Groups todo state across tool calls
  task_count?: number;
  goal?: string;
  tasks?: Array<{
    index: number;
    text: string;
    done: boolean;
    result?: string;         // Task completion note
    createdAt?: string;
  }>;
  created_at?: string;       // ISO 8601
  path?: string;
}
```

##### `todo_update_task`

```typescript
args: {
  task_index: number;
  done: boolean;
  result: string;            // Description of what was done
}
result: {
  run_id?: string;
  task_index: number;
  done: boolean;
  result: string;
}
```

##### `todo_add_task`

```typescript
args: {
  task: number;              // Task index
  text?: string;
}
result: {
  run_id?: string;
  task: number;
  added: boolean;
}
```

##### `todo_read` / `todo_list`

```typescript
args: {}
result: {
  // Todo state (tasks array)
}
```
---

### 7.7 Tool Display Categories

| Category               | Tool Names                                                                                  | Detail UI                | Inline in Chat? |
|------------------------|---------------------------------------------------------------------------------------------|--------------------------|-----------------|
| **Workspace Read**     | `workspace_read_file`, `user-file-attachment`                                               | `WorkspaceReadFileBlock` | No              |
| **Workspace Write**    | `workspace_write_file`, `workspace_append_file`, `workspace_patch_file`, `workspace_move_file`, `workspace_remove_file`, `workspace_get_info`, `workspace_list_files` | `WorkSpaceBlock`         | No              |
| **Python**             | `execute_python_code`, `execute_python_script`, `get_execution_status`                       | `PythonBlock`            | No              |
| **Connector**          | `connector_execute`, `connector_query`, `connector_describe_database`, `connector_describe_table`, `connector_discover_databases`, `connector_list_connectors` | `ConnectorBlock`         | No              |
| **Email**              | `send_email`                                                                                 | `EmailBlock`             | No              |
| **Canvas**             | `canvas_preview`, `visualize_create`                                                         | `CanvasPreviewBlock`     | Yes             |
| **Visualization**      | `visualize_update`, `visualize_delete`                                                       | JSON fallback            | Yes             |
| **Knowledge**          | `knowledge_create`, `knowledge_update`, `knowledge_search`, `search_knowledge`               | JSON fallback            | Yes (create/update) |
| **Agent Skills**       | `agent_skill_create`, `agent_skill_update`                                                   | JSON fallback            | Yes             |
| **Todo**               | `todo_create`, `todo_update_task`, `todo_add_task`, `todo_read`, `todo_list`                 | Todo panel               | No              |
| **Citation**           | `citation_view_file`                                                                         | `CitationFileBlock`      | No              |
| **Delegate**           | `{agent_name}` (dynamic)                                                                     | `DelegateAgentCard`      | Yes             |
| **Other**              | Any unknown tool name                                                                        | `JsonRendererBlock`      | No              |

---

## 8. Delegate Agent (Sub-Agent) Protocol

### 8.1 Event Sequence

```
DELEGATE_AGENT_START
  │  Fields: tool_call_id, tool_name (= agent name), agent, depth
  │
  │  ┌── Sub-agent events (is_from_sub_run: true) ──────────────┐
  │  │  TEXT_MESSAGE_START / CONTENT / END                       │
  │  │  TOOL_CALL_START / ARGS / RESULT / END                   │
  │  │  THINKING_START / CONTENT / END                           │
  │  │  HITL_INTERRUPT_MESSAGE (sub-agent can also interrupt)    │
  │  └──────────────────────────────────────────────────────────┘
  │
  ▼
DELEGATE_AGENT_RESULT
  │  Fields: tool_call_id, result (final output text), is_error
  ▼
DELEGATE_AGENT_END
     Fields: tool_call_id
```

### 8.2 Identifying Sub-Agent Events

All events emitted within a delegate have `is_from_sub_run: true`. Use `parent_id` and `depth` to associate them with the correct delegate container.

### 8.3 Building Delegate Data

A delegate is stored like a tool call with an additional `messages[]` array:

```typescript
{
  toolCallId: "delegate-tc-1",
  toolName: "research_agent",
  args: { text: "original task prompt" },
  result: "Final sub-agent output",
  isError: false,
  messages: [
    // Sub-agent's own messages (same structure as top-level messages)
    { role: "assistant", content: [/* text parts, tool calls, etc. */] }
  ]
}
```

---

## 9. HITL Interrupt Protocol

### 9.1 Interrupt Trigger

When the agent needs human input, the run finishes with `outcome: "interrupt"`:

```json
{
  "type": "RUN_FINISHED",
  "outcome": "interrupt",
  "interrupt": {
    "id": "interrupt-uuid",
    "run_id": "run-uuid",
    "original_message_id": "msg-uuid",
    "reason": "human_approval",
    "question": "Should I proceed with deleting 500 records?",
    "options": ["Yes, proceed", "No, cancel"],
    "payload": {}
  }
}
```

A separate `HITL_INTERRUPT_MESSAGE` event is also sent with the same interrupt data.

### 9.2 Interrupt Reasons

```typescript
enum SeinetimeInterruptReason {
  HumanApproval        = "human_approval"
  DatabaseModification = "database_modification"
  UploadRequired       = "upload_required"
  InformationGathering = "information_gathering"
  PolicyHold           = "policy_hold"
  ErrorRecovery        = "error_recovery"
  MultiStepConfirm     = "multi_step_confirm"
}
```

### 9.3 Interrupt Data Structure

```typescript
type SeinetimeInterruptData = {
  id: string;                         // Unique interrupt ID
  run_id: string;                     // The run that paused
  original_message_id: string;        // The message where it paused
  reason: SeinetimeInterruptReason;
  question?: string;                  // What the agent is asking
  options?: string[];                 // Predefined choices (if any)
  payload?: Record<string, unknown>;  // Extra data for rendering
};
```

### 9.4 Resume Payload

```typescript
type ResumePayload = {
  action?: "retry" | "skip" | "abort" | "approve" | "reject";
  tool_name?: string;       // Tool that triggered the interrupt
  answer?: string;           // Free-text response (for information_gathering)
};
```

### 9.5 Resuming from Interrupt

```
POST {AGENT_API_URL}/api/v1/messages
{
  "conversation_id": "conv-id",
  "run_id": "run-id",
  "resume": {
    "interrupt_id": "interrupt-uuid",
    "payload": {
      "action": "approve",
      "answer": "Yes, proceed",
      "tool_name": "delete_records"
    }
  }
}
```

### 9.6 Expected Actions by Reason

| Reason                    | Typical Actions                  | Uses `answer`? | Uses `tool_name`? |
|---------------------------|----------------------------------|----------------|--------------------|
| `human_approval`          | `approve` / `reject`             | No             | Yes (optional)     |
| `database_modification`   | `approve` / `reject`             | No             | Yes (optional)     |
| `upload_required`         | (upload file, then resume)       | Yes (file ref) | No                 |
| `information_gathering`   | (submit free text)               | Yes            | No                 |
| `policy_hold`             | —                                | —              | —                  |
| `error_recovery`          | `retry` / `skip` / `abort`       | No             | Yes (optional)     |
| `multi_step_confirm`      | `approve` / `reject`             | No             | No                 |

### 9.7 HITL Full Sequence Diagram

```
Client                                   Server
  │                                        │
  │  POST /api/v1/messages                 │
  │  { message: "Delete old records" }     │
  │ ──────────────────────────────────────► │
  │                                        │
  │  SSE: RUN_STARTED                      │
  │  SSE: TOOL_CALL_START (delete_records) │
  │  SSE: HITL_INTERRUPT_MESSAGE           │
  │  SSE: RUN_FINISHED                     │
  │    { outcome: "interrupt",             │
  │      interrupt: { id, reason,          │
  │        question, options } }           │
  │  SSE: [DONE]                           │
  │ ◄────────────────────────────────────── │
  │                                        │
  │  (User reviews and decides)            │
  │                                        │
  │  POST /api/v1/messages                 │
  │  { conversation_id: "conv-id",         │
  │    run_id: "run-id",                   │
  │    resume: {                           │
  │      interrupt_id: "interrupt-uuid",   │
  │      payload: { action: "approve" }    │
  │    } }                                 │
  │ ──────────────────────────────────────► │
  │                                        │
  │  SSE: RUN_STARTED                      │
  │  SSE: HITL_ANSWER_RECEIVED             │
  │  SSE: TOOL_CALL_RESULT (success)       │
  │  SSE: TEXT_MESSAGE_CONTENT (...)       │
  │  SSE: RUN_FINISHED { outcome:"success"}│
  │  SSE: [DONE]                           │
  │ ◄────────────────────────────────────── │
```

---

## 10. Artifact Protocol

### 10.1 Artifact Structure

```typescript
type Artifact = {
  type: "workspace";     // Currently only "workspace" supported
  name: string;          // Display name (e.g. "results.csv")
  content: string;       // Workspace file path
};
```

### 10.2 How Artifacts Arrive

Artifacts are delivered in these event types:

| Event                      | When                                    |
|----------------------------|-----------------------------------------|
| `TEXT_MESSAGE_ARTIFACTS`   | During assistant text output            |
| `THINKING_ARTIFACTS`       | During reasoning/thinking phase         |
| `RUN_FINISHED`             | Final artifacts at end of run           |

Each event's `artifacts` field contains an `Artifact[]` array.

### 10.3 Downloading Artifacts

**Option A — Direct download**:

```
GET {AGENT_API_URL}/api/v1/conversation/:convId/artifact?type=workspace&name=results.csv&content=/path/to/file
Authorization: Bearer <token>
```

Returns raw bytes. Content-Type matches the file's MIME type.

**Option B — Signed URL** (for secure/external downloads):

```
POST {AGENT_API_URL}/api/v1/conversation/:convId/artifact/signed-url
Authorization: Bearer <token>
{ "type": "workspace", "name": "results.csv", "content": "/path/to/file" }

→ { "code": 200, "data": "<encrypted-token>" }
```

---

## 11. Citation Protocol

### 11.1 Citation Format in Agent Output

The agent embeds footnote-style citations in its markdown text:

```markdown
Revenue increased by 15% in Q3 [^1] compared to the previous quarter [^2].
```

The number inside `[^N]` maps to a passage `id` from the citations API.

### 11.2 Fetching Citation Data

After a run completes (or during rendering), fetch citation details:

```
GET {AGENT_API_URL}/api/v1/run/:runId/citations
Authorization: Bearer <token>
```

### 11.3 Response Structure

```typescript
{
  passages: Array<{
    id: number;                // Matches [^N] in markdown text
    chunk_index: number;
    page_range: string;        // e.g. "3-5"
    text: string;              // The actual source chunk content
    file_id: string;           // FK to files array
    chunk_content_id: string;
    metadata?: {
      reference?: string;
      content_size?: number;
      page_range?: string;
      type?: string;           // "text", "table", etc.
      asset_mime_type?: string; // "application/pdf", etc.
      token_count?: number;
    };
  }>;
  files: Array<{
    id: string;
    created_at?: string;
    updated_at?: string;
    original_name?: string;    // "quarterly-report.pdf"
    file_extension?: string;   // "pdf"
    mime_type?: string;        // "application/pdf"
    partner_id?: string;
    user_id?: string;
  }>;
}
```

### 11.4 Resolving a Citation

To display citation `[^3]`:

1. Parse `[^3]` from the markdown (regex: `/\[\^(\w+)\]/g`).
2. Fetch citations: `GET {AGENT_API_URL}/api/v1/run/:runId/citations`.
3. Find passage: `passages.find(p => p.id === 3)`.
4. Find source file: `files.find(f => f.id === passage.file_id)`.
5. Display: passage `text` as content, file `original_name` as source.

### 11.5 Caching Strategy

Citations are immutable per run — cache by `runId`. Only fetch once per run.

---

## 12. Trigger Token Format

Trigger tokens are special inline commands embedded in the user's message text. They are sent as plain text within the `message` field — **not** as separate API fields.

### 12.1 Token Syntax

| Trigger | Format                    | Example                    | Purpose                       |
|---------|---------------------------|----------------------------|-------------------------------|
| `#`     | `<#:label>`               | `<#:bug>`                  | Custom tag / topic            |
| `/`     | `</:codeName>`            | `</:canvas-create>`        | Agent skill / command         |
| `@`     | `<@:subType=id>`          | `<@:domain=abc-123>`       | Reference entity              |

### 12.2 Message with Triggers

```json
{
  "message": "Check <#:health> data and </:knowledge-search> for recent <@:domain=abc-123> reports"
}
```

The server parses these tokens and uses them to:
- `#tag` — scope the conversation to a topic
- `/command` — invoke a specific agent skill
- `@mention` — provide entity context to the agent

### 12.3 Parsing Trigger Tokens

Regex to extract all trigger tokens:

```
/<(#|\/|@):([^>]+)>/g

Group 1 = trigger type ("#", "/", "@")
Group 2 = value:
  - "#" → label (e.g., "bug")
  - "/" → codeName (e.g., "canvas-create")
  - "@" → "subType=id" (e.g., "domain=abc-123")
```

### 12.4 Example Parsing

```
Input:  "Analyze <#:revenue> using </:knowledge-search> for <@:domain=acme-corp>"

Extracted triggers:
  { type: "#", value: "revenue" }
  { type: "/", value: "knowledge-search" }
  { type: "@", value: "domain=acme-corp" }   → subType: "domain", id: "acme-corp"

Plain text (triggers removed):
  "Analyze  using  for "
```

---

## 13. Reconnect & Recovery Strategy

### 13.1 When to Reconnect

- SSE stream closes unexpectedly while a run is still active.
- Network error during streaming.
- Inactivity timeout (no events for 60+ seconds while run is active).

### 13.2 Reconnect Algorithm

```
attempt = 0
max_attempts = 10

while attempt < max_attempts:
  delay = min(500 × 2^attempt, 30000)   // 500ms → 1s → 2s → ... → max 30s
  wait(delay)

  // Validate this reconnect is still relevant
  if conversation_changed_since_start:
    return  // Abort — user switched conversations

  try:
    POST {AGENT_API_URL}/api/v1/messages { conversation_id: conv_id }
    // Process MESSAGES_SNAPSHOT, STATE_SNAPSHOT, live events
    return  // Success
  catch:
    attempt += 1

// All attempts failed — mark conversation as disconnected
```

### 13.3 `STATE_SNAPSHOT` Payload

Sent on reconnect to restore the run's current state:

```typescript
type StateSnapshot = {
  run: {
    id: string;
    state: "pending" | "running" | "completed" | "interrupted" | "errored" | "crashed";
    agent: string;
    iteration: number;
    outcome?: "unknown" | "success" | "error" | "cancelled" | "interrupted";
    error_text?: string;
  };
  open_containers?: Array<{
    type: string;
    tool_call_id: string;
    tool_name: string;
    agent?: string;
    depth: number;
  }>;
  interrupt_data?: SeinetimeInterruptData;
  resolved_interrupts?: Array<{
    interrupt_id: string;
    answer_message_id: string;
    reason?: string;
    question?: string;
    payload?: Record<string, any>;
  }>;
  last_completed_seq: number;
};
```

### 13.4 Inactivity Watchdog

Poll every 5 seconds while a run is active:

```
if (now - last_event_time) > 60_000ms:
  abort_sse_connection()
  start_reconnect()
```

### 13.5 Epoch Guard Pattern

Prevent stale async callbacks from corrupting state:

```
epoch = 0

on_switch_conversation():
  epoch += 1
  my_epoch = epoch
  start_stream(
    on_event: (event) => {
      if epoch != my_epoch: return   // Discard stale event
      process(event)
    }
  )
```

---

## 14. Attachment Upload Protocol

### 14.1 Upload Flow

```
Client                                   Server
  │                                        │
  │  POST /api/v1/messages/attachment      │
  │  Content-Type: multipart/form-data     │
  │  file = <binary>                       │
  │ ──────────────────────────────────────► │
  │                                        │
  │  {                                     │
  │    "code": 200,                        │
  │    "msg": "ok",                        │
  │    "data": {                           │
  │      "name": "report.pdf",             │
  │      "original_file": "/store/...",    │
  │      "extracted_file": "/store/..."    │
  │    }                                   │
  │  }                                     │
  │ ◄────────────────────────────────────── │
```

### 14.2 Sending Attachments with Messages

After upload, include file references in the `context.attachments` array:

```json
{
  "message": "Analyze this report",
  "context": {
    "attachments": [
      {
        "type": "file",
        "name": "report.pdf",
        "original_file": "/store/path/report.pdf",
        "extracted_file": "/store/path/report_extracted.txt",
        "mimeType": "application/pdf",
        "size": 204800
      }
    ]
  }
}
```

For images, use `"type": "image"`.

### 14.3 Multiple Files

Upload each file individually in parallel. Collect all upload results, then include all in `context.attachments` when sending the message.

---

## Appendix: API Response Envelope

All REST endpoints (non-SSE) follow this response shape:

```typescript
{
  code: number;      // Business status code (200 = success)
  msg?: string;      // Human-readable message
  message?: string;  // Alternative key for message
  data?: T;          // Response payload
}
```

**Always check both** `response.ok` (HTTP status) **AND** `data.code` (business logic status) for success.
