# Database Diagnostic Utility & Deployment Precondition Fix

A comprehensive diagnostic suite for PostgreSQL and Prisma Client health, accessible from Settings, paired with deployment precondition hardening for Google AI Studio and Cloud Run.

### User Review & Critical Decisions

> [!IMPORTANT]
> The diagnostic utility will provide real-time connection verification, latency measurement, schema table checks, and startup crash prevention for PostgreSQL databases configured via `DATABASE_URL` or Cloud SQL parameters.

- **Diagnostic Scope**: Real-time ping, latency measurement, database version detection, schema table inventory validation, and connection sanitization.
- **UI Location**: A dedicated **System & Database Diagnostics** card and subpage accessible via Settings (`/settings/diagnosis` with direct navigation button in Settings).
- **Security & Privacy**: Passwords and private credentials are automatically masked, showing sanitized host, port, database name, and SSL state.
- **Startup Crash Resilience**: Wrap Prisma client initialization and database checks with fault-tolerant proxy fallback and reconnection logic so misconfigured environment variables do not crash the Next.js dev server or Cloud Run startup probes.
- **Deployment Precondition Resolution**: Remove conflicting buildpack artifacts (e.g. `bun.lock`), align package manager dependencies, and ensure production build scripts execute cleanly.

---

### 1. Overview & Core Concept

- **What It Does**: Provides administrators with a single-click diagnostic dashboard in Settings to verify live connectivity to PostgreSQL (via `DATABASE_URL` or Google Cloud SQL parameters), test query latency, audit database tables, and confirm Prisma Client operational health.
- **Key Value**: Eliminates mystery database connection issues during deployments and server restarts, offering instant visual feedback with actionable troubleshooting instructions.
- **Target Audience**: Store administrators, DevOps engineers, and system operators managing Izah POS.

---

### 2. User Experience & Visual Design

- **Settings Page Entry Point**:
  - A clean, unboxed section card in `/settings`: **Database & System Diagnostics**.
  - Displays current database status indicator and a primary action button: **Run Database Diagnostics**.
- **Diagnostics Page (`/settings/diagnosis`)**:
  - **Header & Breadcrumbs**: `Settings / Database & System Diagnostics` with a quick link back to Settings.
  - **Live Action Toolbar**: "Run Full Diagnostic" button with real-time loading spinner and re-test capabilities.
  - **Metric Ribbon**: 
    - *Connection Status*: Active / Connected (Green) vs. Unreachable / Disconnected (Crimson).
    - *Round-Trip Latency*: Formatted in tabular monospace numerals (e.g., `18 ms`).
    - *Active Engine*: PostgreSQL (Cloud SQL / Supabase / Self-hosted) or Local PGlite.
    - *Tables Verified*: Number of core schema tables detected (e.g., `16 / 16 tables present`).
  - **Sanitized Connection Parameters**:
    - Host (masked or unix socket display), Database Name, User, Port, SSL status.
    - Sensitive password strings permanently redacted.
  - **Schema & Table Health Checklist**:
    - Scans for essential tables: `User`, `BusinessSettings`, `Sale`, `Product`, `Customer`, `HeldOrder`, `ReceiptSeries`.
    - Tabular layout with clean status icons and row counts.
  - **Manual Connection Tester**:
    - Optional testing input allowing administrators to test alternative connection strings in sandbox mode before saving to production environment variables.

---

### 3. Key Technical Decisions & Trade-Offs

- **Decision 1: Isolated Diagnostic Endpoint (`/api/diagnostics/database`)**:
  - *Chosen Approach*: Implement a dedicated server-side API endpoint that tests both raw PostgreSQL connectivity (`pg.Pool`) and Prisma Client queries independently.
  - *Why*: Separates raw network/socket reachability from Prisma client schema validation, pinpointing whether a failure is due to network credentials or schema divergence.

- **Decision 2: Startup Crash Resilience in `src/lib/db.ts`**:
  - *Chosen Approach*: Ensure `createPgPool()` and `createPrismaClient()` do not throw unhandled exceptions during module evaluation on startup. Catch initialization errors and return a resilient proxy that logs warnings and allows `/api/health` and setup pages to render rather than hard-crashing the Node process.
  - *Why*: Cloud Run and Next.js require health checks to respond on port 3000 even if the database is temporarily warming up or migrating.

- **Decision 3: Deployment Precondition Check Resolution**:
  - *Chosen Approach*: Clean up conflicting lockfiles (`bun.lock`) and devDependencies to ensure Google Cloud Buildpacks detect standard Node.js/npm without ambiguity.

---

### 4. Technical Architecture & Component Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Admin UI (Client)                      │
│             /settings  ──►  /settings/diagnosis             │
└──────────────────────────────┬──────────────────────────────┘
                               │ POST /api/diagnostics/database
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Diagnostic Controller API                   │
│  1. Check DATABASE_URL & SQL_* env variables                │
│  2. Direct pg.Pool probe (latency, version, current time)   │
│  3. Prisma Client query probe (User count, Settings check)  │
│  4. Information schema scan (existing vs expected tables)   │
│  5. Return sanitized diagnostic report JSON                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌──────────────────────────────┐┌──────────────────────────────┐
│       Prisma Client          ││    PostgreSQL / Cloud SQL    │
│  - Singleton instance pool   ││  - Unix domain socket / TCP  │
│  - Graceful query validation ││  - SSL / TLS verified        │
└──────────────────────────────┘└──────────────────────────────┘
```

---

### 5. Implementation Steps

#### Step 1: Database Initialization Hardening (`src/lib/db.ts`)
- Add safety checks to `src/lib/db.ts` so Unix domain sockets (starting with `/`) never enable SSL.
- Ensure startup errors are caught and logged without aborting the Node.js process.

#### Step 2: Diagnostic Backend API (`src/app/api/diagnostics/database/route.ts`)
- Implement `POST` and `GET` handlers to perform:
  - Connection ping and latency benchmark.
  - PostgreSQL version extraction (`SELECT version()`).
  - Core tables scan from `information_schema.tables`.
  - Prisma Client operational verification (`prisma.user.count()`).
  - Safe sanitization of all connection strings.

#### Step 3: Diagnostic UI Component & Page
- Create `src/app/(app)/settings/diagnosis/page.tsx` with a high-density diagnostic dashboard.
- Add "Database & System Diagnostics" navigation banner and button in `src/app/(app)/settings/page.tsx`.

#### Step 4: Deployment Precondition Clean-Up
- Remove `bun.lock` to prevent Cloud Buildpack package manager conflicts.
- Verify `npm run build` and `compile_applet`.
