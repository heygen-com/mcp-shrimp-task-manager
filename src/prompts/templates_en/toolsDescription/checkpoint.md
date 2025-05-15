A multi-step helper tool that facilitates atomic git checkpoints. It:
1. Gathers git context (status, diff, history) from the agent.
2. Generates a proposed commit plan.
3. Iteratively consults an expert until the plan is approved.
4. Guides the agent to execute the approved git commands, with optional push/dry-run.

Use this to ensure clean, atomic commits and expert-reviewed commit messages. 