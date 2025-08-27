# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibeTree is a cross-platform application for parallel development with AI assistance across multiple git worktrees. It consists of three applications (desktop, server, web) built on shared packages (core, ui) in a monorepo structure.

## Development Commands

```bash
# Install dependencies
pnpm install

# Development (run all services)
pnpm dev:all              # Server (:3002) + Web (:3000) - recommended for full functionality

# Individual services
pnpm dev:desktop          # Electron desktop app
pnpm dev:server           # WebSocket/REST server for web/mobile clients  
pnpm dev:web              # Web/PWA client
pnpm dev:core             # Core package in watch mode
pnpm dev:ui               # UI package in watch mode

# Building
pnpm build                # Build all packages and apps
pnpm build:deps           # Build only shared packages (core + ui)
pnpm build:web            # Build dependencies + web app

# Type checking and linting
pnpm typecheck            # Type check all packages
pnpm lint                 # Lint all packages

# Packaging
pnpm package:desktop      # Package desktop app for distribution
```

## Architecture

### Monorepo Structure
- `apps/desktop/` - Electron app with native terminal via node-pty and IPC communication
- `apps/server/` - Node.js backend with WebSocket/REST API for web/mobile clients
- `apps/web/` - React PWA with mobile-responsive design
- `packages/core/` - Shared business logic, types, and utilities
- `packages/ui/` - Shared React components (Terminal, Tabs, etc.)

### Key Design Patterns

**Adapter Pattern**: All apps use the same `CommunicationAdapter` interface from `packages/core/src/adapters/CommunicationAdapter.ts` for platform abstraction:
- Desktop: IPCAdapter (Electron IPC)
- Web: WebSocketAdapter (WebSocket connection to server)

**Shared Types**: Core types defined in `packages/core/src/types/index.ts`:
- `Worktree`, `GitStatus`, `ShellSession`, `Project`, `IDE`
- Result interfaces: `ShellStartResult`, `WorktreeAddResult`, etc.

### Package Dependencies
- Apps depend on `@vibetree/core` and `@vibetree/ui` (workspace:*)
- Core package provides git utilities, shell management, and communication interfaces
- UI package provides Terminal component and other shared React components

## Development Workflow

### Making Changes to Shared Packages
1. Build core packages first: `pnpm build:deps`
2. Test in target application: `pnpm dev:desktop` or `pnpm dev:web`
3. Both core and ui packages have watch modes: `pnpm dev:core` or `pnpm dev:ui`

### Cross-Platform Considerations
- Desktop uses native file system access and node-pty for terminals
- Web/mobile requires server backend for git operations and terminal sessions
- Same UI components work across platforms via adapter pattern

### Testing Web/Mobile Features
- Run both services: `pnpm dev:all`
- Web app on http://localhost:3000
- Server on http://localhost:3002
- Mobile access via network IP (QR code shown in terminal)

## Key Technologies

- **Package Manager**: pnpm with workspaces
- **Build System**: Turborepo + Vite + TypeScript
- **Desktop**: Electron with node-pty for native terminals
- **Web**: React + Vite with PWA capabilities
- **Server**: Express + WebSocket (ws) + JWT authentication
- **Terminal**: xterm.js with various addons
- **Git Operations**: Native git commands via child_process
- **UI**: Tailwind CSS + Radix UI components

## Environment Configuration

### Web App (.env in apps/web/)
```bash
VITE_WS_URL=ws://192.168.1.100:3002    # Custom WebSocket server URL
VITE_PROJECT_PATH=/path/to/project      # Override default project path
```

### Server (.env in apps/server/)
```bash
PORT=3002                               # Server port
HOST=0.0.0.0                            # Bind to all interfaces
PROJECT_PATH=/path/to/project           # Default project path
```

## Important Notes

- Always use pnpm (not npm/yarn) - configured in package.json engines
- Desktop app requires native dependencies (node-pty) - may need rebuilding
- Safari/iOS requires both web and server running for full functionality
- Git worktree operations require git 2.5+ with worktree support
- Terminal sessions persist across browser refreshes via server-side management