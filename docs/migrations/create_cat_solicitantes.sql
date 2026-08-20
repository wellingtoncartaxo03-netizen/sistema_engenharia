-- Migration: Criação da tabela cat_solicitantes
-- Catálogo de solicitantes oficiais (públicos) para autocomplete na nova demanda

CREATE TABLE IF NOT EXISTS public.cat_solicitantes (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome        TEXT NOT NULL,
    cpf_cnpj    TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Índice para busca rápida por nome (ILIKE)
CREATE INDEX IF NOT EXISTS idx_cat_solicitantes_nome
    ON public.cat_solicitantes USING gin (to_tsvector('portuguese', nome));

CREATE INDEX IF NOT EXISTS idx_cat_solicitantes_nome_text
    ON public.cat_solicitantes (nome text_pattern_ops);

-- RLS: habilitar segurança em nível de linha
ALTER TABLE public.cat_solicitantes ENABLE ROW LEVEL SECURITY;

-- Política: todos os usuários autenticados podem LER
CREATE POLICY "cat_solicitantes_select_authenticated"
    ON public.cat_solicitantes
    FOR SELECT
    TO authenticated
    USING (true);

-- Política: todos os usuários autenticados podem INSERIR
CREATE POLICY "cat_solicitantes_insert_authenticated"
    ON public.cat_solicitantes
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Comentário na tabela
COMMENT ON TABLE public.cat_solicitantes IS
    'Catálogo de solicitantes oficiais (públicos) para autocomplete na tela de Nova Demanda.';
