-- Backfill missing profiles
INSERT INTO public.profiles (user_id, nome, email, provider)
SELECT u.id,
       COALESCE(u.raw_user_meta_data ->> 'nome', u.raw_user_meta_data ->> 'full_name', split_part(u.email,'@',1), 'Usuario'),
       u.email,
       COALESCE(u.raw_app_meta_data ->> 'provider', 'email')
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;

-- Ensure trigger exists for new signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();