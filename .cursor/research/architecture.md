# MCP Shrimp Task Manager - Project Overview for LLMs (Revised)

## 1. Project Goal

MCP Shrimp Task Manager is a task management system built on the Model Context Protocol (MCP). It provides a structured workflow for AI Agents to perform software development tasks. The system emphasizes reasoning, planning, task decomposition, dependency tracking, and learning from past work to enable Agents to handle complex development requests effectively.

This project is a fork of `cjo4m06/mcp-shrimp-task-manager`, managed by Heygen. (Source: [https://github.com/heygen-com/mcp-shrimp-task-manager](https://github.com/heygen-com/mcp-shrimp-task-manager))

## 2. Core Concepts

*   **Model Context Protocol (MCP):** Acts as an MCP server, exposing tools for AI Agents. Agents interact by calling these tools via the protocol. (See: [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/mcp-sdk-js))
*   **Task Lifecycle & Tools:** Manages tasks through distinct phases, each often associated with specific MCP tools. (See Workflow: [README Usage Guide](https://github.com/heygen-com/mcp-shrimp-task-manager/blob/main/README.md#usage-guide))
    *   **Planning (`plan_task`):** Interprets requirements, potentially referencing Project Rules and Task Memory.
    *   **Analysis (`analyze_task`, `process_thought`, `reflect_task`):** Breaks down the problem, explores solutions, and refines understanding. `process_thought` enables optional, detailed step-by-step reasoning.
    *   **Decomposition (`split_tasks`):** Structures the solution into atomic, dependent sub-tasks, persisting them.
    *   **Execution (`execute_task`):** Provides the Agent with context (description, dependencies, related files, complexity) to perform the actual work (e.g., coding). Checks dependencies first.
    *   **Verification (`verify_task`):** Provides context for the Agent to check if the implementation meets criteria.
    *   **Completion (`complete_task`):** Marks tasks as done, generates summaries for memory.
*   **Task Management Tools:** Additional tools manage the task list (`list_tasks`, `query_task`, `get_task_detail`, `update_task`, `delete_task`, `clear_all_tasks`).
*   **Persistence (`DATA_DIR/tasks.json`):** Stores the current state of tasks, including descriptions, status, dependencies, implementation guides, etc. Managed by the Task Persistence Layer (`src/models/`).
*   **Task Memory (`DATA_DIR/memory/`):** Automatically archives completed task states (`tasks_backup_*.json`). The planning phase can leverage this history. *Rationale: Allows the Agent to learn from past solutions and avoid redundant work.*
*   **Project Rules (`DATA_DIR/rules.md`):** Optional file (created via `init_project_rules`) storing project-specific guidelines. Referenced during planning. *Rationale: Ensures consistency in larger projects or team environments.*
*   **Prompt System (`src/prompts/`):** Dynamically generates context-aware prompts for the Agent using markdown templates. Supports multiple languages and customization via environment variables. (See: [README Prompt Customization](https://github.com/heygen-com/mcp-shrimp-task-manager/blob/main/README.md#prompt-language-and-customization))
*   **Configuration:** Key behaviors are controlled via environment variables (see Section 6).
*   **Web GUI (Optional):** A basic web interface (`src/public/`) using [Express.js](https://expressjs.com/) for task visualization, enabled by `ENABLE_GUI=true`.

## 3. High-Level Architecture & Data Flow

1.  **Client (Agent):** Sends an MCP `CallToolRequest` (e.g., `plan_task`) with arguments.
2.  **Entry Point (`src/index.ts`):**
    *   Receives the request via MCP SDK.
    *   Validates arguments against the tool's [Zod](https://zod.dev/) schema (obtained via `ListToolsRequest`).
    *   Routes the validated request to the corresponding tool implementation in `src/tools/`.
3.  **Tool Implementation (`src/tools/*.ts`):**
    *   Executes the core logic for the requested tool.
    *   Often interacts with the Task Persistence Layer (`src/models/taskModel.ts`) to read/write task data.
    *   May use utility functions (`src/utils/`) for file loading, summary generation, etc.
    *   Uses the Prompt Generation system (`src/prompts/`) to create a tailored textual response for the Agent.
4.  **Task Persistence Layer (`src/models/taskModel.ts`):**
    *   Handles all interactions with `tasks.json` (CRUD, status updates, dependency checks).
    *   Manages Task Memory backups.
5.  **Entry Point (`src/index.ts`):** Sends the textual response (or error) back to the Client via MCP SDK.
6.  **Client (Agent):** Receives the response and proceeds based on the provided text/guidance.

## 4. Key Code Components

*   `src/index.ts`: MCP Server setup, request routing, schema definitions.
*   `src/tools/`: Implementations of the MCP tools exposed to the Agent.
    *   `taskTools.ts`: Core task lifecycle and management tools.
    *   `thoughtChainTools.ts`: `process_thought` tool.
    *   `projectTools.ts`: `init_project_rules` tool.
    *   `debugTools.ts`: `log_data_dir` tool.
*   `src/models/taskModel.ts`: Task data persistence and core logic (reading/writing `tasks.json`, memory backups, dependency checks).
*   `src/prompts/`: Prompt generation system.
    *   `loader.ts`: Loads templates, handles customization (Env Vars), injects parameters.
    *   `generators/`: Functions assembling specific prompts.
    *   `templates_*/`: Language-specific markdown prompt templates.
*   `src/types/`: Core TypeScript interfaces (`Task`, `TaskStatus`, etc.).
*   `src/utils/`: Shared helper functions (file loading, path utils, summaries).
*   `.cursor/modes.json`: (If using Cursor IDE) Defines Agent modes (Planner/Executor) affecting available tools and system prompts.

## 5. Notes for Interacting LLMs

*   **Discover Tools:** Always use the MCP `ListToolsRequest` to get the current list of available tools, their exact names, descriptions, and **required input JSON schemas**. Do not rely on potentially outdated documentation.
*   **Adhere to Schemas:** Construct tool arguments (`CallToolRequest.params.arguments`) precisely according to the JSON schema (likely defined using [Zod](https://zod.dev/)) provided by `ListToolsRequest` for that tool. Use the correct data types. Input validation is strict.
*   **Use Tool Responses:** The text content provided in the `CallToolResponse` is generated by the prompt system and contains necessary context or instructions for your next step.
*   **Configuration Awareness:** Understand the impact of key environment variables:
    *   `DATA_DIR`: Determines where all task data, memory, and rules are stored. If this is incorrect, the system will not function properly.
    *   `ENABLE_THOUGHT_CHAIN`: (Default: true) If true, use `process_thought` for detailed reasoning during analysis. If false, analysis might be shorter using just `analyze_task`/`reflect_task`.
    *   `TEMPLATES_USE`: Affects the language and content of prompts you receive.
*   **Cursor Modes:** If operating within Cursor IDE, be aware that `.cursor/modes.json` might restrict available tools or provide specific system prompts depending on the active mode (e.g., "Task Planner" vs. "Task Executor").
*   **Runtime Environment:** The server runs on [Node.js](https://nodejs.org/en/docs).

## 6. Key Configuration

Configuration is primarily via **environment variables**, set either in the MCP client's configuration (e.g., `mcp.json`) or an `.env` file:

*   **`DATA_DIR` (Required):** **Absolute path** to the directory for storing `tasks.json`, `memory/`, `rules.md`. *Rationale: Necessary because the server's working directory might not match the client's, preventing data loss.*
*   **`ENABLE_THOUGHT_CHAIN` (Optional):** `true` (default) or `false`. Controls whether the detailed `process_thought` step is encouraged during task analysis.
*   **`TEMPLATES_USE` (Optional):** Language/template set for prompts (e.g., `en`, `zh`). Defaults to `en`. Allows pointing to custom template directories.
*   **`ENABLE_GUI` (Optional):** `true` or `false` (default). Enables the optional web GUI.
*   **`MCP_PROMPT_*` (Optional):** Environment variables to override or append to default prompt templates (see `src/prompts/loader.ts` and documentation).

## 7. Maintainability Note

This document provides a high-level overview. For specific implementation details, refer to the source code. Maintainers should strive to keep this document updated alongside significant architectural changes or modifications to the core concepts/workflow. 