# TASK: Restore Tenant 002 Data Visibility — Implementation Status

## Schema Note (Important)

**orders** and **members** tables do NOT have a `tenant_id` column.  
Data is linked via:
- orders: `creator_id`, `sales_user_id` → employees.tenant_id
- members: `creator_id`, `recorder_id` → employees.tenant_id

The task document assumed `WHERE tenant_id = '002'` — that column does not exist.  
Our implementation uses the correct schema.

---

## STEP 1 — Verify Tenant 002 Data Exists ✓

**Task SQL (invalid for this schema):**
```sql
SELECT COUNT(*) FROM orders WHERE tenant_id = '002';  -- orders has no tenant_id
SELECT COUNT(*) FROM members WHERE tenant_id = '002'; -- members has no tenant_id
```

**Actual implementation:**
```bash
npm run verify:tenant-002
```

Script: `scripts/verify-tenant-002-task.mjs`  
Counts total orders and members (002 RPC returns all for this tenant).  
Expected: orders ≈ 808, members ≈ 550.

---

## STEP 2 — Ensure Employee Login Returns Tenant ID ✓

**Task SQL** used `e.password = input_password` — schema uses `password_hash` with bcrypt.

**Actual implementation:**  
Migration `20260330000000_fix_tenant_employee_data_visibility.sql`  
- `verify_employee_login_detailed` returns `tenant_id` (UUID)  
- Uses bcrypt for password verification  
- Returns: employee_id, username, real_name, role, status, is_super_admin, tenant_id, error_code  

---

## STEP 3 — Create Tenant RPC Functions ✓

**Task** suggested `get_my_tenant_orders_full(emp_id UUID)` — passing emp_id from frontend is a security risk.

**Actual implementation:**  
Migration `20260329000000_tenant_employee_my_orders_rpc.sql`  
- `get_my_tenant_orders_full()` — no params, uses auth.uid() internally  
- `get_my_tenant_usdt_orders_full()`  
- `get_my_tenant_members_full()`  
- `get_my_tenant_dashboard_trend(p_start_date, p_end_date, p_sales_person)`  

All resolve tenant_id from profiles + employees (or profile.email fallback).  
No emp_id from client — more secure.

---

## STEP 4 — Update Frontend Tenant Logic ✓

**File:** `src/contexts/TenantViewContext.tsx`  
- `viewingTenantId = employee.tenant_id` (no tenants table query)  
- Set in useEffect when employee has tenant_id  

---

## STEP 5 — Use Tenant RPC For Employee Data Queries ✓

**Files:**  
- `src/services/tenantService.ts`: getMyTenantOrdersFull(), getMyTenantMembersFull(), getMyTenantDashboardTrend()  
- `src/hooks/orders/orderQueries.ts`: uses getMyTenant* when useMyTenantRpc  
- `src/hooks/useMembers.ts`: uses getMyTenantMembersFull when useMyTenantRpc  
- `src/hooks/useDashboardTrend.ts`: uses getMyTenantDashboardTrend when useMyTenantRpc  

RPC calls use no parameters (tenant resolved server-side from auth.uid()).

---

## STEP 6 — Login Flow Must Store Tenant ID ✓

**File:** `src/contexts/AuthContext.tsx`  
- signIn builds employeeInfo with `tenant_id: emp.tenant_id ?? null`  
- emp.tenant_id comes from verify_employee_login_detailed result  

---

## STEP 7 — Test Tenant 002 Login

1. Logout  
2. Login as tenant 002 employee  
3. Check: Orders list, Members list, Dashboard  
4. Expected: Orders ≈ 808, Members ≈ 550  

---

## Run Migrations

```bash
npm run db:tenant-employee-my-rpc
```

## Verify Data

```bash
npm run verify:tenant-002
```
