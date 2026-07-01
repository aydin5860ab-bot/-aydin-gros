# AYDIN GROS OS — Architectural Review & Security Assessment
**Prepared by:** Senior Software Architect  
**Target Release:** v1.0-Beta  
**Date:** July 1, 2026

---

## 1. System Architecture Overview

Aydın GROS OS is designed as a multi-tenant, multi-branch supermarket management system. The application utilizes a hybrid runtime model: Next.js App Router for backend APIs and admin panels, combined with static HTML/JS panels for POS terminals and mobile hand terminals.

### 1.1 Layers & Technologies
- **Presentation Layer**: 
  - Admin Dashboard: Next.js React client-side rendering with Tailwind CSS.
  - Cashier POS: Static HTML (`pos.html`) served from `/public`, using vanilla JS, Tailwind CSS CDN, Supabase Client CDN, and JsBarcode.
  - Mobile PWA: Static HTML (`mobile.html` & `pos-mobile.html`) optimized for mobile devices, using service workers for offline capability.
- **API Gateway & Routing**: Next.js App Router API endpoints (`/api/*`). Handles JWT authentication, tenant resolution, and RBAC authorization middleware.
- **Database Layer**: Shared database model using PostgreSQL hosted on Supabase, with Row Level Security (RLS) policies for tenant isolation.
- **AI Engine (Hermes)**: Multi-layer model combining local NLP rules (heuristic fallback) and remote calls to Claude API (using `claude-haiku-4-5-20251001` or `HermesHeuristicAI-v9`).

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                    │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Müşteri Web    │  │  Admin Panel │  │  POS Ekranı│ │
│  │  (Next.js SSR)  │  │  (Next.js)   │  │  (PWA)     │ │
│  └────────┬────────┘  └──────┬───────┘  └─────┬──────┘ │
└───────────┼──────────────────┼────────────────┼─────────┘
            │                  │                │
┌───────────▼──────────────────▼────────────────▼─────────┐
│                      API GATEWAY LAYER                   │
│         Next.js API Routes / Vercel Edge Functions       │
│    Authentication │ Rate Limiting │ Tenant Resolution    │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    BUSINESS LOGIC LAYER                  │
│  ┌──────────┐ ┌─────────┐ ┌────────┐ ┌───────────────┐ │
│  │ Stok     │ │ Sipariş │ │  Kasa  │ │   Kampanya    │ │
│  │ Servisi  │ │ Servisi │ │ Servis │ │   Servisi     │ │
│  └──────────┘ └─────────┘ └────────┘ └───────────────┘ │
│  ┌──────────┐ ┌─────────┐ ┌────────┐ ┌───────────────┐ │
│  │ Kullanıcı│ │ Raporlama│ │Bildirim│ │  Hermes AI   │ │
│  │ Servisi  │ │ Servisi │ │ Servis │ │   Servisi     │ │
│  └──────────┘ └─────────┘ └────────┘ └───────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                      DATA LAYER                          │
│  ┌─────────────────────┐   ┌───────────────────────┐   │
│  │  PostgreSQL         │   │  Supabase Storage      │   │
│  │  (Supabase)         │   │  (Görseller, belgeler) │   │
│  │  Row Level Security │   └───────────────────────┘   │
│  └─────────────────────┘                                │
│  ┌─────────────────────┐   ┌───────────────────────┐   │
│  │  Upstash Redis      │   │  Resend (Email)        │   │
│  │  (Cache, Rate limit)│   │                        │   │
│  └─────────────────────┘   └───────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Module Boundaries & Coupling Analysis

### 2.1 Cohesion & Coupling Risks
- **High Frontend Coupling**: The files `admin.html` and `pos.html` are massive, monolithic files containing thousands of lines of HTML structure, CSS layouts, inline event handlers, and business logic. State variables (`products`, `orders`, `campaigns`) are bound globally (`window` scope), which complicates maintenance and compromises page stability.
- **Low Backend Coupling**: Backend Next.js API endpoints (`app/api/*`) are highly cohesive and loosely coupled. However, the database access logic is duplicated across route handlers instead of being abstracted in a repository pattern.
- **Dual Entity Referencing**: Products are referenced both by `id` (UUID) and `legacy_id` (Integer). Some tables use `product_id` and others use `product_legacy_id`. This dual reference scheme creates data serialization friction, raises foreign key risks, and complicates joins.

### 2.2 Technical Debt
- **Vanilla CDN Dependencies**: The POS and Mobile PWA depend on runtime CDN imports for Tailwind CSS and Supabase JS client. If CDNs are slow or compromised, cashier checkout fails.
- **Local JSON DB Fallback**: The connection helper `lib/db.ts` falls back to reading and writing database records to disk files (e.g., `db_products.json`) if Supabase is offline or `FORCE_JSON_DB === 'true'`. While helpful for local development, this introduces serious concurrency write locks, file corruption risks, and multi-node sync drift in a multi-tenant production environment.

