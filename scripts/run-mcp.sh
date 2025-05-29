#!/bin/bash

# Load nvm and use the correct node version
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Pass through environment variables from the parent process
# This ensures GITHUB_TOKEN and other env vars from MCP config are available
export GITHUB_TOKEN="${GITHUB_TOKEN}"
export DATA_DIR="${DATA_DIR}"
export ENABLE_THOUGHT_CHAIN="${ENABLE_THOUGHT_CHAIN}"
export TEMPLATES_USE="${TEMPLATES_USE}"
export ENABLE_GUI="${ENABLE_GUI}"

# Run the MCP server
exec node /Users/co/dev/agents/shared/mcp-shrimp-task-manager/dist/index.js 