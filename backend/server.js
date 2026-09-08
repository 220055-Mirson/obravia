// ============================================================
//  OBRAVIA — server.js  (PostgreSQL + novo fluxo pedidos)
// ============================================================

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const cors     = require('cors');
const fs       = require('fs');
const db       = require('./db');
const session  = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app  = express();

// ── RATE LIMITING (sem dependências externas) ──
const _loginAttempts = new Map(); // IP -> { count, lastAttempt }

function checkRateLimit(ip) {
    const now    = Date.now();
    const entry  = _loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    // Reset após 15 minutos
    if (now - entry.lastAttempt > 15 * 60 * 1000) {
        _loginAttempts.set(ip, { count: 1, lastAttempt: now });
        return null;
    }
    if (entry.count >= 5) {
        const wait = Math.ceil((15 * 60 * 1000 - (now - entry.lastAttempt)) / 1000 / 60);
        return `Demasiadas tentativas. Tente novamente em ${wait} minuto(s).`;
    }
    _loginAttempts.set(ip, { count: entry.count + 1, lastAttempt: now });
    return null;
}

function clearRateLimit(ip) {
    _loginAttempts.delete(ip);
}
const PORT = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
    origin:         '*',
    methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ── HTTPS REDIRECT ───────────────────────────────────────────
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' &&
        req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
});

// ── MIDDLEWARES ───────────────────────────────────────────────
app.use(session({
    secret: process.env.SESSION_SECRET || 'obravia_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// ── MULTER ────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename:    (_req, file,  cb) => {
        const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, suffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── HELPER: resposta de erro padronizada ──────────────────────
function erro(res, code, msg) {
    return res.status(code).json({ error: msg });
}

// ── MIDDLEWARE DE AUTENTICAÇÃO ────────────────────────────────
async function autenticar(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return erro(res, 401, 'Token não fornecido');
    const usuario = await db.verificarToken(token);
    if (!usuario) return erro(res, 401, 'Token inválido ou expirado');
    req.usuario = usuario;
    next();
}

// ── MIDDLEWARE ADMIN ──────────────────────────────────────────
function apenasAdmin(req, res, next) {
    if (req.usuario?.email !== 'adminobravia@gmail.com' && req.usuario?.role !== 'admin') {
        return erro(res, 403, 'Acesso restrito ao administrador');
    }
    next();
}

// ── MIDDLEWARE ENGENHEIRO ─────────────────────────────────────
function apenasEngenheiro(req, res, next) {
    const rolesEng = ['senior', 'junior', 'empresa'];
    if (!rolesEng.includes(req.usuario?.tipo) && !rolesEng.includes(req.usuario?.role)) {
        return erro(res, 403, 'Acesso restrito a engenheiros');
    }
    next();
}

// ── PASSPORT GOOGLE OAUTH ──────────────────────────────────────
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await db.buscarUsuarioPorId(id);
        done(null, user);
    } catch(e) { done(e, null); }
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID:     process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:  process.env.NODE_ENV === 'production'
            ? 'https://obravia.onrender.com/auth/google/callback'
            : 'http://localhost:3000/auth/google/callback'
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails[0].value;
            const nome  = profile.displayName;

            // Verificar se já existe
            let user = await db.buscarUsuarioPorEmail(email);

            if (!user) {
                // Criar cliente automaticamente
                await db.cadastrarCliente({
                    nome,
                    email,
                    senha: require('crypto').randomBytes(32).toString('hex') // senha aleatória
                });
                // Aprovar automaticamente
                user = await db.buscarUsuarioPorEmail(email);
                await db.aprovarUsuario(user.id);
                user = await db.buscarUsuarioPorEmail(email);
            }

            if (user.status !== 'aprovado') {
                return done(null, false, { message: 'Conta pendente de aprovação' });
            }

            const token = await db.criarSessao(user.id);
            user.sessionToken = token;
            return done(null, user);
        } catch(e) { return done(e, null); }
    }));
}

