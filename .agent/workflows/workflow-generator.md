---
description: Generates a workflow to automate recurring tasks using AI Agent
---

<definition_of_workflow>
Workflows enable you to define a series of steps to guide the Agent through a repetitive set of tasks, such as deploying a service or responding to PR comments. These Workflows are saved as markdown files, allowing you to have an easy repeatable way to run key processes. Once saved, Workflows can be invoked in Agent via a slash command with the format /workflow-name.

While Rules provide models with guidance by providing persistent, reusable context at the prompt level, Workflows provide a structured sequence of steps or prompts at the trajectory level, guiding the model through a series of interconnected tasks or actions.

To create a workflow:

- Create a file under .agent/workflows folder with a descriptive workflow name, with .md extension and content format
- It shall follow the frontmatter format:
<file>
---
description: @Descriptive description
---
@Workflow content
</file>

Workflows are saved as markdown files and contain a title, a description and a series of steps with specific instructions for Agent to follow. Workflow files are limited to 12,000 characters each.
</definition_of_workflow>

According to that, you shall generate workflows to automate desired actions.
