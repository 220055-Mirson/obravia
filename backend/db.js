// ============================================================
//  OBRAVIA — db.js  (PostgreSQL)
//  Migrado de SQLite → PostgreSQL + tabelas pedidos/propostas
// ============================================================

const { Pool } = require('pg');
const bcrypt    = require('bcrypt');
const crypto    = require('crypto');

// ── Conexão ──────────────────────────────────────────────────
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Fallback p/ desenvolvimento local sem DATABASE_URL
    ...(process.env.DATABASE_URL ? {} : {
        host:     process.env.PG_HOST     || 'localhost',
        port:     parseInt(process.env.PG_PORT || '5432'),
        database: process.env.PG_DATABASE || 'obravia',
        user:     process.env.PG_USER     || 'postgres',
        password: process.env.PG_PASSWORD || 'postgres',
    }),
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('❌ PostgreSQL pool error:', err));

// ── Helpers ──────────────────────────────────────────────────
async function query(sql, params = []) {
    const client = await pool.connect();
    try {
        const res = await client.query(sql, params);
        return res;
    } finally {
        client.release();
    }
}

async function getOne(sql, params = []) {
    const res = await query(sql, params);
    return res.rows[0] || null;
}

async function getAll(sql, params = []) {
    const res = await query(sql, params);
    return res.rows;
}

async function run(sql, params = []) {
    const res = await query(sql, params);
    return res;               // .rowCount, .rows[0].id via RETURNING
}

