#!/bin/bash

# Log file for debugging
LOG_FILE="/tmp/mcp-shrimp-startup.log"
echo "=== MCP Shrimp Task Manager Starting ===" > "$LOG_FILE"
echo "Timestamp: $(date)" >> "$LOG_FILE"
echo "Script: $0" >> "$LOG_FILE"
echo "PID: $$" >> "$LOG_FILE"

# Log environment variables
echo "Environment variables:" >> "$LOG_FILE"
echo "DATA_DIR: $DATA_DIR" >> "$LOG_FILE"
echo "ENABLE_THOUGHT_CHAIN: $ENABLE_THOUGHT_CHAIN" >> "$LOG_FILE"
echo "TEMPLATES_USE: $TEMPLATES_USE" >> "$LOG_FILE"
echo "ENABLE_GUI: $ENABLE_GUI" >> "$LOG_FILE"
echo "GITHUB_TOKEN exists: $([[ -n "$GITHUB_TOKEN" ]] && echo "yes" || echo "no")" >> "$LOG_FILE"

# Load nvm and use the correct node version
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    echo "Loading nvm from: $NVM_DIR/nvm.sh" >> "$LOG_FILE"
    \. "$NVM_DIR/nvm.sh"
    echo "nvm loaded successfully" >> "$LOG_FILE"
else
    echo "nvm not found at $NVM_DIR/nvm.sh" >> "$LOG_FILE"
fi

# Check node version
echo "Node version: $(node --version 2>&1)" >> "$LOG_FILE"
echo "Node path: $(which node 2>&1)" >> "$LOG_FILE"

# Pass through environment variables from the parent process
# This ensures GITHUB_TOKEN and other env vars from MCP config are available
export GITHUB_TOKEN="${GITHUB_TOKEN}"
export DATA_DIR="${DATA_DIR}"
export ENABLE_THOUGHT_CHAIN="${ENABLE_THOUGHT_CHAIN}"
export TEMPLATES_USE="${TEMPLATES_USE}"
export ENABLE_GUI="${ENABLE_GUI}"

# Check if the index.js exists
INDEX_PATH="/Users/co/dev/agents/shared/mcp-shrimp-task-manager/dist/index.js"
if [ -f "$INDEX_PATH" ]; then
    echo "index.js found at: $INDEX_PATH" >> "$LOG_FILE"
else
    echo "ERROR: index.js not found at: $INDEX_PATH" >> "$LOG_FILE"
fi

echo "Starting MCP server..." >> "$LOG_FILE"
echo "Command: node $INDEX_PATH" >> "$LOG_FILE"

# Run the MCP server.
# Pipe stdout directly to the client (MCP controller).
# Pipe stderr to the log file for startup/debug messages.
exec node "$INDEX_PATH" 2>> "$LOG_FILE" 