// ── ROTAS GOOGLE OAUTH ──
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login.html?erro=google' }),
    async (req, res) => {
        const user  = req.user;
        const token = user.sessionToken;
        // Redirecionar com token para o frontend guardar no localStorage
        const tipo  = user.tipo || user.role;
        const dest  = (tipo === 'admin') ? 'admin-novo-fluxo.html' : 'index.html';
        res.redirect(`/${dest}?google_token=${token}&google_user=${encodeURIComponent(JSON.stringify({
            id: user.id, nome: user.nome, email: user.email,
            role: user.role, tipo: user.tipo, status: user.status
        }))}`);
    }
);

// ════════════════════════════════════════════
//  ROTAS GERAIS
// ════════════════════════════════════════════

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

app.get('/health', (_req, res) =>
    res.json({ status: 'ok', db: 'postgresql', timestamp: new Date().toISOString() })
);

// ════════════════════════════════════════════
//  CADASTRO
// ════════════════════════════════════════════

// Empresa
app.post('/api/cadastro/empresa',
    upload.fields([{ name: 'alvara', maxCount: 1 }, { name: 'nuit_comprovativo', maxCount: 1 }]),
    async (req, res) => {
        try {
            const { nome_empresa, email, senha, nuit, responsavel, bi } = req.body;
            if (!nome_empresa || !email || !senha || !nuit || !responsavel || !bi)
                return erro(res, 400, 'Todos os campos são obrigatórios');

            const alvara_path              = req.files?.alvara?.[0]?.path || '';
            const nuit_comprovativo_path   = req.files?.nuit_comprovativo?.[0]?.path || '';

            const id = await db.cadastrarEmpresa({
                nome_empresa, email, senha, nuit, responsavel, bi,
                alvara_path, nuit_comprovativo_path
            });
            res.json({ success: true, message: 'Empresa cadastrada! Aguarde verificação.', id });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    }
);

// Engenheiro Sénior
app.post('/api/cadastro/senior',
    upload.fields([{ name: 'diploma', maxCount: 1 }]),
    async (req, res) => {
        try {
            const { nome, email, senha, anos_experiencia } = req.body;
            if (!nome || !email || !senha)
                return erro(res, 400, 'Nome, email e senha são obrigatórios');

            const diploma_path = req.files?.diploma?.[0]?.path || '';
            const id = await db.cadastrarSenior({ nome, email, senha, diploma_path, anos_experiencia });
            res.json({ success: true, message: 'Engenheiro Sénior cadastrado! Aguarde verificação.', id });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    }
);

// Engenheiro Júnior
app.post('/api/cadastro/junior',
    upload.fields([{ name: 'diploma', maxCount: 1 }]),
    async (req, res) => {
        try {
            const { nome, email, senha, especializacao, linkedin } = req.body;
            if (!nome || !email || !senha)
                return erro(res, 400, 'Nome, email e senha são obrigatórios');

            const diploma_path = req.files?.diploma?.[0]?.path || '';
            const id = await db.cadastrarJunior({ nome, email, senha, diploma_path, especializacao, linkedin });
            res.json({ success: true, message: 'Engenheiro Júnior cadastrado!', id });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    }
);

// Cliente
app.post('/api/cadastro/cliente', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        if (!nome || !email || !senha)
            return erro(res, 400, 'Nome, email e senha são obrigatórios');
        const senhaErro = db.validarSenha(senha);
        if (senhaErro) return erro(res, 400, senhaErro);

        // Verificar se email já existe
        const existe = await db.buscarUsuarioPorEmail(email);
        if (existe) return erro(res, 409, 'Este email já está registado');

        const id = await db.cadastrarCliente({ nome, email, senha });

        // Login automático após cadastro
        const result = await db.login(email, senha);
        res.status(201).json({ success: true, id, token: result.token, user: result.user });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// ════════════════════════════════════════════
//  AUTENTICAÇÃO
// ════════════════════════════════════════════

app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) return erro(res, 400, 'Email e senha são obrigatórios');

    // Rate limiting por IP
    const ip       = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const bloqueio = checkRateLimit(ip);
    if (bloqueio) return erro(res, 429, bloqueio);

    const result = await db.login(email, senha);
    if (!result.success) return erro(res, 401, result.error);

    // Login bem sucedido — limpar tentativas
    clearRateLimit(ip);
    res.json({ success: true, token: result.token, user: result.user });
});

// ════════════════════════════════════════════
//  GOOGLE OAUTH
// ════════════════════════════════════════════

app.get('/auth/google', (req, res) => {
    const params = new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        redirect_uri:  process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/auth/google/callback`,
        response_type: 'code',
        scope:         'openid email profile',
        access_type:   'offline',
        prompt:        'select_account'
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/login.html?erro=google_cancelado');

    try {
        const redirectUri = process.env.GOOGLE_REDIRECT_URI ||
            `${req.protocol}://${req.get('host')}/auth/google/callback`;

        // Trocar code por token
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id:     process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri:  redirectUri,
                grant_type:    'authorization_code'
            })
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) throw new Error('Token inválido');

        // Obter perfil do utilizador
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const profile = await profileRes.json();
        if (!profile.email) throw new Error('Email não obtido');

        // Verificar se utilizador já existe
        let user = await db.buscarUsuarioPorEmail(profile.email);

        if (!user) {
            // Criar conta automaticamente para clientes Google
            const id = await db.cadastrarCliente({
                nome:  profile.name || profile.email.split('@')[0],
                email: profile.email,
                senha: require('crypto').randomBytes(32).toString('hex') // senha aleatória
            });
            user = await db.buscarUsuarioPorId(id);
        }

        if (user.status !== 'aprovado') {
            return res.redirect('/login.html?erro=pendente');
        }

        // Criar sessão
        const token = await db.criarSessao(user.id);

        // Redirecionar com token via query param (temporário, guardado no localStorage pelo JS)
        const destino = ['admin'].includes(user.role) ? '/admin-novo-fluxo.html' : '/index.html';
        res.redirect(`/auth-callback.html?token=${token}&nome=${encodeURIComponent(user.nome)}&role=${user.role}&tipo=${user.tipo || ''}&id=${user.id}&destino=${destino}`);

    } catch (e) {
        console.error('Google OAuth erro:', e);
        res.redirect('/login.html?erro=google_falhou');
    }
});

