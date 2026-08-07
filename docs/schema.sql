-- 1. Criação dos Enums (se não existirem)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_nucleo') THEN
        CREATE TYPE tipo_nucleo AS ENUM ('Triagem', 'NPO', 'NCE', 'NCO', 'NGC', 'NPE', 'Diretoria', 'Admin');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_nivel') THEN
        CREATE TYPE tipo_nivel AS ENUM ('operacional', 'coordenador', 'diretor', 'admin');
    END IF;
END$$;

-- 2. Tabela de Perfis de Usuários
CREATE TABLE IF NOT EXISTS perfis_usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome_completo TEXT NOT NULL,
    cpf TEXT UNIQUE NOT NULL CONSTRAINT cpf_format CHECK (cpf ~ '^[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}$'),
    nucleo_lotacao tipo_nucleo NOT NULL,
    nivel_acesso tipo_nivel NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Habilitar RLS
ALTER TABLE perfis_usuarios ENABLE ROW LEVEL SECURITY;

-- 4. Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Admins podem inserir perfis" ON perfis_usuarios;
DROP POLICY IF EXISTS "Usuários podem ler o próprio perfil" ON perfis_usuarios;

-- 5. Criar Políticas de RLS
CREATE POLICY "Admins podem inserir perfis" 
ON perfis_usuarios FOR INSERT 
TO authenticated 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM perfis_usuarios 
        WHERE perfis_usuarios.id = auth.uid() AND perfis_usuarios.nivel_acesso = 'admin'
    )
);

CREATE POLICY "Usuários podem ler o próprio perfil" 
ON perfis_usuarios FOR SELECT 
TO authenticated 
USING (
    auth.uid() = id OR EXISTS (
        SELECT 1 FROM perfis_usuarios 
        WHERE perfis_usuarios.id = auth.uid() AND perfis_usuarios.nivel_acesso = 'admin'
    )
);

-- 6. Função SECURITY DEFINER para mapear CPF em E-mail no Login
CREATE OR REPLACE FUNCTION obter_email_por_cpf(p_cpf TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_email TEXT;
BEGIN
    SELECT au.email INTO v_email
    FROM perfis_usuarios pu
    JOIN auth.users au ON pu.id = au.id
    WHERE pu.cpf = p_cpf;
    
    RETURN v_email;
END;
$$;

-- 7. Tabela de Catálogo Dinâmico de Tipos de Solicitação
CREATE TABLE IF NOT EXISTS public.cat_tipos_solicitacao (
    nome TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.cat_tipos_solicitacao ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Qualquer usuario autenticado pode ler os tipos"
ON public.cat_tipos_solicitacao FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Apenas nucleos tecnicos podem inserir tipos"
ON public.cat_tipos_solicitacao FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.perfis_usuarios
        WHERE perfis_usuarios.id = auth.uid()
          AND perfis_usuarios.nucleo_lotacao IN ('NPA', 'NPE', 'NCO', 'NCE', 'NPO', 'NGC')
    )
);

-- Carga inicial de novos tipos padrão
INSERT INTO public.cat_tipos_solicitacao (nome) VALUES
('Análise de circulação'),
('Análise de Rist'),
('Análise de estacionamento'),
('Outros')
ON CONFLICT DO NOTHING;

-- 8. Remover a restrição estática CHECK da tabela demandas_pai
ALTER TABLE public.demandas_pai DROP CONSTRAINT IF EXISTS demandas_pai_tipo_solicitacao_check;

-- 9. Campos de endereço e encaminhamento de núcleos na tabela demandas_pai e trigger handle_new_demanda()
ALTER TABLE public.demandas_pai ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE public.demandas_pai ADD COLUMN IF NOT EXISTS nucleos_atribuidos TEXT[];