---

## 3. Database Audit

### 3.1 Normalization & Schema Integrity
The SQL schema in `database/schema.sql` is well-designed and structured according to 3NF principles. The relationships between tenants, branches, registers, customers, and orders are correctly normalized.
- **Plan Configuration**: The plan features are stored as raw JSONB in `subscription_plans.features`. This provides flexibility but prevents index optimization for nested properties.
- **Dual Plan Flags**: Subscription levels are checked against both `tenants.subscription_plan` and `tenants.settings.package`. This redundant tracking must be unified.

### 3.2 Index Analysis
- **Missing Composite Indexes**: All multi-tenant tables filter query scans by `tenant_id`. Tables like `products`, `product_stock`, and `orders` lack composite indexes on `(tenant_id, barcode)` or `(tenant_id, branch_id)`. This will degrade database query performance when product tables exceed 50,000 items per tenant.
- **Missing Foreign Key Indexes**: Table relationships using UUID references (like `tenant_id`, `branch_id`, `register_id`) lack explicit index definitions. PostgreSQL does not automatically index foreign keys, leading to sequence scans on parent record deletions.

### 3.3 Migration Quality
- **Linear Schema Upgrades**: Migrations in `database/migrations` follow a correct incremental setup.
- **Rollback Deficit**: Migration scripts do not contain `down.sql` scripts, meaning db migrations cannot be rolled back safely without manual DBA intervention.

---

## 4. API Audit

### 4.1 REST Design Consistency
- **Direct Collection Bypass**: The `/api/db` route exposes a generic DB access interface (`/api/db?coll=register_sessions`) that accepts direct JSON write payloads. This bypasses backend schema validation, security filters, and proper request routing.
- **CamelCase Map Discrepancies**: The database column keys use snake_case (e.g. `branch_id`, `opened_by`), while the API collection payloads use camelCase (e.g. `branchId`, `openedBy`). This mapping conversion is handled in client scripts but lacks robust JSON validation schema (e.g., Zod), which can lead to silent data omission.

### 4.2 Pagination & Versioning
- **Array Dumps**: Endpoints like `/api/barcode` and `/api/enterprise/crm` return raw database arrays without pagination limits. A tenant with 20,000 products will exhaust server bandwidth and crash client browsers when list requests are made.
- **No Version Prefix**: Routes are nested immediately under `/api/*` rather than `/api/v1/`. Upgrading client PWAs and handling breaking changes will require complex path routing.

---

## 5. Security & Isolation Audit

### 5.1 Multi-Tenant Isolation
- **API Filtering**: Resolved by extracting `tenant_id` from JWT tokens and appending `where('tenant_id', tenantId)` queries.
- **RLS Enforced**: Enforced via PostgreSQL Row Level Security (RLS) policies checking `tenant_id = current_tenant_id()`. Policies are implemented robustly.

### 5.2 XSS & SQL Injection Risks
- **SQL Injection**: Prevented because APIs interface via PostgREST/Supabase client which utilizes prepared statements and parameterization.
- **XSS Vulnerabilities**: Static HTML views make extensive use of `element.innerHTML = ...` when injecting raw strings (such as product names, search results, and chat history) instead of using `textContent` or proper sanitization functions. This poses a major XSS vulnerability if store database records contain script tags.

### 5.3 Access Controls (RBAC)
- Checked and verified in `lib/auth.ts` and RLS policy rules:
  - Cashiers are blocked from administrative tables.
  - Managers can read logs and approve purchases.
  - Tenant plans block access to advanced modules (e.g. Hermes AI is restricted only to `enterprise` subscription plan tiers).

---

## 6. Recommendations & Refactoring Plan

1. **Migrate HTML pages to Next.js Components**: Convert `public/admin.html`, `public/pos.html`, and `public/mobile.html` into React pages inside Next.js App Router structure. This allows proper state management, compilation of Tailwind, and unified backend-frontend authentication.
2. **Implement Zod Schema Validation**: Add backend request validation schemas to prevent invalid payload writes via APIs.
3. **Decouple Local File DB Fallback**: Restrict the JSON file db operations strictly to development environment. Force database connection exceptions to be thrown with standard HTTP 503 Service Unavailable codes instead of falling back to unsafe local writes in production.
4. **Compile Tailwind CSS**: Build the PWA and cashier panels with Webpack/Vite or Tailwind CLI to eliminate runtime compilation latency.