app.post('/api/verificar-cadastro', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.json({ cadastrado: false });
    const user = await db.verificarCadastro(username);
    if (!user)    return res.json({ cadastrado: false });
    res.json({ cadastrado: true, tipo: user.tipo, status: user.status, id: user.id });
});

app.post('/api/verificar-token', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ valido: false });
    const usuario = await db.verificarToken(token);
    if (!usuario) return res.json({ valido: false });
    res.json({ valido: true, usuario });
});

app.post('/api/logout', async (req, res) => {
    const { token } = req.body;
    if (token) await db.removerSessao(token);
    res.json({ success: true });
});

// ════════════════════════════════════════════
//  PROJECTOS  (legado — mantido intacto)
// ════════════════════════════════════════════

app.get('/api/projetos', async (_req, res) => {
    try { res.json(await db.listarTodosProjetos()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/projetos/:id', async (req, res) => {
    try {
        const p = await db.buscarProjetoPorId(req.params.id);
        if (!p) return erro(res, 404, 'Projeto não encontrado');
        res.json(p);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/meus-projetos', autenticar, async (req, res) => {
    try { res.json(await db.listarProjetosPorUsuario(req.usuario.id)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projetos', autenticar, upload.array('fotos', 10), async (req, res) => {
    try {
        const { titulo, descricao, categoria, local, tags } = req.body;
        if (!titulo || !descricao) return erro(res, 400, 'Título e descrição são obrigatórios');

        const fotosPaths = (req.files || []).map(f => `/uploads/${path.basename(f.path)}`);
        const id = await db.criarProjeto({
            titulo, descricao,
            categoria: categoria || 'Outros',
            local: local || '', tags: tags || '',
            fotos: fotosPaths,
            foto_capa: fotosPaths[0] || '',
            usuario_id: req.usuario.id,
            engenheiro_nome: req.usuario.nome
        });
        res.json({ success: true, id });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/projetos/:id', autenticar, async (req, res) => {
    try {
        const p = await db.buscarProjetoPorId(req.params.id);
        if (!p || p.usuario_id !== req.usuario.id)
            return erro(res, 403, 'Sem permissão para editar este projecto');
        await db.atualizarProjeto(req.params.id, req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/projetos/:id', autenticar, async (req, res) => {
    try {
        const p = await db.buscarProjetoPorId(req.params.id);
        if (!p || p.usuario_id !== req.usuario.id)
            return erro(res, 403, 'Sem permissão para eliminar este projecto');
        await db.excluirProjeto(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════
//  PEDIDOS  (novo fluxo)
// ════════════════════════════════════════════

// Listar pedidos — público (engenheiros vêem sem login)
app.get('/api/pedidos', async (req, res) => {
    try {
        const { status, tipo, busca } = req.query;
        const pedidos = await db.listarPedidos({ status, tipo, busca });
        res.json(pedidos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ver pedido por ID
app.get('/api/pedidos/:id', async (req, res) => {
    try {
        const p = await db.buscarPedidoPorId(req.params.id);
        if (!p) return erro(res, 404, 'Pedido não encontrado');
        res.json(p);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Meus pedidos (cliente autenticado)
app.get('/api/meus-pedidos', autenticar, async (req, res) => {
    try {
        const pedidos = await db.pedidosPorUsuario(req.usuario.id);
        res.json(pedidos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Criar pedido — autenticado OU anónimo (campo nome_cliente obrigatório)
app.post('/api/pedidos', async (req, res) => {
    try {
        const {
            tipo, descricao, local,
            talhao, orcamento_min, orcamento_max,
            urgencia, nome_cliente, telefone,
            email_cliente, contacto_preferencia
        } = req.body;

        if (!tipo || !descricao || !local || !nome_cliente)
            return erro(res, 400, 'tipo, descricao, local e nome_cliente são obrigatórios');

        // Opcional: associar ao utilizador autenticado
        const token    = req.headers.authorization?.split(' ')[1];
        const usuario  = token ? await db.verificarToken(token) : null;

        const result = await db.criarPedido({
            tipo, descricao, local, talhao,
            orcamento_min, orcamento_max, urgencia,
            nome_cliente, telefone, email_cliente,
            contacto_preferencia,
            usuario_id: usuario?.id || null
        });

        res.status(201).json({ success: true, id: result.id, codigo: result.codigo });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Actualizar status do pedido (autenticado — admin ou dono)
app.patch('/api/pedidos/:id/status', autenticar, async (req, res) => {
    try {
        const { status } = req.body;
        const estadosValidos = ['aberto','propostas','negociacao','fechado','cancelado'];
        if (!estadosValidos.includes(status))
            return erro(res, 400, `Status inválido. Use: ${estadosValidos.join(', ')}`);

        const pedido = await db.buscarPedidoPorId(req.params.id);
        if (!pedido) return erro(res, 404, 'Pedido não encontrado');

        const isAdmin = req.usuario.email === 'admin@obravia.com' || req.usuario.role === 'admin';
        const isDono  = pedido.usuario_id === req.usuario.id;
        if (!isAdmin && !isDono) return erro(res, 403, 'Sem permissão');

        await db.atualizarStatusPedido(req.params.id, status);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Eliminar pedido (admin ou dono)
app.delete('/api/pedidos/:id', autenticar, async (req, res) => {
    try {
        const pedido  = await db.buscarPedidoPorId(req.params.id);
        if (!pedido)  return erro(res, 404, 'Pedido não encontrado');

        const isAdmin = req.usuario.email === 'admin@obravia.com' || req.usuario.role === 'admin';
        const isDono  = pedido.usuario_id === req.usuario.id;
        if (!isAdmin && !isDono) return erro(res, 403, 'Sem permissão');

        await db.eliminarPedido(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════
//  PROPOSTAS  (novo fluxo)
// ════════════════════════════════════════════

// Listar propostas de um pedido (público — cliente compara)
app.get('/api/pedidos/:id/propostas', async (req, res) => {
    try {
        const propostas = await db.listarPropostasPorPedido(req.params.id);
        res.json(propostas);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Listar todas as propostas do engenheiro autenticado
app.get('/api/minhas-propostas', autenticar, async (req, res) => {
    try {
        const propostas = await db.listarPropostasPorEngenheiro(req.usuario.id);
        res.json(propostas);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Enviar proposta — engenheiro autenticado OU anónimo (com nome)
app.post('/api/propostas', async (req, res) => {
    try {
        const {
            pedido_id, engenheiro_nome,
            valor, prazo, descricao, disponibilidade
        } = req.body;

        if (!pedido_id || !descricao || !valor || !prazo)
            return erro(res, 400, 'pedido_id, valor, prazo e descricao são obrigatórios');

        // Engenheiro autenticado (opcional)
        const token       = req.headers.authorization?.split(' ')[1];
        const engenheiro  = token ? await db.verificarToken(token) : null;

        const id = await db.criarProposta({
            pedido_id,
            engenheiro_id:   engenheiro?.id   || null,
            engenheiro_nome: engenheiro?.nome || engenheiro_nome || 'Anónimo',
            valor, prazo, descricao, disponibilidade
        });

        res.status(201).json({ success: true, id });
    } catch (e) {
        console.error(e);
        // Proposta duplicada = 409 Conflict
        const code = e.message.includes('Já enviou') ? 409 : 500;
        res.status(code).json({ error: e.message });
    }
});

// Aceitar proposta (dono do pedido ou admin)
app.patch('/api/propostas/:id/aceitar', autenticar, async (req, res) => {
    try {
        await db.aceitarProposta(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Rejeitar proposta (dono do pedido ou admin)
app.patch('/api/propostas/:id/rejeitar', autenticar, async (req, res) => {
    try {
        await db.rejeitarProposta(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════
//  ADMIN
// ════════════════════════════════════════════

// Estatísticas
app.get('/api/admin/stats', autenticar, apenasAdmin, async (_req, res) => {
    try { res.json(await db.estatisticasAdmin()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// Todos os utilizadores
app.get('/api/admin/usuarios', autenticar, apenasAdmin, async (_req, res) => {
    try { res.json(await db.listarUsuarios()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// Utilizadores pendentes
app.get('/api/admin/usuarios/pendentes', autenticar, apenasAdmin, async (_req, res) => {
    try { res.json(await db.listarUsuariosPendentes()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// Aprovar utilizador
app.put('/api/admin/usuarios/:id/aprovar', autenticar, apenasAdmin, async (req, res) => {
    try {
        await db.aprovarUsuario(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Rejeitar/eliminar utilizador
app.delete('/api/admin/usuarios/:id', autenticar, apenasAdmin, async (req, res) => {
    try {
        await db.rejeitarUsuario(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Todos os pedidos (admin)
app.get('/api/admin/pedidos', autenticar, apenasAdmin, async (req, res) => {
    try {
        const pedidos = await db.listarPedidos(req.query);
        res.json(pedidos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Todas as propostas (admin)
app.get('/api/admin/propostas', autenticar, apenasAdmin, async (_req, res) => {
    try { res.json(await db.listarTodasPropostas()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// Avançar status de pedido (admin)
app.patch('/api/admin/pedidos/:id/status', autenticar, apenasAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        await db.atualizarStatusPedido(req.params.id, status);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Eliminar pedido (admin)
app.delete('/api/admin/pedidos/:id', autenticar, apenasAdmin, async (req, res) => {
    try {
        await db.eliminarPedido(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════
//  TRANSAÇÕES / COMISSÕES
// ════════════════════════════════════════════

// Listar transações (admin)
app.get('/api/admin/transacoes', autenticar, apenasAdmin, async (req, res) => {
    try {
        const transacoes = await db.listarTransacoes(req.query);
        res.json(transacoes);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Resumo financeiro (admin)
app.get('/api/admin/financeiro', autenticar, apenasAdmin, async (_req, res) => {
    try {
        const resumo = await db.resumoFinanceiro();
        res.json(resumo);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Actualizar status de transação (admin confirma/cancela)
app.patch('/api/admin/transacoes/:id/status', autenticar, apenasAdmin, async (req, res) => {
    try {
        const { status, notas } = req.body;
        const validos = ['pendente', 'confirmado', 'cancelado'];
        if (!validos.includes(status)) return erro(res, 400, 'Status inválido');
        await db.atualizarStatusTransacao(req.params.id, status, notas);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Criar transação manual (admin)
app.post('/api/admin/transacoes', autenticar, apenasAdmin, async (req, res) => {
    try {
        const { proposta_id, pedido_id, engenheiro_id, engenheiro_nome,
                engenheiro_tipo, valor_total, notas } = req.body;
        if (!proposta_id || !pedido_id || !valor_total)
            return erro(res, 400, 'proposta_id, pedido_id e valor_total são obrigatórios');
        const result = await db.criarTransacao({
            proposta_id, pedido_id, engenheiro_id, engenheiro_nome,
            engenheiro_tipo, valor_total: parseFloat(valor_total), notas
        });
        res.status(201).json({ success: true, ...result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Transações do engenheiro autenticado
app.get('/api/minhas-transacoes', autenticar, async (req, res) => {
    try {
        const transacoes = await db.transacoesPorEngenheiro(req.usuario.id);
        res.json(transacoes);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════
//  PEDIDOS DIRECTOS
// ════════════════════════════════════════════

// Receber pedido directo de cliente
app.post('/api/pedidos-directos', async (req, res) => {
    try {
        const { engenheiro_id, engenheiro_nome, projeto_id,
                cliente_nome, cliente_tel, tipo_projeto, mensagem, cliente_id } = req.body;
        if (!cliente_nome) return erro(res, 400, 'Nome do cliente é obrigatório');
        if (!engenheiro_id) return erro(res, 400, 'Engenheiro não identificado');
        const id = await db.criarPedidoDirecto({
            engenheiro_id, engenheiro_nome, projeto_id,
            cliente_id, cliente_nome, cliente_tel, tipo_projeto, mensagem
        });
        res.status(201).json({ success: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Listar pedidos directos do engenheiro autenticado
app.get('/api/pedidos-directos', autenticar, async (req, res) => {
    try {
        const pedidos = await db.listarPedidosDirectos(req.usuario.id);
        res.json(pedidos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Marcar pedido directo como lido
app.patch('/api/pedidos-directos/:id/lido', autenticar, async (req, res) => {
    try {
        await db.marcarPedidoDirectoLido(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Contar pedidos novos (para badge)
app.get('/api/pedidos-directos/novos', autenticar, async (req, res) => {
    try {
        const total = await db.contarPedidosDirectosNovos(req.usuario.id);
        res.json({ total });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════
//  CHAT / MENSAGENS
// ════════════════════════════════════════════

// Conversas do utilizador (propostas aceites com chat)
app.get('/api/chat/conversas', autenticar, async (req, res) => {
    try {
        const tiposEng = ['senior', 'junior', 'empresa'];
        const tipo = tiposEng.includes(req.usuario.tipo) ? 'engenheiro' : 'cliente';
        const conversas = await db.propostasComChat(req.usuario.id, tipo);
        res.json(conversas);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mensagens de uma conversa (proposta)
app.get('/api/chat/:proposta_id', autenticar, async (req, res) => {
    try {
        const msgs = await db.listarMensagens(req.params.proposta_id);
        await db.marcarLidas(req.params.proposta_id, req.usuario.id);
        res.json(msgs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Enviar mensagem
app.post('/api/chat/:proposta_id', autenticar, async (req, res) => {
    try {
        const { conteudo } = req.body;
        if (!conteudo?.trim()) return erro(res, 400, 'Mensagem vazia');
        const id = await db.enviarMensagem({
            proposta_id:    req.params.proposta_id,
            remetente_id:   req.usuario.id,
            remetente_nome: req.usuario.nome,
            conteudo:       conteudo.trim()
        });
        res.status(201).json({ success: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Contagem de não lidas (para badge)
app.get('/api/chat/nao-lidas', autenticar, async (req, res) => {
    try {
        const total = await db.contarNaoLidas(req.usuario.id);
        res.json({ total });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Fallback SPA ──────────────────────────────────────────────
app.use('*', (_req, res) => {
    res.status(404).sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Iniciar servidor ──────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 OBRAVIA servidor em http://localhost:${PORT}`);
    console.log(`🗄️  Base de dados: PostgreSQL`);
    console.log(`📁  Uploads: ${uploadDir}`);
    console.log(`🌍  Ambiente: ${process.env.NODE_ENV || 'desenvolvimento'}`);
});