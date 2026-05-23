# Qwen Code Integration Plan

## Overview

Add Qwen Code as a first-class Happy agent while reusing the existing generic ACP runner. The recommended implementation starts Qwen Code as a per-session stdio ACP process:

```text
Happy App / happy qwen
  -> Happy daemon spawn session
  -> happy-cli runAcp({ agentName: "qwen", command: "qwen", args: ["--acp"] })
  -> AcpBackend spawns qwen --acp over stdio
  -> Qwen ACP agent emits events
  -> AcpSessionManager maps events to Happy session protocol
  -> Happy clients render text, tools, permissions, models, and modes
```

This should be a moderate, low-risk integration because Happy already has the right transport shape for ACP agents and Qwen Code exposes ACP mode directly.

## Sources Checked

- Local Qwen CLI: `qwen --version` -> `0.16.0`
- Qwen Code source snapshot: `QwenLM/qwen-code` at `0cb9ff0` from `2026-05-22`
- Qwen README documents interactive, headless, SDK, and experimental daemon modes.
- Qwen CLI source starts ACP mode when `argv.acp || argv.experimentalAcp`.
- Qwen TypeScript SDK supports `query()`, `permissionMode`, `canUseTool`, `mcpServers`, `authType`, `continue`, `resume`, and `sessionId`.

Primary references:

- https://github.com/QwenLM/qwen-code#usage
- https://github.com/QwenLM/qwen-code/tree/main/packages/sdk-typescript
- https://qwenlm.github.io/qwen-code-docs/en/users/qwen-serve
- https://qwenlm.github.io/qwen-code-docs/en/developers/qwen-serve-protocol

## Goals

- Support `happy acp qwen` as the generic ACP path.
- Support a first-class `happy qwen` command for parity with `happy gemini`, `happy codex`, and `happy openclaw`.
- Allow the Happy app and Happy Agent runtime to spawn Qwen sessions remotely.
- Detect `qwen` availability in machine metadata and show it in the app.
- Prefer Qwen-provided ACP metadata for model and mode selectors.
- Keep Qwen authentication local for v1, using Qwen's own `qwen auth`, `~/.qwen/settings.json`, or environment configuration.
- Avoid regressions for Claude, Codex, Gemini, OpenClaw, OpenCode, and custom ACP agents.

## Non-goals for v1

- Do not build on top of `qwen serve` initially. It is useful, but adds another daemon/session layer inside Happy's own daemon model.
- Do not build a direct `@qwen-code/sdk` adapter initially. It is viable but requires a separate message and permission mapper.
- Do not add a Happy-hosted Qwen OAuth broker in the first pass.
- Do not hardcode a complete Qwen model catalog. Qwen model configuration is user/provider-specific and should mainly come from Qwen metadata or user config.
- Do not enable file/image attachments for Qwen until the attachment path is verified end-to-end.

## Current Happy Integration Points

| Area | Current files | Required Qwen change |
| --- | --- | --- |
| Generic ACP config | `packages/happy-cli/src/agent/acp/acpAgentConfig.ts` | Add `qwen: { command: "qwen", args: ["--acp"] }` |
| ACP runner | `packages/happy-cli/src/agent/acp/runAcp.ts` | Add Qwen flavor/metadata handling where needed |
| CLI routing | `packages/happy-cli/src/index.ts` | Add `happy qwen`; update help text |
| Daemon spawning | `packages/happy-cli/src/daemon/run.ts` | Allow `qwen` in spawn/resume command paths |
| RPC spawn options | `packages/happy-cli/src/modules/common/registerCommonHandlers.ts` | Add `qwen` to agent union |
| CLI availability | `packages/happy-cli/src/utils/detectCLI.ts`, `packages/happy-cli/src/api/types.ts` | Detect `qwen`; include it in machine metadata |
| Happy Agent runtime | `packages/happy-agent/src/machineRpc.ts`, `packages/happy-agent/src/index.ts` | Add `qwen` to supported agent list |
| App new-session UI | `packages/happy-app/sources/app/(app)/new/index.tsx` | Add Qwen as a selectable agent |
| App spawn types | `packages/happy-app/sources/sync/ops.ts` | Add `qwen` to `SpawnSessionOptions.agent` |
| App persisted defaults | `packages/happy-app/sources/sync/agentDefaults.ts`, `packages/happy-app/sources/sync/persistence.ts` | Add Qwen defaults and last-used storage support |
| App model/mode UI | `packages/happy-app/sources/components/modelModeOptions.ts` | Add Qwen fallback permission modes and optional model fallback |
| App machine details | `packages/happy-app/sources/app/(app)/machine/[id].tsx` | Show Qwen CLI availability |
| App session info | `packages/happy-app/sources/app/(app)/session/[id]/info.tsx` | Render flavor label as `Qwen` |
| Shared schemas | `packages/happy-app/sources/sync/storageTypes.ts`, `packages/happy-wire`, if applicable | Widen agent/flavor metadata to include `qwen` |
| Server encrypted storage | `packages/happy-server/prisma/schema.prisma`, session/machine routes | No schema change expected; session and machine metadata are encrypted blobs |
| Server vendor tokens | `packages/happy-server/sources/app/api/routes/connectRoutes.ts` | No v1 change unless adding `happy connect qwen` / cloud-stored Qwen credentials |
| Wire message meta | `packages/happy-wire/src/messageMeta.ts` | Widen `permissionMode` enum if Qwen modes are sent through shared wire schemas |

