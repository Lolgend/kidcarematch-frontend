# Issue tracker: GitHub

Issues and specs live in GitHub Issues for
Lolgend/kidcarematch-frontend. Use the gh CLI from this repo.

## Conventions

- Verify the target before creating issues:
  `gh repo view --json nameWithOwner`.
- Create: `gh issue create --title "..." --body-file <path>`.
  For multiline text, write the exact body to a temporary file.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,labels`.
  Apply label and state filters as needed.
- Comment: `gh issue comment <number> --body-file <path>`.
- Labels: `gh issue edit <number> --add-label "..."` or
  `--remove-label "..."`. Read docs/agents/triage-labels.md for names.
- Close: post the explanation as a comment, then run
  `gh issue close <number>`. Post explanations separately even
  when the issue is already closed.

## Sub-issues and blockers

- Create a child: `gh issue create --parent <parent> ...`.
- Link an existing child:
  `gh issue edit <parent> --add-sub-issue <child>`.
- Add a dependency:
  `gh issue edit <child> --add-blocked-by <blocker>`.
- Count open blockers:
  `gh api repos/Lolgend/kidcarematch-frontend/issues/<number> --jq .issue_dependencies_summary.blocked_by`.

If native relationships are unavailable, put `Part of #<parent>`
or `Blocked by: #<number>` at the top of the child body.
A ticket is startable when all blockers are closed.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill terminology

"Publish to the issue tracker" means create a GitHub issue.
"Fetch the relevant ticket" means read its GitHub issue.

## Wayfinding

Use one map issue labelled wayfinder:map and child issues labelled
wayfinder:research, wayfinder:prototype, wayfinder:grilling,
or wayfinder:task.

Link children as sub-issues; if unavailable, use a task list in the
map and a `Part of #<map>` line in each child.

Select the first open, unassigned child in map order with no open
blockers. Claim it with `gh issue edit <number> --add-assignee @me`.
Resolve it by commenting the result, closing it, and adding a
result pointer to the map's Decisions-so-far.
