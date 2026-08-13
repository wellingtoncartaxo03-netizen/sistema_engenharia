-- Migração: Permitir que perfis lotados em Diretoria (DITRAN) e Admin cadastrem tipos de solicitação
-- Autor: Antigravity

DROP POLICY IF EXISTS "Apenas nucleos tecnicos podem inserir tipos" ON public.cat_tipos_solicitacao;

CREATE POLICY "Apenas nucleos tecnicos podem inserir tipos" 
ON public.cat_tipos_solicitacao 
FOR INSERT 
TO authenticated 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.perfis_usuarios 
        WHERE perfis_usuarios.id = auth.uid() 
          AND perfis_usuarios.nucleo_lotacao = ANY (ARRAY[
            'NPA'::tipo_nucleo, 
            'NPE'::tipo_nucleo, 
            'NCO'::tipo_nucleo, 
            'NCE'::tipo_nucleo, 
            'NPO'::tipo_nucleo, 
            'NGC'::tipo_nucleo,
            'Diretoria'::tipo_nucleo,
            'Admin'::tipo_nucleo
          ])
    )
);
