---
description: Update workspace rules based on project changes and evolution
---

# Update Rules Workflow

This workflow updates existing workspace-rules.md based on project changes and evolution.

## Steps

### 1. Read Current Rules

1. Read the existing `.agent/rules/workspace-rules.md`
2. Identify current rule categories and content
3. Note the last update context if available

### 2. Analyze Recent Changes

Ask the user:
- What has changed in the project?
- Any new packages, features, or patterns added?
- Any deprecated patterns or removed code?
- Any new constraints or requirements?

If not specified, analyze:
1. Check for new files/directories not covered by rules
2. Look for pattern changes in recent code
3. Identify new dependencies or tools

### 3. Identify Rule Gaps

Compare current state with rules:
- **Missing Rules**: New patterns without guidance
- **Outdated Rules**: Rules for removed/changed patterns
- **Conflicting Rules**: Rules that don't match actual code
- **Incomplete Rules**: Rules needing more detail

### 4. Propose Updates

Create a summary of proposed changes:

```markdown
## Rules to Add
- [New rule and rationale]

## Rules to Update
- [Existing rule] → [Updated version]
- Reason: [Why it needs updating]

## Rules to Remove
- [Obsolete rule]
- Reason: [Why it's no longer needed]
```

Request user approval before proceeding.

### 5. Apply Updates

After approval:
1. Update `.agent/rules/workspace-rules.md`
2. Preserve the YAML frontmatter structure
3. Keep existing valid rules intact
4. Add new rules in appropriate sections
5. Remove or update outdated rules

### 6. Validate Updated Rules

1. Ensure no duplicate or conflicting rules
2. Verify rules are actionable and specific
3. Check that all project areas are covered
4. Confirm rules match current codebase state

### 7. Summarize Changes

Report:
- Rules added
- Rules modified
- Rules removed
- Recommendations for future updates
