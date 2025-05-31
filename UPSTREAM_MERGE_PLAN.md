# Upstream Merge Plan

## Current Status
- **Fork Base**: v1.0.13 (commit b7dea5a)
- **Your Commits**: 64 commits
- **Upstream Commits**: 24 commits
- **Current Version**: Your fork is based on v1.0.13, upstream is at v1.0.19

## Key Features in Your Fork (Not in Upstream)
1. **JIRA Integration** - Complete ticket management system
2. **Memory System** - AI agent memory management
3. **Browser Tools** - DevTools Bridge integration
4. **PR Analysis Tool** - GitHub/GitLab/Bitbucket PR review
5. **Architecture Snapshot** - Codebase documentation
6. **Project Management** - Unified project and context management
7. **Translation Tools** - Enhanced i18n support
8. **Checkpoint Tool** - Git commit management
9. **Debug Tools** - Environment checking

## Key Changes in Upstream (Not in Your Fork)
1. **Research Mode** (v1.0.19) - New research functionality
2. **WebGUI Fixes** (v1.0.17-18) - Internationalization improvements
3. **Bug Fixes**:
   - UUID format support for Augment AI
   - Build script quotes fix
   - Gemini model task execution fix
   - Chinese language display fixes
4. **Performance** (v1.0.14) - Token usage optimization
5. **Structural Changes** - Tools reorganized into subdirectories

## Recommended Approach

### Phase 1: Critical Bug Fixes (Cherry-pick)
1. UUID format fix (commit 4264fa7) - Important for compatibility
2. Build script fix (commit 1aab4e4) - Ensures cross-platform builds
3. Gemini model fix (commit 6d8a422) - If using Gemini models

### Phase 2: Feature Integration
1. Research Mode - Evaluate if needed, significant new feature
2. WebGUI improvements - If using the web interface

### Phase 3: Structural Alignment (Optional)
Consider if you want to adopt upstream's new directory structure

## Conflicts to Resolve
- `src/index.ts` - Tool registration differences
- `package.json` - Version and script differences
- Tool file locations - Different organizational structure
- Template deletions - Some templates removed upstream 