## Recommended Architecture

### Preferred v1: stdio ACP

Use Qwen's built-in ACP process mode:

```text
happy acp qwen
  -> resolveAcpAgentConfig(["qwen"])
  -> { agentName: "qwen", command: "qwen", args: ["--acp"] }
  -> runAcp(...)
  -> AcpBackend.start()
  -> qwen --acp
```

Benefits:

- Reuses the same path as generic ACP and Gemini-like agents.
- Keeps one Qwen process per Happy session, matching Happy's existing remote-session lifecycle.
- Avoids adding Qwen-specific protocol mapping for v1.
- Lets Qwen manage its own provider config, auth, MCP setup, and model catalog.

### Alternative: TypeScript SDK adapter

The Qwen SDK is a good future option if Happy needs tighter control over Qwen process lifecycle, prompt streaming, embedded MCP servers, or custom permission behavior. It should not be the first implementation because Happy would need to map Qwen SDK message types into Happy session envelopes directly.

### Deferred: `qwen serve`

`qwen serve` exposes ACP over HTTP+SSE and is useful for external clients sharing one agent. For Happy, it introduces:

- A second daemon-like process under the Happy daemon.
- HTTP auth and local port lifecycle concerns.
- Shared-session routing decisions that Happy already owns.

Keep this as a future optimization only if there is a concrete need for shared Qwen process pools.

## User Experience

### CLI

Supported commands after v1:

```bash
happy acp qwen
happy qwen
happy qwen -- <extra-qwen-flags>
```

The simplest implementation can make `happy qwen` a thin wrapper around:

```typescript
runAcp({
  credentials,
  agentName: 'qwen',
  command: 'qwen',
  args: ['--acp', ...passthroughArgs],
  startedBy,
});
```

For v1, do not resolve Qwen credentials in Happy. If Qwen is not authenticated, surface Qwen's own error and document:

```bash
qwen auth
# or configure ~/.qwen/settings.json / environment variables
```

### App

Add Qwen Code to the new-session agent picker with:

- Label: `Qwen Code`
- Internal agent key: `qwen`
- CLI availability key: `metadata.cliAvailability.qwen`
- Default permission mode: `default`
- Default model mode: no explicit model unless user selected one or ACP metadata provides options

The session input should prefer backend metadata for Qwen:

- `metadata.models[]`
- `metadata.currentModelCode`
- `metadata.operatingModes[]`
- `metadata.currentOperatingModeCode`

Fallback Qwen permission modes, based on the SDK options:

```text
default
plan
auto-edit
auto
yolo
```

Model fallback should stay conservative. If Qwen metadata is absent, show `Default` instead of pretending Happy knows the user's provider-specific Qwen model list.

## Message, Model, and Permission Flow

```text
User selects Qwen in app
  -> SpawnSessionOptions.agent = "qwen"
  -> daemon spawns happy qwen
  -> runAcp creates Happy session metadata { flavor: "qwen" }
  -> AcpBackend initializes Qwen ACP session
  -> Qwen emits config/mode/model metadata if available
  -> runAcp updates Happy session metadata
  -> App model/mode selectors render metadata or Qwen fallbacks
  -> User sends message with meta.model and meta.permissionMode
  -> runAcp forwards prompt and relevant ACP session config changes
```