// ── Inicializar banco ─────────────────────────────────────────
async function inicializarBanco() {
    console.log('📦 Inicializando banco de dados PostgreSQL...');

    // ── usuarios ──
    await run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id                      SERIAL PRIMARY KEY,
            nome                    TEXT NOT NULL,
            email                   TEXT UNIQUE NOT NULL,
            senha                   TEXT NOT NULL,
            role                    TEXT DEFAULT 'usuario',
            status                  TEXT DEFAULT 'pendente',
            telefone                TEXT,
            tipo                    TEXT,
            numero_ordem            TEXT,
            diploma_path            TEXT,
            anos_experiencia        TEXT,
            especializacao          TEXT,
            linkedin                TEXT,
            empresa_nome            TEXT,
            nuit                    TEXT,
            responsavel             TEXT,
            bi                      TEXT,
            alvara_path             TEXT,
            nuit_comprovativo_path  TEXT,
            created_at              TIMESTAMPTZ DEFAULT NOW(),
            data_criacao            TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    // ── sessoes ──
    await run(`
        CREATE TABLE IF NOT EXISTS sessoes (
            id            SERIAL PRIMARY KEY,
            token         TEXT UNIQUE NOT NULL,
            usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            data_criacao  TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    // ── projetos ──
    await run(`
        CREATE TABLE IF NOT EXISTS projetos (
            id                SERIAL PRIMARY KEY,
            titulo            TEXT NOT NULL,
            descricao         TEXT NOT NULL,
            categoria         TEXT DEFAULT 'Outros',
            local             TEXT,
            tags              TEXT,
            fotos             JSONB DEFAULT '[]',
            foto_capa         TEXT,
            usuario_id        INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            engenheiro_nome   TEXT,
            data_criacao      TIMESTAMPTZ DEFAULT NOW(),
            data_atualizacao  TIMESTAMPTZ
        )
    `);

    // ── pedidos  (NOVO — clientes publicam pedidos de orçamento) ──
    await run(`
        CREATE TABLE IF NOT EXISTS pedidos (
            id                   SERIAL PRIMARY KEY,
            codigo               TEXT UNIQUE,          -- PED-XXXXXX gerado pela app
            tipo                 TEXT NOT NULL,         -- Residencial, Comercial...
            descricao            TEXT NOT NULL,
            local                TEXT NOT NULL,
            talhao               NUMERIC,              -- m²
            orcamento_min        NUMERIC,
            orcamento_max        NUMERIC,
            urgencia             TEXT,
            nome_cliente         TEXT NOT NULL,
            telefone             TEXT,
            email_cliente        TEXT,
            contacto_preferencia TEXT,
            status               TEXT DEFAULT 'aberto', -- aberto|propostas|negociacao|fechado|cancelado
            usuario_id           INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
            criado_em            TIMESTAMPTZ DEFAULT NOW(),
            atualizado_em        TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    // ── propostas  (NOVO — engenheiros enviam propostas a pedidos) ──
    await run(`
        CREATE TABLE IF NOT EXISTS propostas (
            id                SERIAL PRIMARY KEY,
            pedido_id         INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
            engenheiro_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
            engenheiro_nome   TEXT,
            valor             NUMERIC,
            prazo             TEXT,
            descricao         TEXT,
            disponibilidade   TEXT,
            status            TEXT DEFAULT 'pendente',  -- pendente|aceite|rejeitada
            enviada_em        TIMESTAMPTZ DEFAULT NOW(),
            atualizado_em     TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    // Índices úteis
    await run(`CREATE INDEX IF NOT EXISTS idx_pedidos_status    ON pedidos(status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_pedidos_tipo      ON pedidos(tipo)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_propostas_pedido  ON propostas(pedido_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_propostas_eng     ON propostas(engenheiro_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_sessoes_token     ON sessoes(token)`);
    // Migração: adicionar coluna expira_em se não existir
    await run(`ALTER TABLE sessoes ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')`);

    await criarTabelasSeguranca();
    await criarTabelaTransacoes();
    await criarTabelaPedidosDirectos();
    await criarTabelaMensagens();
    console.log('✅ Banco PostgreSQL inicializado com sucesso!');
}

// ════════════════════════════════════════════
//  UTILIZADORES
// ════════════════════════════════════════════

async function cadastrarEmpresa(dados) {
    const { nome_empresa, email, senha, nuit, responsavel, bi,
            alvara_path, nuit_comprovativo_path } = dados;
    const senhaHash = await bcrypt.hash(senha, 10);
    const res = await run(
        `INSERT INTO usuarios
            (nome, email, senha, role, status, tipo,
             empresa_nome, nuit, responsavel, bi, alvara_path, nuit_comprovativo_path)
         VALUES ($1,$2,$3,'empresa','pendente','empresa',$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [nome_empresa, email, senhaHash, nome_empresa, nuit, responsavel,
         bi, alvara_path, nuit_comprovativo_path]
    );
    return res.rows[0].id;
}

async function cadastrarSenior(dados) {
    const { nome, email, senha, diploma_path, anos_experiencia } = dados;
    const senhaHash = await bcrypt.hash(senha, 10);
    const res = await run(
        `INSERT INTO usuarios
            (nome, email, senha, role, status, tipo, diploma_path, anos_experiencia)
         VALUES ($1,$2,$3,'senior','pendente','senior',$4,$5)
         RETURNING id`,
        [nome, email, senhaHash, diploma_path, anos_experiencia]
    );
    return res.rows[0].id;
}

async function cadastrarJunior(dados) {
    const { nome, email, senha, diploma_path, especializacao, linkedin } = dados;
    const senhaHash = await bcrypt.hash(senha, 10);
    const res = await run(
        `INSERT INTO usuarios
            (nome, email, senha, role, status, tipo, diploma_path, especializacao, linkedin)
         VALUES ($1,$2,$3,'junior','pendente','junior',$4,$5,$6)
         RETURNING id`,
        [nome, email, senhaHash, diploma_path, especializacao, linkedin]
    );
    return res.rows[0].id;
}

function validarSenha(senha) {
    if (!senha || senha.length < 8) return 'A senha deve ter pelo menos 8 caracteres';
    if (!/[A-Z]/.test(senha) && !/[0-9]/.test(senha))
        return 'A senha deve conter pelo menos um número ou letra maiúscula';
    return null; // válida
}

async function cadastrarCliente(dados) {
    const { nome, email, senha } = dados;
    const senhaHash = await bcrypt.hash(senha, 10);
    const res = await run(
        `INSERT INTO usuarios
            (nome, email, senha, role, status, tipo)
         VALUES ($1,$2,$3,'usuario','aprovado','cliente')
         RETURNING id`,
        [nome, email, senhaHash]
    );
    return res.rows[0].id;
}

async function buscarUsuarioPorEmail(email) {
    return getOne('SELECT * FROM usuarios WHERE email = $1', [email]);
}

async function buscarUsuarioPorId(id) {
    return getOne('SELECT * FROM usuarios WHERE id = $1', [id]);
}

async function verificarCadastro(email) {
    return getOne(
        'SELECT id, nome, email, role, tipo, status FROM usuarios WHERE email = $1',
        [email]
    );
}

async function listarUsuarios() {
    return getAll(
        'SELECT id, nome, email, role, tipo, status, created_at FROM usuarios ORDER BY id DESC'
    );
}

async function listarUsuariosPendentes() {
    return getAll(
        `SELECT id, nome, email, tipo, status, created_at
         FROM usuarios WHERE status = 'pendente'
         ORDER BY created_at DESC`
    );
}

async function aprovarUsuario(id) {
    await run("UPDATE usuarios SET status = 'aprovado' WHERE id = $1", [id]);
}

async function rejeitarUsuario(id) {
    await run('DELETE FROM usuarios WHERE id = $1', [id]);
}

// ════════════════════════════════════════════
//  SESSÕES
// ════════════════════════════════════════════

// ════════════════════════════════════════════
//  SEGURANÇA — tabelas e funções extra
// ════════════════════════════════════════════

async function criarTabelasSeguranca() {
    // Adicionar coluna expira_em à tabela sessoes se não existir
    await run(`
        ALTER TABLE sessoes
        ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
    `);
    // Tabela de tentativas de login falhadas (rate limiting)
    await run(`
        CREATE TABLE IF NOT EXISTS login_tentativas (
            id         SERIAL PRIMARY KEY,
            email      TEXT NOT NULL,
            ip         TEXT,
            tentativas INTEGER DEFAULT 1,
            bloqueado_ate TIMESTAMPTZ,
            ultima_tentativa TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_tentativas_email ON login_tentativas(email)`);
}

async function verificarRateLimit(email, ip) {
    const r = await getOne(
        `SELECT * FROM login_tentativas WHERE email = $1`,
        [email]
    );
    if (!r) return { bloqueado: false };
    if (r.bloqueado_ate && new Date(r.bloqueado_ate) > new Date()) {
        const mins = Math.ceil((new Date(r.bloqueado_ate) - new Date()) / 60000);
        return { bloqueado: true, mins };
    }
    return { bloqueado: false, tentativas: r.tentativas };
}

async function registarTentativaFalhada(email, ip) {
    const r = await getOne(`SELECT * FROM login_tentativas WHERE email = $1`, [email]);
    if (!r) {
        await run(`INSERT INTO login_tentativas (email, ip) VALUES ($1, $2)`, [email, ip]);
    } else {
        const novas = (r.tentativas || 0) + 1;
        const bloquear = novas >= 5
            ? `NOW() + INTERVAL '15 minutes'`
            : 'NULL';
        await run(
            `UPDATE login_tentativas SET tentativas=$1, ip=$2, ultima_tentativa=NOW(), bloqueado_ate=${bloquear} WHERE email=$3`,
            [novas, ip, email]
        );
    }
}

async function limparTentativas(email) {
    await run(`DELETE FROM login_tentativas WHERE email = $1`, [email]);
}

async function limparSessoesExpiradas() {
    await run(`DELETE FROM sessoes WHERE expira_em < NOW()`);
}

async function criarSessao(usuarioId) {
    const token = crypto.randomBytes(64).toString('hex');
    // Sessão expira em 30 dias
    await run(
        "INSERT INTO sessoes (token, usuario_id, expira_em) VALUES ($1, $2, NOW() + INTERVAL '30 days')",
        [token, usuarioId]
    );
    // Limpar sessões expiradas do mesmo utilizador
    await run(
        "DELETE FROM sessoes WHERE usuario_id = $1 AND expira_em < NOW()",
        [usuarioId]
    );
    return token;
}

async function buscarSessao(token) {
    return getOne('SELECT * FROM sessoes WHERE token = $1', [token]);
}

async function removerSessao(token) {
    await run('DELETE FROM sessoes WHERE token = $1', [token]);
}

// ════════════════════════════════════════════
//  PROJETOS
// ════════════════════════════════════════════

async function criarProjeto(dados) {
    const { titulo, descricao, categoria, local, tags,
            fotos, foto_capa, usuario_id, engenheiro_nome } = dados;
    const fotosJson = JSON.stringify(fotos || []);
    const tagsStr   = Array.isArray(tags) ? tags.join(',') : (tags || '');
    const res = await run(
        `INSERT INTO projetos
            (titulo, descricao, categoria, local, tags, fotos, foto_capa, usuario_id, engenheiro_nome)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [titulo, descricao, categoria || 'Outros', local || '',
         tagsStr, fotosJson, foto_capa || '', usuario_id, engenheiro_nome || '']
    );
    return res.rows[0].id;
}

async function listarProjetosPorUsuario(usuario_id) {
    return getAll(
        'SELECT * FROM projetos WHERE usuario_id = $1 ORDER BY data_criacao DESC',
        [usuario_id]
    );
}

async function listarTodosProjetos() {
    return getAll('SELECT * FROM projetos ORDER BY data_criacao DESC');
}

async function buscarProjetoPorId(id) {
    return getOne('SELECT * FROM projetos WHERE id = $1', [id]);
}

async function atualizarProjeto(id, dados) {
    const { titulo, descricao, categoria, local, tags } = dados;
    const tagsStr = Array.isArray(tags) ? tags.join(',') : (tags || '');
    await run(
        `UPDATE projetos
         SET titulo=$1, descricao=$2, categoria=$3, local=$4, tags=$5,
             data_atualizacao=NOW()
         WHERE id=$6`,
        [titulo, descricao, categoria, local, tagsStr, id]
    );
}

async function excluirProjeto(id) {
    await run('DELETE FROM projetos WHERE id = $1', [id]);
}

// ════════════════════════════════════════════
//  PEDIDOS  (novo fluxo)
// ════════════════════════════════════════════

function gerarCodigoPedido(id) {
    return `PED-${String(id).padStart(6, '0')}`;
}

async function criarPedido(dados) {
    const {
        tipo, descricao, local, talhao,
        orcamento_min, orcamento_max, urgencia,
        nome_cliente, telefone, email_cliente,
        contacto_preferencia, usuario_id
    } = dados;

    const res = await run(
        `INSERT INTO pedidos
            (tipo, descricao, local, talhao, orcamento_min, orcamento_max,
             urgencia, nome_cliente, telefone, email_cliente,
             contacto_preferencia, status, usuario_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'aberto',$12)
         RETURNING id`,
        [tipo, descricao, local, talhao || null,
         orcamento_min || null, orcamento_max || null, urgencia,
         nome_cliente, telefone || null, email_cliente || null,
         contacto_preferencia || null, usuario_id || null]
    );
    const id     = res.rows[0].id;
    const codigo = gerarCodigoPedido(id);
    await run('UPDATE pedidos SET codigo = $1 WHERE id = $2', [codigo, id]);
    return { id, codigo };
}

async function listarPedidos(filtros = {}) {
    let sql    = 'SELECT * FROM pedidos';
    const params = [];
    const where  = [];

    if (filtros.status && filtros.status !== 'todos') {
        params.push(filtros.status);
        where.push(`status = $${params.length}`);
    }
    if (filtros.tipo) {
        params.push(filtros.tipo);
        where.push(`tipo = $${params.length}`);
    }
    if (filtros.busca) {
        params.push(`%${filtros.busca}%`);
        const n = params.length;
        where.push(`(descricao ILIKE $${n} OR local ILIKE $${n} OR nome_cliente ILIKE $${n})`);
    }

    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY criado_em DESC';

    return getAll(sql, params);
}

async function buscarPedidoPorId(id) {
    return getOne('SELECT * FROM pedidos WHERE id = $1', [id]);
}

async function buscarPedidoPorCodigo(codigo) {
    return getOne('SELECT * FROM pedidos WHERE codigo = $1', [codigo]);
}

async function atualizarStatusPedido(id, status) {
    await run(
        'UPDATE pedidos SET status=$1, atualizado_em=NOW() WHERE id=$2',
        [status, id]
    );
}

async function eliminarPedido(id) {
    await run('DELETE FROM pedidos WHERE id = $1', [id]);
}

async function pedidosPorUsuario(usuario_id) {
    return getAll(
        'SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY criado_em DESC',
        [usuario_id]
    );
}

// ════════════════════════════════════════════
//  PROPOSTAS  (novo fluxo)
// ════════════════════════════════════════════

async function criarProposta(dados) {
    const {
        pedido_id, engenheiro_id, engenheiro_nome,
        valor, prazo, descricao, disponibilidade
    } = dados;

    // Verifica se já enviou proposta para este pedido
    const existe = await getOne(
        'SELECT id FROM propostas WHERE pedido_id=$1 AND engenheiro_id=$2',
        [pedido_id, engenheiro_id || null]
    );
    if (existe) throw new Error('Já enviou uma proposta para este pedido.');

    const res = await run(
        `INSERT INTO propostas
            (pedido_id, engenheiro_id, engenheiro_nome, valor, prazo,
             descricao, disponibilidade, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pendente')
         RETURNING id`,
        [pedido_id, engenheiro_id || null, engenheiro_nome || null,
         valor || null, prazo || null, descricao || null, disponibilidade || null]
    );

    // Avança status do pedido para 'propostas'
    await run(
        `UPDATE pedidos SET status='propostas', atualizado_em=NOW()
         WHERE id=$1 AND status='aberto'`,
        [pedido_id]
    );

    return res.rows[0].id;
}

async function listarPropostasPorPedido(pedido_id) {
    return getAll(
        'SELECT * FROM propostas WHERE pedido_id = $1 ORDER BY enviada_em DESC',
        [pedido_id]
    );
}

async function listarPropostasPorEngenheiro(engenheiro_id) {
    return getAll(
        `SELECT p.*, pd.tipo, pd.local, pd.nome_cliente, pd.codigo AS pedido_codigo
         FROM propostas p
         JOIN pedidos pd ON p.pedido_id = pd.id
         WHERE p.engenheiro_id = $1
         ORDER BY p.enviada_em DESC`,
        [engenheiro_id]
    );
}

async function listarTodasPropostas() {
    return getAll(
        `SELECT p.*,
                pd.tipo         AS pedido_tipo,
                pd.local        AS pedido_local,
                pd.nome_cliente AS pedido_cliente,
                pd.codigo       AS pedido_codigo
         FROM propostas p
         JOIN pedidos pd ON p.pedido_id = pd.id
         ORDER BY p.enviada_em DESC`
    );
}

async function aceitarProposta(proposta_id) {
    const prop = await getOne('SELECT * FROM propostas WHERE id = $1', [proposta_id]);
    if (!prop) throw new Error('Proposta não encontrada.');

    // Aceitar esta proposta
    await run(
        "UPDATE propostas SET status='aceite', atualizado_em=NOW() WHERE id=$1",
        [proposta_id]
    );
    // Rejeitar restantes do mesmo pedido
    await run(
        "UPDATE propostas SET status='rejeitada', atualizado_em=NOW() WHERE pedido_id=$1 AND id<>$2",
        [prop.pedido_id, proposta_id]
    );
    // Fechar pedido
    await run(
        "UPDATE pedidos SET status='fechado', atualizado_em=NOW() WHERE id=$1",
        [prop.pedido_id]
    );

    // Criar transação automaticamente se houver valor definido na proposta
    if (prop.valor) {
        const eng = await getOne('SELECT * FROM usuarios WHERE id = $1', [prop.engenheiro_id]);
        const tipo = eng?.tipo || 'senior';
        await criarTransacao({
            proposta_id:     prop.id,
            pedido_id:       prop.pedido_id,
            engenheiro_id:   prop.engenheiro_id,
            engenheiro_nome: prop.engenheiro_nome,
            engenheiro_tipo: tipo,
            valor_total:     parseFloat(prop.valor)
        });
    }
}

async function rejeitarProposta(proposta_id) {
    await run(
        "UPDATE propostas SET status='rejeitada', atualizado_em=NOW() WHERE id=$1",
        [proposta_id]
    );
}

// ════════════════════════════════════════════
//  AUTENTICAÇÃO
// ════════════════════════════════════════════

async function login(email, senha) {
    const user = await buscarUsuarioPorEmail(email);
    if (!user)                            return { success: false, error: 'Utilizador não encontrado' };
    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida)                     return { success: false, error: 'Senha incorrecta' };
    if (user.status !== 'aprovado')       return { success: false, error: 'Aguardando aprovação do administrador' };

    const token = await criarSessao(user.id);
    return {
        success: true,
        token,
        user: {
            id:     user.id,
            nome:   user.nome,
            email:  user.email,
            role:   user.role,
            tipo:   user.tipo,
            status: user.status
        }
    };
}

async function verificarToken(token) {
    const sessao = await getOne(
        `SELECT s.token, s.usuario_id, s.expira_em,
                u.id, u.nome, u.email, u.role, u.tipo, u.status
         FROM sessoes s
         JOIN usuarios u ON s.usuario_id = u.id
         WHERE s.token = $1
           AND (s.expira_em IS NULL OR s.expira_em > NOW())`,
        [token]
    );
    if (!sessao) return null;
    return {
        id:     sessao.usuario_id,
        nome:   sessao.nome,
        email:  sessao.email,
        role:   sessao.role,
        tipo:   sessao.tipo,
        status: sessao.status
    };
}

// ════════════════════════════════════════════
//  ESTATÍSTICAS ADMIN  (novo fluxo)
// ════════════════════════════════════════════

async function estatisticasAdmin() {
    const [pedidos, propostas, usuarios, engenheiros] = await Promise.all([
        getOne('SELECT COUNT(*) AS total FROM pedidos'),
        getOne('SELECT COUNT(*) AS total FROM propostas'),
        getOne('SELECT COUNT(*) AS total FROM usuarios'),
        getOne("SELECT COUNT(*) AS total FROM usuarios WHERE status='aprovado' AND tipo IN ('senior','junior')"),
    ]);
    const porStatus = await getAll(
        `SELECT status, COUNT(*) AS total FROM pedidos GROUP BY status`
    );
    return {
        total_pedidos:     parseInt(pedidos.total),
        total_propostas:   parseInt(propostas.total),
        total_usuarios:    parseInt(usuarios.total),
        total_engenheiros: parseInt(engenheiros.total),
        pedidos_por_status: porStatus
    };
}

// ════════════════════════════════════════════
//  PEDIDOS DIRECTOS (cliente contacta eng. via projecto)
// ════════════════════════════════════════════

async function criarTabelaPedidosDirectos() {
    await run(`
        CREATE TABLE IF NOT EXISTS pedidos_directos (
            id               SERIAL PRIMARY KEY,
            engenheiro_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
            engenheiro_nome  TEXT,
            projeto_id       INTEGER REFERENCES projetos(id) ON DELETE SET NULL,
            cliente_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
            cliente_nome     TEXT NOT NULL,
            cliente_tel      TEXT,
            tipo_projeto     TEXT,
            mensagem         TEXT,
            lido             BOOLEAN DEFAULT FALSE,
            status           TEXT DEFAULT 'novo',
            criado_em        TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_pd_engenheiro ON pedidos_directos(engenheiro_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_pd_lido ON pedidos_directos(lido)`);
}

async function criarPedidoDirecto(dados) {
    const { engenheiro_id, engenheiro_nome, projeto_id, cliente_id,
            cliente_nome, cliente_tel, tipo_projeto, mensagem } = dados;
    const res = await run(
        `INSERT INTO pedidos_directos
            (engenheiro_id, engenheiro_nome, projeto_id, cliente_id,
             cliente_nome, cliente_tel, tipo_projeto, mensagem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [engenheiro_id||null, engenheiro_nome||null, projeto_id||null,
         cliente_id||null, cliente_nome, cliente_tel||null,
         tipo_projeto||null, mensagem||null]
    );
    return res.rows[0].id;
}

async function listarPedidosDirectos(engenheiro_id) {
    return getAll(
        `SELECT pd.*, p.titulo AS projeto_titulo
         FROM pedidos_directos pd
         LEFT JOIN projetos p ON p.id = pd.projeto_id
         WHERE pd.engenheiro_id = $1
         ORDER BY pd.criado_em DESC`,
        [engenheiro_id]
    );
}

async function marcarPedidoDirectoLido(id) {
    await run('UPDATE pedidos_directos SET lido=TRUE WHERE id=$1', [id]);
}

async function contarPedidosDirectosNovos(engenheiro_id) {
    const r = await getOne(
        'SELECT COUNT(*) AS total FROM pedidos_directos WHERE engenheiro_id=$1 AND lido=FALSE',
        [engenheiro_id]
    );
    return parseInt(r?.total || 0);
}

// ════════════════════════════════════════════
//  MENSAGENS / CHAT
// ════════════════════════════════════════════

// ════════════════════════════════════════════
//  TRANSAÇÕES / COMISSÕES
// ════════════════════════════════════════════

async function criarTabelaTransacoes() {
    await run(`
        CREATE TABLE IF NOT EXISTS transacoes (
            id                  SERIAL PRIMARY KEY,
            proposta_id         INTEGER NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
            pedido_id           INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
            engenheiro_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
            engenheiro_nome     TEXT,
            engenheiro_tipo     TEXT,           -- empresa | senior | junior
            valor_total         NUMERIC(15,2) NOT NULL,
            percentagem_comissao NUMERIC(5,2) NOT NULL,
            valor_comissao      NUMERIC(15,2) NOT NULL,
            valor_engenheiro    NUMERIC(15,2) NOT NULL,
            status              TEXT DEFAULT 'pendente',  -- pendente | confirmado | cancelado
            notas               TEXT,
            criado_em           TIMESTAMPTZ DEFAULT NOW(),
            atualizado_em       TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_transacoes_proposta   ON transacoes(proposta_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_transacoes_engenheiro ON transacoes(engenheiro_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_transacoes_status     ON transacoes(status)`);
}

function calcularComissao(tipo, valorTotal) {
    const percentagens = { empresa: 8, senior: 5, junior: 3 };
    const pct   = percentagens[tipo] || 5;
    const comissao   = (valorTotal * pct) / 100;
    const engenheiro = valorTotal - comissao;
    return { percentagem: pct, comissao: parseFloat(comissao.toFixed(2)), engenheiro: parseFloat(engenheiro.toFixed(2)) };
}

async function criarTransacao(dados) {
    const { proposta_id, pedido_id, engenheiro_id, engenheiro_nome, engenheiro_tipo, valor_total, notas } = dados;
    const { percentagem, comissao, engenheiro } = calcularComissao(engenheiro_tipo, valor_total);

    const res = await run(
        `INSERT INTO transacoes
            (proposta_id, pedido_id, engenheiro_id, engenheiro_nome, engenheiro_tipo,
             valor_total, percentagem_comissao, valor_comissao, valor_engenheiro, status, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendente',$10) RETURNING id`,
        [proposta_id, pedido_id, engenheiro_id || null, engenheiro_nome, engenheiro_tipo || 'senior',
         valor_total, percentagem, comissao, engenheiro, notas || null]
    );
    return { id: res.rows[0].id, percentagem, comissao, engenheiro };
}

async function listarTransacoes(filtros = {}) {
    let sql = `
        SELECT t.*,
               p.codigo AS pedido_codigo, p.tipo AS pedido_tipo, p.local AS pedido_local,
               pr.prazo AS proposta_prazo
        FROM transacoes t
        JOIN pedidos  p  ON p.id  = t.pedido_id
        JOIN propostas pr ON pr.id = t.proposta_id
    `;
    const where  = [];
    const params = [];

    if (filtros.status) { params.push(filtros.status); where.push(`t.status = $${params.length}`); }
    if (filtros.engenheiro_id) { params.push(filtros.engenheiro_id); where.push(`t.engenheiro_id = $${params.length}`); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY t.criado_em DESC';

    return getAll(sql, params);
}

async function resumoFinanceiro() {
    const r = await getOne(`
        SELECT
            COUNT(*)                                              AS total_transacoes,
            COALESCE(SUM(valor_total),0)                         AS volume_total,
            COALESCE(SUM(valor_comissao),0)                      AS total_comissoes,
            COALESCE(SUM(valor_engenheiro),0)                    AS total_engenheiros,
            COALESCE(SUM(CASE WHEN status='confirmado' THEN valor_comissao END),0) AS comissoes_confirmadas,
            COALESCE(SUM(CASE WHEN status='pendente'   THEN valor_comissao END),0) AS comissoes_pendentes
        FROM transacoes
    `);
    const porTipo = await getAll(`
        SELECT engenheiro_tipo,
               COUNT(*) AS total,
               SUM(valor_total) AS volume,
               SUM(valor_comissao) AS comissao,
               AVG(percentagem_comissao) AS pct_media
        FROM transacoes
        GROUP BY engenheiro_tipo
    `);
    return { ...r, por_tipo: porTipo };
}

async function atualizarStatusTransacao(id, status, notas) {
    await run(
        `UPDATE transacoes SET status=$1, notas=COALESCE($2, notas), atualizado_em=NOW() WHERE id=$3`,
        [status, notas || null, id]
    );
}

async function transacoesPorEngenheiro(engenheiro_id) {
    return getAll(
        `SELECT t.*, p.codigo AS pedido_codigo, p.tipo AS pedido_tipo
         FROM transacoes t
         JOIN pedidos p ON p.id = t.pedido_id
         WHERE t.engenheiro_id = $1
         ORDER BY t.criado_em DESC`,
        [engenheiro_id]
    );
}

async function criarTabelaMensagens() {
    await run(`
        CREATE TABLE IF NOT EXISTS mensagens (
            id            SERIAL PRIMARY KEY,
            proposta_id   INTEGER NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
            remetente_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            remetente_nome TEXT NOT NULL,
            conteudo      TEXT NOT NULL,
            lida          BOOLEAN DEFAULT FALSE,
            enviada_em    TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_mensagens_proposta ON mensagens(proposta_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_mensagens_remetente ON mensagens(remetente_id)`);
}

async function enviarMensagem(dados) {
    const { proposta_id, remetente_id, remetente_nome, conteudo } = dados;
    const res = await run(
        `INSERT INTO mensagens (proposta_id, remetente_id, remetente_nome, conteudo)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [proposta_id, remetente_id, remetente_nome, conteudo]
    );
    return res.rows[0].id;
}

async function listarMensagens(proposta_id) {
    return getAll(
        `SELECT * FROM mensagens WHERE proposta_id = $1 ORDER BY enviada_em ASC`,
        [proposta_id]
    );
}

async function marcarLidas(proposta_id, usuario_id) {
    await run(
        `UPDATE mensagens SET lida=TRUE
         WHERE proposta_id=$1 AND remetente_id <> $2 AND lida=FALSE`,
        [proposta_id, usuario_id]
    );
}

async function contarNaoLidas(usuario_id) {
    // Propostas onde o utilizador é engenheiro ou cliente do pedido
    const res = await getOne(
        `SELECT COUNT(*) AS total FROM mensagens m
         JOIN propostas p ON p.id = m.proposta_id
         JOIN pedidos pd ON pd.id = p.pedido_id
         WHERE m.lida = FALSE
           AND m.remetente_id <> $1
           AND (p.engenheiro_id = $1 OR pd.usuario_id = $1)`,
        [usuario_id]
    );
    return parseInt(res?.total || 0);
}

async function propostasComChat(usuario_id, tipo) {
    // Retorna propostas aceites onde o utilizador participa, com último mensagem
    let sql;
    if (tipo === 'engenheiro') {
        sql = `
            SELECT p.id AS proposta_id, p.status, p.engenheiro_nome,
                   pd.tipo AS pedido_tipo, pd.local AS pedido_local,
                   pd.codigo AS pedido_codigo, pd.nome_cliente,
                   pd.telefone AS cliente_telefone,
                   (SELECT COUNT(*) FROM mensagens m WHERE m.proposta_id = p.id AND m.lida=FALSE AND m.remetente_id <> $1) AS nao_lidas,
                   (SELECT conteudo FROM mensagens m WHERE m.proposta_id = p.id ORDER BY enviada_em DESC LIMIT 1) AS ultima_msg,
                   (SELECT enviada_em FROM mensagens m WHERE m.proposta_id = p.id ORDER BY enviada_em DESC LIMIT 1) AS ultima_msg_data
            FROM propostas p
            JOIN pedidos pd ON pd.id = p.pedido_id
            WHERE p.engenheiro_id = $1 AND p.status = 'aceite'
            ORDER BY ultima_msg_data DESC NULLS LAST`;
    } else {
        sql = `
            SELECT p.id AS proposta_id, p.status, p.engenheiro_nome, p.valor, p.prazo,
                   pd.tipo AS pedido_tipo, pd.local AS pedido_local,
                   pd.codigo AS pedido_codigo,
                   (SELECT COUNT(*) FROM mensagens m WHERE m.proposta_id = p.id AND m.lida=FALSE AND m.remetente_id <> $1) AS nao_lidas,
                   (SELECT conteudo FROM mensagens m WHERE m.proposta_id = p.id ORDER BY enviada_em DESC LIMIT 1) AS ultima_msg,
                   (SELECT enviada_em FROM mensagens m WHERE m.proposta_id = p.id ORDER BY enviada_em DESC LIMIT 1) AS ultima_msg_data
            FROM propostas p
            JOIN pedidos pd ON pd.id = p.pedido_id
            WHERE pd.usuario_id = $1 AND p.status = 'aceite'
            ORDER BY ultima_msg_data DESC NULLS LAST`;
    }
    return getAll(sql, [usuario_id]);
}

// ════════════════════════════════════════════
//  EXPORTS
// ════════════════════════════════════════════

module.exports = {
    // Conexão directa (para uso avançado)
    pool,

    // Utilizadores
    cadastrarCliente,
    cadastrarEmpresa,
    cadastrarSenior,
    cadastrarJunior,
    buscarUsuarioPorEmail,
    buscarUsuarioPorId,
    verificarCadastro,
    listarUsuarios,
    listarUsuariosPendentes,
    aprovarUsuario,
    rejeitarUsuario,

    // Sessões
    criarSessao,
    buscarSessao,
    removerSessao,

    // Projectos (legado)
    criarProjeto,
    listarProjetosPorUsuario,
    listarTodosProjetos,
    buscarProjetoPorId,
    atualizarProjeto,
    excluirProjeto,

    // Pedidos (novo fluxo)
    criarPedido,
    listarPedidos,
    buscarPedidoPorId,
    buscarPedidoPorCodigo,
    atualizarStatusPedido,
    eliminarPedido,
    pedidosPorUsuario,

    // Propostas (novo fluxo)
    criarProposta,
    listarPropostasPorPedido,
    listarPropostasPorEngenheiro,
    listarTodasPropostas,
    aceitarProposta,
    rejeitarProposta,

    // Validação
    validarSenha,

    // Autenticação
    login,
    verificarToken,

    // Admin
    estatisticasAdmin,

    // Transações / Comissões
    criarTransacao,
    listarTransacoes,
    resumoFinanceiro,
    atualizarStatusTransacao,
    transacoesPorEngenheiro,

    // Pedidos directos
    criarPedidoDirecto,
    listarPedidosDirectos,
    marcarPedidoDirectoLido,
    contarPedidosDirectosNovos,

    // Chat / Mensagens
    enviarMensagem,
    listarMensagens,
    marcarLidas,
    contarNaoLidas,
    propostasComChat,

    // Segurança
    verificarRateLimit,
    registarTentativaFalhada,
    limparTentativas,
    limparSessoesExpiradas,
    criarTabelasSeguranca,

    // Init
    inicializarBanco,
};

// Inicializar ao carregar o módulo
inicializarBanco().catch(console.error);