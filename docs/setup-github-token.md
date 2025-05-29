# Setting up GitHub Token for Testing

## Why You Need a Token

- **Public repos**: Without a token, you're limited to 60 requests/hour
- **Private repos**: Token is required with `repo` scope
- **With token**: Rate limit increases to 5,000 requests/hour

## How to Create a GitHub Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a name like "MCP PR Context Testing"
4. Select scopes:
   - `repo` (full control of private repositories) - if you need private repo access
   - `public_repo` (access to public repositories) - if you only need public repos
5. Click "Generate token"
6. Copy the token immediately (you won't see it again!)

## Setting the Token

### For Testing (Recommended - Using .env file)

The test scripts automatically load from `.env` file:

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your token:
   ```bash
   GITHUB_TOKEN=ghp_your_actual_token_here
   ```

3. Run any test script - it will automatically load the token:
   ```bash
   node test-github-pr-tool.js
   ```

### For Testing (Temporary)
```bash
export GITHUB_TOKEN=ghp_your_token_here
```

### For Permanent Use
Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):
```bash
echo 'export GITHUB_TOKEN=ghp_your_token_here' >> ~/.zshrc
source ~/.zshrc
```

### For MCP Configuration
Add to your MCP configuration:
```json
{
  "mcpServers": {
    "shrimp-task-manager": {
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here",
        "DATA_DIR": "/path/to/data"
      }
    }
  }
}
```

## Verify Token is Set
```bash
# Check if token is set
echo $GITHUB_TOKEN

# Test with the tool
node test-github-pr-tool.js
```

## Security Notes

- Never commit your token to git
- Add `.env` to `.gitignore` if using .env files
- Tokens expire - regenerate if needed
- Use minimal scopes needed for your use case 