Permission handling should continue through the existing ACP permission pathway. Implementation must verify that Qwen's permission requests map cleanly through `GenericAcpPermissionHandler`.

## App Implementation Plan

The app should be changed after CLI/daemon can actually spawn Qwen. That keeps the UI from advertising an agent that the machine runtime cannot start yet.

### App data model

Add Qwen to the app's agent unions and persisted defaults:

- `packages/happy-app/sources/sync/persistence.ts`
  - Extend `NewSessionAgentType` with `qwen`.
  - Restore saved drafts with `qwen` instead of falling back to `claude`.
- `packages/happy-app/sources/sync/ops.ts`
  - Extend `SpawnSessionOptions.agent` and the RPC payload type with `qwen`.
- `packages/happy-app/sources/sync/agentDefaults.ts`
  - Add `qwen` to `agentKeys`.
  - Add optional `qwen` override schema field.
  - Add default config: `{ permissionMode: "default", modelMode: "default", effortLevel: null }`.
  - Update `normalizeAgentKey()` to return `qwen`.
- `packages/happy-app/sources/sync/storageTypes.ts`
  - Add `cliAvailability.qwen`.
  - Keep schema backward-compatible by tolerating missing `qwen` from older machines.

Recommended machine availability behavior:

```typescript
const supportsQwen = machine.metadata?.cliAvailability?.qwen === true;
```

Do not assume old daemon metadata has the key.

### App model and permission controls

Qwen should follow the metadata-driven flow used by generic ACP agents:

- `packages/happy-app/sources/components/modelModeOptions.ts`
  - Add `qwen` to `AgentFlavor`-aware helpers.
  - Add Qwen permission fallback:

```text
default
plan
auto-edit
auto
yolo
```

  - Add Qwen model fallback as only:

```text
default
```

  - Prefer `metadata.models[]` and `metadata.operatingModes[]` whenever Qwen ACP provides them.
  - No effort levels for Qwen v1.

Also update `getPermissionStyle()` in the new-session UI so Qwen's `auto-edit` and `auto` modes get sensible colors/icons. Existing Gemini uses `auto_edit`; Qwen SDK documents `auto-edit`, so both spellings should be handled.

### New-session UI

Update `packages/happy-app/sources/app/(app)/new/index.tsx`:

- Add `qwen` to `ALL_AGENTS`:

```typescript
{ key: 'qwen', label: 'qwen code' }
```

- Add `qwen` to `agentIcons`.
- Add image assets:

```text
packages/happy-app/sources/assets/images/icon-qwen.png
packages/happy-app/sources/assets/images/icon-qwen@2x.png
packages/happy-app/sources/assets/images/icon-qwen@3x.png
```

- Keep the current `availableAgents` filter, but make it robust for older machine metadata:

```typescript
return ALL_AGENTS.filter((agent) => availability[agent.key] === true);
```

- When the selected machine has no Qwen CLI, Qwen should simply not appear in the agent cycle/picker.
- When Qwen is selected:
  - worktree is supported.
  - model chip is hidden unless metadata/fallback yields more than one model.
  - effort chip is hidden.
  - permission chip is shown because Qwen has multiple fallback modes.

### Machine and session detail UI

- `packages/happy-app/sources/app/(app)/machine/[id].tsx`
  - Add a `Qwen` row under CLI availability.
  - Treat missing `qwen` as not found or unknown; do not crash on older metadata.
- `packages/happy-app/sources/app/(app)/session/[id]/info.tsx`
  - Render `metadata.flavor === "qwen"` as `Qwen`.

### Message send behavior

Existing `sync.sendMessage()` already sends `model` and `permissionMode` from session state for all agent types. For Qwen:

- Send `meta.permissionMode` when set.
- Send `meta.model` only when selected and not `default`.
- Keep attachments disabled until Qwen ACP file/image handling is verified. Today the app only enables attachments for Claude-flavored sessions.

### App testing checklist

- Agent defaults:
  - `normalizeAgentKey("qwen") === "qwen"`.
  - Qwen default config is `default/default/null`.
  - Qwen overrides persist and clear correctly.
- Model/mode options:
  - Qwen falls back to `Default` model only.
  - Qwen permission fallback includes `default`, `plan`, `auto-edit`, `auto`, `yolo`.
  - Qwen metadata models/modes override fallbacks.
