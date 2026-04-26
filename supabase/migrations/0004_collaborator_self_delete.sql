-- Allow a collaborator to remove their own row (leave the event) without being the
-- event owner. Owner-only management of other members remains on the
-- "Owners can manage collaborators" policy (FOR ALL).

drop policy if exists "Collaborators can remove own membership" on public.event_collaborators;
create policy "Collaborators can remove own membership"
  on public.event_collaborators for delete to authenticated
  using (user_id = auth.uid());
