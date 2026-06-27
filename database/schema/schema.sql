-- =============================================================================
-- AYIN GROS — MASTER SCHEMA
-- PostgreSQL 15+ | Supabase uyumlu | Multi-tenant | 43 tablo
--
-- Çalıştırma sırası:
--   psql -U postgres -d your_db -f schema.sql
--
-- Modüller:
--   00_extensions  → Extensions, ENUMs, utility functions
--   01_tenants     → tenants, tenant_settings, branches, branch_settings
--   02_users       → users, user_sessions, roles, permissions,
--                    role_permissions, user_role_assignments
--   03_products    → categories, products, product_price_history
--   04_stock       → stock, stock_movements,
--                    stock_count_sessions, stock_count_items
--   05_customers   → customers, customer_addresses
--   06_orders      → orders, order_items, order_status_history
--   07_campaigns   → campaigns, campaign_conditions,
--                    coupons, coupon_usages
--   08_loyalty     → loyalty_programs, loyalty_accounts,
--                    loyalty_transactions
--   09_suppliers   → suppliers, purchase_orders, purchase_order_items
--   10_finance     → invoices, invoice_items, payments
--   11_notifications → notification_templates, notification_logs,
--                      notification_rules
--   12_workflow    → workflow_rules, workflow_executions
--   13_ai          → ai_request_logs, ai_audit_logs
--   14_audit       → audit_logs
--   99_indexes     → Tüm query-path indexleri
-- =============================================================================

\i 00_extensions.sql
\i 01_tenants.sql
\i 02_users.sql
\i 03_products.sql
\i 04_stock.sql
\i 05_customers.sql
\i 06_orders.sql
\i 07_campaigns.sql
\i 08_loyalty.sql
\i 09_suppliers.sql
\i 10_finance.sql
\i 11_notifications.sql
\i 12_workflow.sql
\i 13_ai.sql
\i 14_audit.sql
\i 99_indexes.sql