- New-session picker:
  - Qwen appears when `cliAvailability.qwen === true`.
  - Qwen is hidden when `cliAvailability.qwen` is missing or false.
  - Selecting a machine without Qwen switches to the first available agent.
- Spawn operation:
  - `machineSpawnNewSession({ agent: "qwen" })` sends `agent: "qwen"` over RPC.
- Machine/session info:
  - Machine detail renders Qwen CLI availability.
  - Session info shows `Qwen` for `flavor: "qwen"`.

## Implementation Tasks

### Phase 0: Smoke test and branch setup

- [x] Push current `main` to `origin/main`.
- [x] Create dedicated branch `feat/qwen-code-integration`.
- [x] Confirm local `qwen` exists and reports version `0.16.0`.
- [ ] Run a local ACP smoke test with a temporary Happy home:

```bash
HAPPY_HOME_DIR=~/.happy-qwen-dev happy acp qwen
```

If auth is missing, run `qwen auth` outside Happy and retry.

### Phase 0.5: Server and wire compatibility check

- [x] Confirm server routes do not parse encrypted session metadata for agent/flavor-specific behavior.
- [x] Confirm server routes do not parse encrypted machine metadata for `cliAvailability` keys.
- [x] Confirm no Prisma migration is needed for Qwen because `Session.metadata` and `Machine.metadata` are encrypted strings.
- [x] Decide whether Qwen should support cloud-stored credentials in v1:
  - If no, leave `connectRoutes.ts` unchanged. Chosen for v1.
  - If yes, add `qwen` to `/v1/connect/:vendor/*`, update CLI connect flow, and document credential security.
- [x] Widen `packages/happy-wire/src/messageMeta.ts` `permissionMode` if app/CLI code paths still depend on it for Qwen modes such as `auto-edit` and `auto`.
- [x] Add a server regression test only if a server-side vendor token or route/schema change is introduced. No server route/schema change was introduced.

### Phase 1: CLI ACP MVP

- [x] Add `qwen` to `KNOWN_ACP_AGENTS`.
- [x] Update `acpAgentConfig.test.ts` expectations and known-agent cases.
- [x] Add Qwen flavor support in `runAcp.ts`:
  - `resolveSessionFlavor("qwen") -> "qwen"` if type/schema allows it.
- [x] Add `happy qwen` route in `packages/happy-cli/src/index.ts`.
- [x] Update CLI help text with `happy qwen` and `happy acp qwen`.
- [x] Ensure passthrough args do not duplicate `--acp`.
- [x] Add/adjust unit tests for route/config behavior.
- [x] Run:

```bash
pnpm --filter happy exec vitest run src/agent/acp/acpAgentConfig.test.ts src/agent/acp/runAcp.test.ts
pnpm --filter happy typecheck
```

### Phase 2: Daemon and machine support

- [x] Add `qwen` to daemon accepted agent commands.
- [x] Add `qwen` to `SpawnSessionOptions.agent` in CLI common handlers.
- [x] Add `qwen` to `SupportedAgent` in `packages/happy-agent`.
- [x] Add `qwen` CLI availability detection.
- [x] Add `qwen` to machine metadata schemas/types.
- [x] Update machine detail UI to display Qwen CLI installed/not found.
- [x] Add tests for CLI detection and spawn validation.
- [x] Run:

```bash
pnpm --filter happy exec vitest run src/utils/detectCLI.test.ts
pnpm --filter happy-agent test
```

### Phase 3: App first-class agent UX

- [x] Add Qwen to the app new-session picker.
- [x] Add Qwen to `NewSessionAgentType`.
- [x] Add Qwen to app spawn op types.
- [x] Add Qwen defaults in `agentDefaults.ts`.
- [x] Add Qwen fallback permission modes in `modelModeOptions.ts`.
- [x] Keep Qwen model fallback as `Default` unless metadata provides concrete models.
- [x] Add Qwen icon/visual treatment consistent with existing agent picker design.
- [x] Update session info flavor label to include Qwen.
- [x] Add tests for default resolution, model/mode fallbacks, and storage compatibility.
- [x] Run relevant app tests/typecheck.

### Phase 4: Protocol verification

Capture a real Qwen ACP transcript and verify these event classes render correctly:

- [ ] Session init/ready.
- [ ] Plain assistant text.
- [ ] Tool call start/end.
- [ ] Permission request/response.
- [ ] Model list and current model metadata.
- [ ] Operating mode list and current mode metadata.
- [ ] Error message when Qwen auth/config is missing.
- [ ] Graceful cancel/kill.