CREATE OR REPLACE FUNCTION handle_new_demanda()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.nucleos_atribuidos IS NULL OR cardinality(NEW.nucleos_atribuidos) = 0 THEN
        NEW.nucleos_atribuidos := ARRAY['NPO'];
    END IF;

    IF 'NPO' = ANY(NEW.nucleos_atribuidos) THEN
        IF NOT EXISTS (SELECT 1 FROM public.projetos_npo WHERE id_demanda_pai = NEW.id) THEN
            INSERT INTO public.projetos_npo (id_demanda_pai, status_npo) VALUES (NEW.id, 'Recebido');
        END IF;
    END IF;
    
    IF 'NCE' = ANY(NEW.nucleos_atribuidos) THEN
        INSERT INTO public.execucao_nce (id_demanda_pai, status_nce) 
        VALUES (NEW.id, 'Aguardando Programação') 
        ON CONFLICT (id_demanda_pai) DO NOTHING;
    END IF;
    
    IF 'NCO' = ANY(NEW.nucleos_atribuidos) THEN
        INSERT INTO public.execucao_nco (id_demanda_pai, status_nco) 
        VALUES (NEW.id, 'Aguardando Ordem de Serviço') 
        ON CONFLICT (id_demanda_pai) DO NOTHING;
    END IF;
    
    IF 'NGC' = ANY(NEW.nucleos_atribuidos) THEN
        INSERT INTO public.projetos_ngc (id_demanda_pai, status_ngc) 
        VALUES (NEW.id, 'Em Estudo') 
        ON CONFLICT (id_demanda_pai) DO NOTHING;
    END IF;
    
    IF 'NPE' = ANY(NEW.nucleos_atribuidos) THEN
        INSERT INTO public.projetos_npe (id_demanda_pai, status_npe) 
        VALUES (NEW.id, 'Em Análise') 
        ON CONFLICT (id_demanda_pai) DO NOTHING;
    END IF;
    
    IF 'NPA' = ANY(NEW.nucleos_atribuidos) THEN
        INSERT INTO public.analise_npa (id_demanda_pai, tipo_localizacao) 
        VALUES (NEW.id, 'Cruzamento') 
        ON CONFLICT (id_demanda_pai) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Novos campos para upload de parecer e projeto específico de cada núcleo
-- NPO
ALTER TABLE public.projetos_npo ADD COLUMN IF NOT EXISTS parecer_npo TEXT;
ALTER TABLE public.projetos_npo ADD COLUMN IF NOT EXISTS projeto_npo TEXT;
ALTER TABLE public.projetos_npo ADD COLUMN IF NOT EXISTS projeto_npo_titulo TEXT;
ALTER TABLE public.projetos_npo ADD COLUMN IF NOT EXISTS projeto_npo_numero TEXT;

-- NPA
ALTER TABLE public.analise_npa ADD COLUMN IF NOT EXISTS parecer_npa TEXT;
ALTER TABLE public.analise_npa ADD COLUMN IF NOT EXISTS projeto_npa TEXT;
ALTER TABLE public.analise_npa ADD COLUMN IF NOT EXISTS projeto_npa_titulo TEXT;
ALTER TABLE public.analise_npa ADD COLUMN IF NOT EXISTS projeto_npa_numero TEXT;

-- NPE
ALTER TABLE public.projetos_npe ADD COLUMN IF NOT EXISTS parecer_npe TEXT;
ALTER TABLE public.projetos_npe ADD COLUMN IF NOT EXISTS projeto_npe TEXT;
ALTER TABLE public.projetos_npe ADD COLUMN IF NOT EXISTS projeto_npe_titulo TEXT;
ALTER TABLE public.projetos_npe ADD COLUMN IF NOT EXISTS projeto_npe_numero TEXT;

-- NGC
ALTER TABLE public.projetos_ngc ADD COLUMN IF NOT EXISTS parecer_ngc TEXT;
ALTER TABLE public.projetos_ngc ADD COLUMN IF NOT EXISTS projeto_ngc TEXT;
ALTER TABLE public.projetos_ngc ADD COLUMN IF NOT EXISTS projeto_ngc_titulo TEXT;
ALTER TABLE public.projetos_ngc ADD COLUMN IF NOT EXISTS projeto_ngc_numero TEXT;

