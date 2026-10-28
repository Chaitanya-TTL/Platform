# Anti-Slop Oxlint Plugin Installation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the vendored generic anti-slop Oxlint plugin to the frontend as a separate code-quality tool, without changing the discovery UI or replacing ESLint.

**Architecture:** Install the bundled plugin under `OrchestrationPlatform/frontend/tools/oxlint/anti-slop`, pin Oxlint and `@oxlint/plugins` to compatible exact versions, register the plugin and generic rules in a frontend-local `.oxlintrc.json`, and ignore owned agent-tooling/vendor paths. Preserve existing ESLint scripts and unrelated dependency ranges.

**Tech Stack:** npm, Oxlint, `@oxlint/plugins`, vendored TypeScript plugin.

**Spec:** [../specs/2026-10-28-lattice-discovery-redesign-design.md](../specs/2026-10-28-lattice-discovery-redesign-design.md) — separate tooling follow-up.

## Global Constraints

- Target only `OrchestrationPlatform/frontend`; its package manager is npm and its existing lint command is ESLint.
- The frontend currently has no Oxlint dependency/configuration and no direct `effect` dependency; install only the generic plugin.
- Pin exact matching Oxlint and `@oxlint/plugins` versions; do not replace the package manager or rewrite unrelated dependency ranges.
- Preserve the vendored license and provenance files. Ignore the vendored plugin and existing agent-tooling directories without broadly ignoring dot-directories.
- Do not suppress rules, lower severities, fix unrelated source findings, or weaken TypeScript types.
- If npm access still fails with the observed local issuer-certificate error, stop and report it; never disable TLS verification or change npm strict-SSL settings.

## Review Focus

- **The installed source must match its provenance record.** Verify `UPSTREAM.md`, license, and copied plugin paths against the files actually installed.
- **Owned source must not be hidden by ignores.** Review every ignore entry and confirm application source and tests remain linted.
- **The plugin must load under the pinned versions.** Run `npx oxlint --version` and a targeted lint invocation after installation.
- **Existing ESLint behavior must remain intact.** Run `npm run lint` after adding the separate Oxlint config.
- **Pre-existing lint findings must not be silently “fixed.”** Report diagnostics outside the requested installation scope.

---

## File Map

- `OrchestrationPlatform/frontend/tools/oxlint/anti-slop/` — vendored plugin source, license, and upstream provenance, created by the skill installer.
- `OrchestrationPlatform/frontend/package.json` — exact dev dependency pins; leave the existing `lint` script unchanged.
- `OrchestrationPlatform/frontend/package-lock.json` — npm lockfile changes for the two pinned dev dependencies.
- `OrchestrationPlatform/frontend/.oxlintrc.json` — new generic plugin registration, ignores, and rule configuration.

## Task

### Task 1: Install and verify the generic anti-slop Oxlint plugin

**Files:**
- Create: `OrchestrationPlatform/frontend/tools/oxlint/anti-slop/**`
- Create: `OrchestrationPlatform/frontend/.oxlintrc.json`
- Modify: `OrchestrationPlatform/frontend/package.json`
- Modify: `OrchestrationPlatform/frontend/package-lock.json`

**Interfaces:**
- Keep the existing `npm run lint` ESLint command unchanged.
- Register `./tools/oxlint/anti-slop/index.ts` as the generic `anti-slop` plugin.
- Enable every generic rule listed in the install skill, plus native `oxc/no-accumulating-spread`, at `"error"`.
- Do not register the opt-in Effect plugin because the frontend manifest has no direct `effect` dependency.

- [ ] **Step 1: Confirm the target is still absent and record the clean installation boundary**

From `OrchestrationPlatform/frontend`, verify `tools/oxlint/anti-slop/`, `.oxlintrc.json`, and Oxlint packages are still absent. Inspect hidden tooling directories and merge only the necessary ignore paths; do not overwrite an existing plugin.

- [ ] **Step 2: Install the vendored plugin**

From `OrchestrationPlatform/frontend`, run:

```powershell
node ../../.agents/skills/install-anti-slop/scripts/install.mjs
```

Expected: `tools/oxlint/anti-slop/` is created with the generic rules, required license, and upstream record. If the destination already exists, stop and follow the skill’s update workflow instead of replacing it.

- [ ] **Step 3: Query and install exact compatible dependencies**

Run:

```powershell
npm view oxlint version
npm view @oxlint/plugins version
```

Install both at the same exact current version returned by the registry:

```powershell
npm install --save-dev --save-exact oxlint@<version> @oxlint/plugins@<version>
```

Expected: only these development dependencies and their lockfile resolution are added. If registry access fails with the local certificate error, stop without changing TLS settings.

- [ ] **Step 4: Add the generic Oxlint configuration**

Create `.oxlintrc.json` with the vendored plugin path, `oxc/no-accumulating-spread`, and all generic rules listed in the install skill at `"error"`. Add ignores for `.agents/**` and `tools/oxlint/anti-slop/**`, plus any other repository-local agent tooling directories found in Step 1. Do not use a broad dot-directory ignore.

- [ ] **Step 5: Verify provenance, plugin loading, lint, and type safety**

Run from `OrchestrationPlatform/frontend`:

```powershell
npx oxlint --version
npx oxlint features/lattice-next/discovery/DiscoveryWorkspace.tsx features/lattice-next/discovery/RecentInvestigations.tsx
npm run lint
npx tsc --noEmit
```

Expected: Oxlint loads the local plugin, targeted files are checked, existing ESLint remains available, and type checking passes. Report any unrelated existing diagnostics rather than suppressing or repairing them.

- [ ] **Step 6: Review the final diff and commit the isolated tooling change**

Confirm only the vendored plugin, `.oxlintrc.json`, `package.json`, and `package-lock.json` are included. Verify the upstream record describes the exact source copied.

```powershell
git add OrchestrationPlatform/frontend/tools/oxlint/anti-slop OrchestrationPlatform/frontend/.oxlintrc.json OrchestrationPlatform/frontend/package.json OrchestrationPlatform/frontend/package-lock.json
git commit -m "chore: install anti-slop oxlint plugin"
```
