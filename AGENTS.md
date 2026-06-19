# Agents

Read `CLAUDE.md` — it is the canonical source of architecture, conventions, and domain knowledge for this project.

## Skills

Reusable agent skills live in `.agents/skills/`. Load the relevant skill before executing it.

| Skill     | File                                                                   | Description                                                  |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| deslop    | [.agents/skills/deslop/SKILL.md](.agents/skills/deslop/SKILL.md)       | Remove AI-generated code slop from a branch diff             |
| commit    | [.agents/skills/commit/SKILL.md](.agents/skills/commit/SKILL.md)       | Propose a conventional commit message for the current diff   |
| changelog | [.agents/skills/changelog/SKILL.md](.agents/skills/changelog/SKILL.md) | Add user-facing entries to CHANGELOG.md's Unreleased section |