-- NCE
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS horizontal_m2_autorizado NUMERIC;
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS vertical_un_autorizada INTEGER;
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS extensao_km_autorizada NUMERIC;
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS medidas_npa_autorizadas TEXT;
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS medidas_npe_autorizadas TEXT;
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS equipe_tipo TEXT CHECK (equipe_tipo IN ('AMC', 'Terceirizada'));
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS equipe_nome TEXT;
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS numero_processo TEXT;
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS tecnico_responsavel TEXT;
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS tipo_empreendimento TEXT;
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS solicitante TEXT;
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- 11. Tabela de Catálogo de Prioridades e Relacionamento com demandas_pai
CREATE TABLE IF NOT EXISTS public.cat_prioridades (
    nome TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.cat_prioridades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de prioridades para autenticados" ON public.cat_prioridades;
DROP POLICY IF EXISTS "Permitir inserção de prioridades para Diretoria/Admin" ON public.cat_prioridades;

CREATE POLICY "Permitir leitura de prioridades para autenticados" 
ON public.cat_prioridades FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permitir inserção de prioridades para Diretoria/Admin" 
ON public.cat_prioridades FOR INSERT TO authenticated 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.perfis_usuarios
        WHERE perfis_usuarios.id = auth.uid()
          AND perfis_usuarios.nivel_acesso IN ('diretor', 'admin')
    )
);

INSERT INTO public.cat_prioridades (nome) VALUES
('Meta 2026'),
('Prioridade Prefeito'),
('Prioridade Governador'),
('Operação Centro')
ON CONFLICT DO NOTHING;

ALTER TABLE public.demandas_pai 
ADD COLUMN IF NOT EXISTS prioridade_nome TEXT REFERENCES public.cat_prioridades(nome) ON DELETE SET NULL;

-- 12. Gatilho para sincronização automática de perfis_usuarios com public.profiles (Checkpoint 3)
CREATE OR REPLACE FUNCTION public.sincronizar_profiles_role()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF NEW.nivel_acesso = 'admin' OR NEW.nivel_acesso = 'coordenador' THEN
        v_role := 'Gerência';
    ELSIF NEW.nivel_acesso = 'diretor' THEN
        v_role := 'Diretoria';
    ELSIF NEW.nivel_acesso = 'operacional' THEN
        v_role := 'Técnico';
    ELSE
        v_role := 'Público';
    END IF;

    INSERT INTO public.profiles (id, role)
    VALUES (NEW.id, v_role)
    ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role,
        updated_at = timezone('utc'::text, now());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_sincronizar_profiles_role
AFTER INSERT OR UPDATE ON public.perfis_usuarios
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_profiles_role();

-- 13. Adicionar coluna CPF/CNPJ na tabela demandas_pai e criar índice (Checkpoint 4)
ALTER TABLE public.demandas_pai 
ADD COLUMN IF NOT EXISTS solicitante_cpf_cnpj TEXT;

CREATE INDEX IF NOT EXISTS idx_demandas_pai_solicitante_cpf_cnpj 
ON public.demandas_pai (solicitante_cpf_cnpj);

-- 14. Adicionar coluna status_npa na tabela analise_npa (Checkpoint 4)
ALTER TABLE public.analise_npa 
ADD COLUMN IF NOT EXISTS status_npa TEXT DEFAULT 'Aguardando Recebimento';

UPDATE public.analise_npa 
SET status_npa = CASE 
    WHEN data_conclusao IS NOT NULL THEN 'Concluído'
    WHEN tecnico_responsavel IS NOT NULL OR data_inicial IS NOT NULL THEN 'Em Análise'
    ELSE 'Recebido'
END 
WHERE status_npa IS NULL OR status_npa = 'Aguardando Recebimento';

-- 15. Atualizar restrições de status_npo e trigger handle_new_demanda (NPO status flow improvements)
ALTER TABLE public.projetos_npo DROP CONSTRAINT IF EXISTS projetos_npo_status_npo_check;
ALTER TABLE public.projetos_npo DROP CONSTRAINT IF EXISTS status_npo_check;

ALTER TABLE public.projetos_npo ADD CONSTRAINT projetos_npo_status_npo_check 
CHECK (status_npo = ANY (ARRAY[
    'Aguardando Recebimento'::text, 
    'Recebido'::text, 
    'Em Análise'::text, 
    'Deferido'::text, 
    'Indeferido'::text, 
    'Sem Projeto'::text, 
    'Contemplado'::text, 
    'Concluído'::text
]));