If Qwen emits ACP content that existing `AcpSessionManager` does not map well:

- [ ] Add targeted mapper support.
- [ ] Add fixture-based tests using the captured Qwen ACP messages.
- [ ] Keep changes generic when possible, and Qwen-specific only when necessary.

### Phase 5: Documentation and release notes

- [x] Document prerequisites:

```bash
brew install qwen-code
# or
npm install -g @qwen-code/qwen-code

qwen auth
```

- [x] Document `happy qwen`.
- [x] Document `happy acp qwen`.
- [x] Add troubleshooting notes for missing auth and missing `qwen` binary.
- [x] Mention that Qwen model/provider selection lives primarily in `~/.qwen/settings.json`.

## Test Plan

Unit tests:

- `packages/happy-cli/src/agent/acp/acpAgentConfig.test.ts`
- `packages/happy-cli/src/agent/acp/runAcp.test.ts`
- CLI availability tests for `qwen`
- Daemon spawn validation tests
- App tests for `agentDefaults`, `modelModeOptions`, and spawn op typing
- Happy Agent tests for supported agent validation

Manual smoke tests:

```bash
pnpm install
pnpm --filter happy cli:install
HAPPY_HOME_DIR=~/.happy-qwen-dev happy daemon stop || true
HAPPY_HOME_DIR=~/.happy-qwen-dev happy daemon start
HAPPY_HOME_DIR=~/.happy-qwen-dev happy acp qwen
HAPPY_HOME_DIR=~/.happy-qwen-dev happy qwen
HAPPY_HOME_DIR=~/.happy-qwen-dev happy doctor
```

App smoke tests:

- Machine page shows Qwen CLI availability.
- New-session page shows Qwen Code only when the selected machine can spawn it, or shows a clear unavailable state.
- Creating a Qwen session starts the local `qwen --acp` process.
- Text/tool/permission events render without app-side crashes.
- Model and mode selectors use metadata when Qwen provides it.

Regression tests:

- `happy acp gemini` still resolves to Gemini config.
- `happy acp opencode` still resolves to OpenCode config.
- `happy acp -- custom-agent --flag` still works.
- `happy gemini`, `happy codex`, `happy openclaw`, and default Claude routes are unchanged.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Qwen ACP event shape differs from Gemini/OpenCode expectations | Missing or malformed UI events | Capture Qwen ACP fixtures and add mapper tests |
| Qwen auth is not configured | Sessions fail at startup | Surface Qwen stderr clearly; document `qwen auth` and `~/.qwen/settings.json` |
| Qwen emits non-JSON stdout before ACP | Transport parse issues | Existing ACP transport filters non-JSON stdout; verify with real Qwen |
| Qwen model list is provider-specific | Bad hardcoded UI options | Prefer metadata; fallback to `Default` only |
| Permission modes differ from SDK docs or ACP metadata | Incorrect approval behavior | Prefer ACP metadata; use SDK mode list only as UI fallback |
| Resume semantics are unclear | Fork/resume UX may be incomplete | Mark Qwen resume unsupported in v1 unless ACP load-session behavior is verified |
| File attachments are unsupported | User may expect image/file uploads | Keep attachments disabled for Qwen until verified |
| `qwen serve` looks tempting | Extra complexity | Defer until there is a concrete shared-process requirement |

## Acceptance Criteria

- `happy acp qwen` starts Qwen through the generic ACP runner.
- `happy qwen` starts a Qwen session from the CLI.
- The daemon can spawn Qwen sessions from remote app requests.
- The app can create a Qwen session from the new-session screen.
- Machine metadata reports Qwen CLI availability.
- Qwen text output, tool calls, permission prompts, and turn lifecycle render correctly.
- Model/mode selection uses Qwen metadata when available and conservative fallbacks otherwise.
- Existing ACP custom-agent behavior still works.
- Existing Claude, Codex, Gemini, OpenClaw, and OpenCode workflows are not regressed.

## Future Enhancements

- Add optional `happy connect qwen` if Happy should broker Qwen/provider credentials.
- Add a direct `@qwen-code/sdk` adapter if Happy needs tighter SDK-native control.
- Add `qwen serve` support if shared multi-client Qwen processes become useful.
- Add Qwen resume/fork support once session id semantics are verified.
- Add file/image attachment support after Qwen ACP file handling is tested.
