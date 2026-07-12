-- SEC-003: add explicit WITH CHECK to profiles/records policies.
-- Zero behaviour change (Postgres defaults WITH CHECK to the USING expression when omitted);
-- this makes the write contract explicit so future edits to USING cannot silently diverge.

DROP POLICY IF EXISTS "users_own_profile_policy" ON public.profiles;
CREATE POLICY "users_own_profile_policy"
    ON public.profiles FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_own_records_policy" ON public.records;
CREATE POLICY "users_own_records_policy"
    ON public.records FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
