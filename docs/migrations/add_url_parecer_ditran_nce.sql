-- Migração: Adicionar colunas de URL de parecer PDF para DITRAN e NCE
-- Autor: Antigravity

ALTER TABLE public.demandas_pai ADD COLUMN IF NOT EXISTS url_parecer_ditran TEXT;
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS url_parecer_nce TEXT;
