-- Garante a policy de teste restrita ao wnogueira (somente para validação)
DROP POLICY IF EXISTS "Teste wnogueira pode atualizar seu cadastro" ON public.responsaveis;

CREATE POLICY "Teste wnogueira pode atualizar seu cadastro"
ON public.responsaveis
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND lower(email) = 'wnogueira@hotmail.com'
)
WITH CHECK (
  user_id = auth.uid()
  AND lower(email) = 'wnogueira@hotmail.com'
);