ALTER TABLE public.projetos_npo ALTER COLUMN status_npo SET DEFAULT 'Aguardando Recebimento';

CREATE OR REPLACE FUNCTION handle_new_demanda()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.nucleos_atribuidos IS NULL OR cardinality(NEW.nucleos_atribuidos) = 0 THEN
        NEW.nucleos_atribuidos := ARRAY['NPO'];
    END IF;

    IF 'NPO' = ANY(NEW.nucleos_atribuidos) THEN
        IF NOT EXISTS (SELECT 1 FROM public.projetos_npo WHERE id_demanda_pai = NEW.id) THEN
            INSERT INTO public.projetos_npo (id_demanda_pai, status_npo) VALUES (NEW.id, 'Aguardando Recebimento');
        END IF;
    END IF;
    
    IF 'NCE' = ANY(NEW.nucleos_atribuidos) THEN
        INSERT INTO public.execucao_nce (id_demanda_pai, status_nce) 
        VALUES (NEW.id, 'Aguardando Programação') 
        ON CONFLICT (id_demanda_pai) DO NOTHING;
    END IF;
    
    IF 'NCO' = ANY(NEW.nucleos_atribuidos) THEN
        INSERT INTO public.execucao_nco (id_demanda_pai, status_nco) 
        VALUES (NEW.id, 'Aguardando Ordem de Serviço') 
        ON CONFLICT (id_demanda_pai) DO NOTHING;
    END IF;
    
    IF 'NGC' = ANY(NEW.nucleos_atribuidos) THEN
        INSERT INTO public.projetos_ngc (id_demanda_pai, status_ngc) 
        VALUES (NEW.id, 'Em Estudo') 
        ON CONFLICT (id_demanda_pai) DO NOTHING;
    END IF;
    
    IF 'NPE' = ANY(NEW.nucleos_atribuidos) THEN
        INSERT INTO public.projetos_npe (id_demanda_pai, status_npe) 
        VALUES (NEW.id, 'Em Análise') 
        ON CONFLICT (id_demanda_pai) DO NOTHING;
    END IF;
    
    IF 'NPA' = ANY(NEW.nucleos_atribuidos) THEN
        INSERT INTO public.analise_npa (id_demanda_pai, tipo_localizacao) 
        VALUES (NEW.id, 'Cruzamento') 
        ON CONFLICT (id_demanda_pai) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 16. Adicionar colunas para localização estruturada na tabela projetos_npo
ALTER TABLE public.projetos_npo ADD COLUMN IF NOT EXISTS tipo_localizacao TEXT;
ALTER TABLE public.projetos_npo ADD COLUMN IF NOT EXISTS rua_cruzamento TEXT;
ALTER TABLE public.projetos_npo ADD COLUMN IF NOT EXISTS rua_limite_a TEXT;
ALTER TABLE public.projetos_npo ADD COLUMN IF NOT EXISTS rua_limite_b TEXT;

-- 17. Adicionar colunas de coordenadas próprias à tabela projetos_npo
ALTER TABLE public.projetos_npo ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE public.projetos_npo ADD COLUMN IF NOT EXISTS longitude NUMERIC;

-- 18. Tabela de Empresas Prestadoras (NCE) — Cadastro global de contratos
CREATE TABLE IF NOT EXISTS public.empresas_prestadoras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    cnpj TEXT NOT NULL UNIQUE,
    numero_contrato TEXT NOT NULL,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.empresas_prestadoras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados podem ler empresas" ON public.empresas_prestadoras;
DROP POLICY IF EXISTS "Somente coordenador pode gerenciar empresas" ON public.empresas_prestadoras;

CREATE POLICY "Autenticados podem ler empresas"
ON public.empresas_prestadoras FOR SELECT TO authenticated USING (true);

CREATE POLICY "Somente coordenador/admin pode gerenciar empresas"
ON public.empresas_prestadoras FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.perfis_usuarios
            WHERE id = auth.uid() AND nivel_acesso IN ('coordenador', 'admin'))
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.perfis_usuarios
            WHERE id = auth.uid() AND nivel_acesso IN ('coordenador', 'admin'))
);