-- =============================================================================
-- TABLO İLİŞKİLERİ — ASCII DİYAGRAM
-- =============================================================================
--
--  CORE
--  ─────────────────────────────────────────────────────────────────────────
--  tenants ──┬──► tenant_settings
--             ├──► branches ──► branch_settings
--             ├──► users ──┬──► user_sessions
--             │            └──► user_role_assignments ──► roles ──► role_permissions ──► permissions
--             │
--  CATALOG    │
--  ─────────── │
--             ├──► categories (self-ref: parent_id)
--             ├──► products ──┬──► categories
--             │               └──► product_price_history
--             │
--  INVENTORY  │
--  ─────────── │
--             ├──► stock (product + branch)
--             ├──► stock_movements (product + branch)
--             ├──► stock_count_sessions ──► stock_count_items ──► products
--             │
--  CUSTOMERS  │
--  ─────────── │
--             ├──► customers ──► customer_addresses
--             │
--  ORDERS     │
--  ─────────── │
--             ├──► orders ──┬──► order_items ──► products
--             │              ├──► order_status_history
--             │              ├──► customers
--             │              ├──► branches
--             │              └──► coupons
--             │
--  CAMPAIGNS  │
--  ─────────── │
--             ├──► campaigns ──► campaign_conditions
--             ├──► coupons ──► coupon_usages ──┬──► orders
--             │                                 └──► customers
--             │
--  LOYALTY    │
--  ─────────── │
--             ├──► loyalty_programs
--             └──► loyalty_accounts ──► loyalty_transactions ──► orders
--                     └──► customers
--
--  OPERATIONS
--  ─────────────────────────────────────────────────────────────────────────
--  tenants ──┬──► suppliers ──► purchase_orders ──► purchase_order_items
--             │
--             ├──► invoices ──► invoice_items
--             │      └──► payments
--             │
--  PLATFORM   │
--  ─────────── │
--             ├──► notification_templates
--             ├──► notification_rules ──► notification_templates
--             ├──► notification_logs
--             │
--             ├──► workflow_rules ──► workflow_executions
--             │
--             ├──► ai_request_logs ──► ai_audit_logs
--             │
--             └──► audit_logs
--
-- =============================================================================
--
-- TABLO SAYISI: 43
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ #  │ Tablo                    │ Modül         │ Satır türü              │
-- ├─────────────────────────────────────────────────────────────────────────┤
-- │ 01 │ tenants                  │ 01_tenants    │ soft-delete             │
-- │ 02 │ tenant_settings          │ 01_tenants    │ key/value               │
-- │ 03 │ branches                 │ 01_tenants    │ soft-delete             │
-- │ 04 │ branch_settings          │ 01_tenants    │ key/value               │
-- │ 05 │ users                    │ 02_users      │ soft-delete             │
-- │ 06 │ user_sessions            │ 02_users      │ TTL (expires_at)        │
-- │ 07 │ roles                    │ 02_users      │ soft-delete             │
-- │ 08 │ permissions              │ 02_users      │ immutable seed          │
-- │ 09 │ role_permissions         │ 02_users      │ junction                │
-- │ 10 │ user_role_assignments    │ 02_users      │ TTL (expires_at)        │
-- │ 11 │ categories               │ 03_products   │ soft-delete             │
-- │ 12 │ products                 │ 03_products   │ soft-delete             │
-- │ 13 │ product_price_history    │ 03_products   │ append-only             │
-- │ 14 │ stock                    │ 04_stock      │ mutable                 │
-- │ 15 │ stock_movements          │ 04_stock      │ append-only             │
-- │ 16 │ stock_count_sessions     │ 04_stock      │ soft-delete             │
-- │ 17 │ stock_count_items        │ 04_stock      │ mutable                 │
-- │ 18 │ customers                │ 05_customers  │ soft-delete             │
-- │ 19 │ customer_addresses       │ 05_customers  │ soft-delete             │
-- │ 20 │ orders                   │ 06_orders     │ soft-delete             │
-- │ 21 │ order_items              │ 06_orders     │ mutable                 │
-- │ 22 │ order_status_history     │ 06_orders     │ append-only             │
-- │ 23 │ campaigns                │ 07_campaigns  │ soft-delete             │
-- │ 24 │ campaign_conditions      │ 07_campaigns  │ mutable                 │
-- │ 25 │ coupons                  │ 07_campaigns  │ soft-delete             │
-- │ 26 │ coupon_usages            │ 07_campaigns  │ append-only             │
-- │ 27 │ loyalty_programs         │ 08_loyalty    │ soft-delete             │
-- │ 28 │ loyalty_accounts         │ 08_loyalty    │ mutable                 │
-- │ 29 │ loyalty_transactions     │ 08_loyalty    │ append-only             │
-- │ 30 │ suppliers                │ 09_suppliers  │ soft-delete             │
-- │ 31 │ purchase_orders          │ 09_suppliers  │ soft-delete             │
-- │ 32 │ purchase_order_items     │ 09_suppliers  │ mutable                 │
-- │ 33 │ invoices                 │ 10_finance    │ soft-delete             │
-- │ 34 │ invoice_items            │ 10_finance    │ mutable                 │
-- │ 35 │ payments                 │ 10_finance    │ mutable                 │
-- │ 36 │ notification_templates   │ 11_notif      │ soft-delete             │
-- │ 37 │ notification_logs        │ 11_notif      │ append-only             │
-- │ 38 │ notification_rules       │ 11_notif      │ soft-delete             │
-- │ 39 │ workflow_rules           │ 12_workflow   │ soft-delete             │
-- │ 40 │ workflow_executions      │ 12_workflow   │ append-only             │
-- │ 41 │ ai_request_logs          │ 13_ai         │ append-only             │
-- │ 42 │ ai_audit_logs            │ 13_ai         │ append-only             │
-- │ 43 │ audit_logs               │ 14_audit      │ immutable               │
-- └─────────────────────────────────────────────────────────────────────────┘
