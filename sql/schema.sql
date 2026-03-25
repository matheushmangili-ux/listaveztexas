-- ============================================
-- ListaVez Texas — Schema
-- Executar no Supabase SQL Editor
-- ============================================

-- Enums
CREATE TYPE vendedor_status AS ENUM ('disponivel', 'em_atendimento', 'pausa', 'fora');
CREATE TYPE atendimento_resultado AS ENUM ('venda', 'nao_convertido', 'troca', 'em_andamento');
CREATE TYPE motivo_perda AS ENUM ('preco', 'ruptura', 'indecisao', 'so_olhando', 'outro');

-- Vendedores
CREATE TABLE vendedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    apelido TEXT,
    status vendedor_status NOT NULL DEFAULT 'fora',
    posicao_fila INT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Turnos
CREATE TABLE turnos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    abertura TIMESTAMPTZ NOT NULL DEFAULT now(),
    fechamento TIMESTAMPTZ,
    aberto_por UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Turno x Vendedores
CREATE TABLE turno_vendedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turno_id UUID NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
    vendedor_id UUID NOT NULL REFERENCES vendedores(id),
    entrada TIMESTAMPTZ NOT NULL DEFAULT now(),
    saida TIMESTAMPTZ,
    UNIQUE(turno_id, vendedor_id)
);

-- Atendimentos
CREATE TABLE atendimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendedor_id UUID NOT NULL REFERENCES vendedores(id),
    turno_id UUID NOT NULL REFERENCES turnos(id),
    inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
    fim TIMESTAMPTZ,
    resultado atendimento_resultado NOT NULL DEFAULT 'em_andamento',
    motivo_perda motivo_perda,
    motivo_detalhe TEXT,
    produto_ruptura TEXT,
    valor_venda NUMERIC(10,2),
    cliente_fidelizado BOOLEAN NOT NULL DEFAULT false,
    observacao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configurações (key-value)
CREATE TABLE configuracoes (
    chave TEXT PRIMARY KEY,
    valor JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_atendimentos_vendedor ON atendimentos(vendedor_id);
CREATE INDEX idx_atendimentos_turno ON atendimentos(turno_id);
CREATE INDEX idx_atendimentos_inicio ON atendimentos(inicio);
CREATE INDEX idx_atendimentos_resultado ON atendimentos(resultado);
CREATE INDEX idx_vendedores_status ON vendedores(status);
CREATE INDEX idx_vendedores_posicao ON vendedores(posicao_fila);
CREATE INDEX idx_turnos_data ON turnos(data);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendedores_updated_at
    BEFORE UPDATE ON vendedores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
