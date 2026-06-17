-- Row Level Security policies for `approval_requests`.
--
-- Context: the Approvals page reads from this table, employees create rows from
-- the "New Assessment" flow (status = 'pending'), and managers/admins update the
-- status to 'approved' / 'rejected'. The anon key could already SELECT but
-- INSERT was rejected with "new row violates row-level security policy", so the
-- policies below make the intended employee INSERT and manager UPDATE explicit.
--
-- Safe to re-run: each policy is dropped first if it exists.

alter table public.approval_requests enable row level security;

-- Helper: does the current user hold at least the given role?
-- Role is stored in public.user_roles (employee < manager < admin).
create or replace function public.has_min_role(min_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and case ur.role
            when 'admin' then 3
            when 'manager' then 2
            when 'employee' then 1
            else 0
          end
          >=
          case min_role
            when 'admin' then 3
            when 'manager' then 2
            when 'employee' then 1
            else 0
          end
  );
$$;

-- Any authenticated user can read approval requests (the page itself is gated to
-- managers in the UI). Tighten to has_min_role('manager') if you want DB-level enforcement.
drop policy if exists "approval_requests_select" on public.approval_requests;
create policy "approval_requests_select"
  on public.approval_requests
  for select
  to authenticated
  using (true);

-- Employees can create their own requests (the "New Assessment" flow).
drop policy if exists "approval_requests_insert" on public.approval_requests;
create policy "approval_requests_insert"
  on public.approval_requests
  for insert
  to authenticated
  with check (employee_id = auth.uid());

-- Managers and admins can approve / reject.
drop policy if exists "approval_requests_update" on public.approval_requests;
create policy "approval_requests_update"
  on public.approval_requests
  for update
  to authenticated
  using (public.has_min_role('manager'))
  with check (public.has_min_role('manager'));
