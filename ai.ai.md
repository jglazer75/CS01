# AI Implementation Guide: CS01 Case Study

This document details the implementation of the two AI-powered features in the CS01 Case Study: the **Term Sheet Analyzer** and the **DealCraft Negotiation** simulation. It is intended to guide developers in recreating or migrating these features to a new system.

## 1. System Overview

Both features utilize a **Client-Server-Database** architecture:
*   **Frontend:** Standard HTML/JS running in a browser (Jekyll site).
*   **Backend:** Node.js Serverless Functions (Vercel).
*   **Database & Storage:** Supabase (PostgreSQL for data, Supabase Storage for files).
*   **AI Engine:** Google Gemini API (`gemini-2.5-flash` model).

## 2. Term Sheet Analyzer

**Location:** Module 3 (`docs/03-the-exercise.md`)
**Objective:** Analyze a user-uploaded term sheet (PDF/DOCX) against the case study context and provide negotiation advice.

### 2.1. Architecture & Data Flow

1.  **User Upload:** User selects a file on the frontend.
2.  **Storage:** Frontend uploads the file directly to Supabase Storage bucket `term-sheet-uploads`.
3.  **Trigger:** Frontend calls the backend API `/api/analyze` with the uploaded filename.
4.  **Processing:**
    *   Backend downloads the file from Supabase.
    *   Extracts text using `mammoth` (DOCX) or `pdf-parse` (PDF).
    *   Loads static case context from `context.json`.
5.  **AI Analysis:** Backend sends the *Case Context* + *Term Sheet Text* + *Prompt* to Gemini.
6.  **Response:** Gemini returns text analysis; Backend sends it to Frontend for display.

### 2.2. Component Details

#### Frontend (`docs/assets/js/term-sheet-analyzer.js`)
*   **Dependencies:** `@supabase/supabase-js` (via CDN).
*   **Key Logic:**
    *   Initializes Supabase client.
    *   Handles file selection and upload to Supabase Storage.
    *   `POST` request to `/api/analyze` with `{ fileName }`.
    *   Renders the returned Markdown/Text response.

#### Backend (`docs/api/analyze.js`)
*   **Runtime:** Node.js.
*   **Dependencies:** `@google/generative-ai`, `@supabase/supabase-js`, `mammoth`, `pdf-parse`.
*   **Key Logic:**
    *   `getFileText(buffer, type)`: Helper to parse PDF/DOCX buffers into raw text.
    *   Retrieves file from Supabase using the filename.
    *   Reads `docs/api/context.json` for grounding the AI.
    *   **Prompt Construction:**
        ```text
        **Case Study Context:** [Content of context.json]
        **User's Term Sheet:** [Extracted Text]
        **Analysis Task:** As an expert... analyze the user's redlined term sheet...
        ```
    *   **Model:** Uses `gemini-2.5-flash` for high-speed, cost-effective text generation.

## 3. DealCraft Negotiation (Chat)

**Location:** Module 3 (`docs/03-the-exercise.md`)
**Objective:** Interactive chat where users negotiate with an AI opponent (playing the opposite role).

### 3.1. Architecture & Data Flow

1.  **Session Creation:**
    *   User uploads term sheet & selects role (NewCo vs BigTech).
    *   Frontend sends file + role to `/api/negotiate` (Action: `create`).
    *   Backend extracts text, determines AI persona, and creates a session row in Supabase `negotiations` table.
    *   Returns `sessionId`.
2.  **Negotiation Loop:**
    *   User sends message to `/api/negotiate` (Action: `send_message`) with `sessionId`.
    *   Backend fetches session history & context from Supabase.
    *   Backend calls Gemini with full context (Persona + Case Data + History + New Message).
    *   Backend appends User & AI messages to Supabase history.
    *   Returns AI response to Frontend.

### 3.2. Database Schema (Supabase)

Table: `negotiations`

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key (Session ID) |
| `created_at` | Timestamp | Creation time |
| `user_role` | Text | 'NewCo' or 'BigTech' |
| `ai_role` | Text | Opposite of user_role |
| `original_term_sheet` | Text | Extracted text from uploaded file |
| `history` | JSONB | Array of message objects: `[{ "speaker": "user|ai", "content": "..." }]` |
| `status` | Text | 'initializing', 'active', etc. |

### 3.3. Component Details

#### Frontend (`docs/assets/js/dealcraft.js`)
*   **State:** Manages `sessionId`, loading states, and chat UI.
*   **Actions:**
    *   `startNegotiation()`: `POST` (multipart/form-data) to `/api/negotiate` with file & role.
    *   `sendMessage()`: `POST` (JSON) to `/api/negotiate` with `sessionId` & message text.
    *   `addMessageToHistory()`: Updates the DOM with new messages.

#### Backend (`docs/api/negotiate.js`)
*   **Runtime:** Node.js (Vercel Serverless).
*   **Configuration:** Disables default body parser (`export const config = { api: { bodyParser: false } }`) to handle `multipart/form-data` manually via `formidable`.
*   **Context Files:**
    *   `context.json`: General facts about the case.
    *   `negotiation-context.json`: Specific personas/objectives for "NewCo" and "BigTech".
*   **Prompt Engineering:**
    *   Dynamically loads the persona based on `ai_role`.
    *   Injects the entire conversation history into the prompt to maintain context (stateless API).
    *   **Prompt Structure:**
        ```text
        **Case Context:** [context.json]
        **Your Persona:** [negotiation-context.json for AI Role]
        **Negotiation History:** [Previous turns]
        **User's Latest Message:** [Input]
        **Your Task:** concise and strategic response...
        ```

## 4. Configuration & Environment Variables

To recreate this system, the following environment variables are required:

| Variable | Description |
| :--- | :--- |
| `GEMINI_API_KEY` | Google AI Studio API Key |
| `SUPABASE_URL` | URL of the Supabase project |
| `SUPABASE_SERVICE_KEY` | Service role key (backend only) for DB access |
| `SUPABASE_ANON_KEY` | Anonymous key (frontend) for Storage upload |

## 5. File Structure Reference

*   **Frontend Logic:** `docs/assets/js/`
*   **Backend Logic:** `docs/api/`
*   **Context Data:** `docs/api/*.json`
*   **Storage:** Supabase Bucket `term-sheet-uploads`

## 6. Migration Notes

*   **State Management:** The current implementation relies on Supabase to persist chat history because Vercel functions are stateless. If migrating to a stateful server (e.g., Express.js on a VM), in-memory session stores could be used, but database persistence is recommended for reliability.
*   **Model Selection:** The code uses `gemini-2.5-flash`. If upgrading, ensure the model name is updated in the `getGenerativeModel` call.
*   **Security:** Ensure `SUPABASE_SERVICE_KEY` is never exposed to the client. The frontend only uses the `SUPABASE_ANON_KEY`.
