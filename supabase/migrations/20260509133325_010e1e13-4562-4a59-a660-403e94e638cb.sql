-- Backfill role 'guardian' for users who are linked in responsaveis but have no role yet
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT r.user_id, 'guardian'::user_role
FROM public.responsaveis r
LEFT JOIN public.user_roles ur ON ur.user_id = r.user_id
WHERE r.user_id IS NOT NULL
  AND ur.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- Backfill role 'teacher' for professores users missing role
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT p.user_id, 'teacher'::user_role
FROM public.professores p
LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
WHERE p.user_id IS NOT NULL
  AND ur.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- Backfill role 'school' for escola admin/socio missing role
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT u_id, 'school'::user_role
FROM (
  SELECT admin_user_id AS u_id FROM public.escolinhas WHERE admin_user_id IS NOT NULL
  UNION
  SELECT socio_user_id AS u_id FROM public.escolinhas WHERE socio_user_id IS NOT NULL
) e
LEFT JOIN public.user_roles ur ON ur.user_id = e.u_id
WHERE ur.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;