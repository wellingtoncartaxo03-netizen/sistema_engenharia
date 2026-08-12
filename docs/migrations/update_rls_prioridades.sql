-- Migração: Permitir que Coordenadores do núcleo Diretoria insiram prioridades
-- Autor: Antigravity

DROP POLICY IF EXISTS "Permitir inserção de prioridades para Diretoria/Admin" ON public.cat_prioridades;

CREATE POLICY "Permitir inserção de prioridades para Diretoria/Admin" 
ON public.cat_prioridades 
FOR INSERT 
TO authenticated 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.perfis_usuarios 
        WHERE perfis_usuarios.id = auth.uid() 
          AND (
            perfis_usuarios.nivel_acesso = ANY (ARRAY['diretor'::tipo_nivel, 'admin'::tipo_nivel])
            OR (
              perfis_usuarios.nivel_acesso = 'coordenador'::tipo_nivel 
              AND perfis_usuarios.nucleo_lotacao = 'Diretoria'::tipo_nucleo
            )
          )
    )
);