-- 19. Tabela de Preços Unitários com Histórico de Versões (NCE)
CREATE TABLE IF NOT EXISTS public.precos_empresa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES public.empresas_prestadoras(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL,        -- Ex: 'hz_mecanica', 'balizador_ret'
    grupo TEXT NOT NULL CHECK (grupo IN ('implantar', 'retirar')),
    preco_unitario NUMERIC(12,2) NOT NULL,
    data_vigencia DATE NOT NULL,
    motivo TEXT,                   -- Ex: 'Contrato inicial', 'Reajuste', 'Aditivo'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para buscar o preço mais recente por empresa+item
CREATE INDEX IF NOT EXISTS idx_precos_empresa_lookup
ON public.precos_empresa (id_empresa, item_key, data_vigencia DESC);

ALTER TABLE public.precos_empresa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados podem ler precos" ON public.precos_empresa;
DROP POLICY IF EXISTS "Somente coordenador pode inserir precos" ON public.precos_empresa;
DROP POLICY IF EXISTS "Somente coordenador/admin pode inserir precos" ON public.precos_empresa;

CREATE POLICY "Autenticados podem ler precos"
ON public.precos_empresa FOR SELECT TO authenticated USING (true);

CREATE POLICY "Somente coordenador/admin pode inserir precos"
ON public.precos_empresa FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (SELECT 1 FROM public.perfis_usuarios
            WHERE id = auth.uid() AND nivel_acesso IN ('coordenador', 'admin'))
);

-- 20. Adicionar quantitativos_gerais_autorizados na tabela execucao_nce
ALTER TABLE public.execucao_nce ADD COLUMN IF NOT EXISTS quantitativos_gerais_autorizados JSONB;

-- 21. Tabela de Vistorias e Fiscalização (NCE)
CREATE TABLE IF NOT EXISTS public.vistorias_nce (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_execucao_nce UUID REFERENCES public.execucao_nce(id) ON DELETE CASCADE,
    id_demanda_pai UUID NOT NULL REFERENCES public.demandas_pai(id) ON DELETE CASCADE,
    data_vistoria DATE NOT NULL DEFAULT CURRENT_DATE,
    id_fiscal UUID REFERENCES public.perfis_usuarios(id),
    nome_fiscal TEXT NOT NULL,
    status_vistoria TEXT NOT NULL CHECK (status_vistoria IN ('Aprovado Total', 'Aprovado Parcial c/ Pendências', 'Reprovado / Não Executado')),
    percentual_concluido NUMERIC(5,2) DEFAULT 0,
    parecer_tecnico TEXT,
    medicao_quantitativos JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.vistorias_nce ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados podem ler vistorias" ON public.vistorias_nce;
DROP POLICY IF EXISTS "Autenticados podem inserir vistorias" ON public.vistorias_nce;
CREATE POLICY "Autenticados podem ler vistorias" ON public.vistorias_nce FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados podem inserir vistorias" ON public.vistorias_nce FOR INSERT TO authenticated WITH CHECK (true);

-- 22. Adicionar campos de agendamento e historico_reagendamentos em execucao_nce
ALTER TABLE public.execucao_nce 
ADD COLUMN IF NOT EXISTS data_execucao DATE,
ADD COLUMN IF NOT EXISTS turno_execucao TEXT,
ADD COLUMN IF NOT EXISTS historico_reagendamentos JSONB DEFAULT '[]'::jsonb;

-- 23. Atualizar restrição CHECK de status_nce para incluir 'Programado'
ALTER TABLE public.execucao_nce DROP CONSTRAINT IF EXISTS execucao_nce_status_nce_check;
ALTER TABLE public.execucao_nce DROP CONSTRAINT IF EXISTS check_status_nce;
ALTER TABLE public.execucao_nce ADD CONSTRAINT check_status_nce 
CHECK (status_nce IN ('Aguardando Programação', 'Programado', 'Equipe em Campo', 'Concluído', 'Cancelado', 'Pendência Técnica'));





