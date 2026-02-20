INSERT INTO public.profiles (id, name)
SELECT u.id, u.raw_user_meta_data->>'name'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
