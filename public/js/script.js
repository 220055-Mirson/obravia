// ── CONFIGURAÇÃO DA API ──
// REMOVA esta linha fixa:
// const API_URL = 'http://localhost:3000/api';
// Agora usa a variável global API_URL do config.js

// ── VARIÁVEIS GLOBAIS ──
let todosProjetos = [];
let projetosFiltrados = [];
let categoriaAtual = 'todos';

// ── CARREGAR PROJETOS DO BACKEND ──
// ── FILTROS DE PROVÍNCIA ──
let _todosProjectos = [];
let _todosPedidos   = [];
let _categoriaActiva = 'todos';
let _provinciaProjectos = 'todos';
let _provinciaPedidos   = 'todos';

function filtrarProvinciaProjetos(provincia) {
  _provinciaProjectos = provincia;
  aplicarFiltro();
}

function filtrarProvinciaPedidos(provincia) {
  _provinciaPedidos = provincia;
  renderPedidosFiltrados();
}

function renderProjectosFiltrados() {
  const grid = document.getElementById('projetosGrid');
  if (!grid) return;

  let dados = _todosProjectos;

  if (_categoriaActiva !== 'todos') {
    dados = dados.filter(p => p.categoria === _categoriaActiva);
  }
  if (_provinciaProjectos !== 'todos') {
    dados = dados.filter(p => p.local && p.local.trim() === _provinciaProjectos.trim());
  }

  if (!dados.length) {
    grid.innerHTML = '<p style="color:#aaa;font-size:13px;padding:1rem">Nenhum projecto encontrado para este filtro.</p>';
    return;
  }

  // Re-render using existing card logic
  grid.innerHTML = dados.map(projeto => {
    const engNome = projeto.engenheiro_nome || projeto.engenheiro || 'Engenheiro';
    const fotos   = Array.isArray(projeto.fotos) ? projeto.fotos : (typeof projeto.fotos === 'string' ? JSON.parse(projeto.fotos || '[]') : []);
    const fotoCapa = projeto.foto_capa || fotos[0] || '';
    const uploadsUrl = typeof UPLOADS_URL !== 'undefined' ? UPLOADS_URL : '';
    const imgSrc = fotoCapa ? (fotoCapa.startsWith('http') ? fotoCapa : `${uploadsUrl}/${fotoCapa.replace(/^\//, '')}`) : '';
    return `<div class="card" onclick="window.location.href='detalhes.html?id=${projeto.id}'">
      <div class="card-img" style="background:#F1EFE8;min-height:160px;display:flex;align-items:center;justify-content:center;overflow:hidden">
        ${imgSrc ? `<img src="${imgSrc}" alt="${escapeHtml(projeto.titulo)}" style="width:100%;height:160px;object-fit:cover" onerror="this.style.display='none'">` : '<span style="font-size:2rem">🏗️</span>'}
      </div>
      <div class="card-content">
        <span class="tag">${escapeHtml(projeto.categoria || 'Geral')}</span>
        <h3>${escapeHtml(projeto.titulo)}</h3>
        <p class="card-eng">👷 ${escapeHtml(engNome)}</p>
        <p class="card-local">📍 ${escapeHtml(projeto.local || '')}</p>
        <button class="btn-contacto" onclick="event.stopPropagation(); abrirModalContacto('${escapeHtml(engNome)}', ${projeto.usuario_id || 0}, ${projeto.id})">Pedir contacto</button>
      </div>
    </div>`;
  }).join('');
}

function renderPedidosFiltrados() {
  const grid = document.getElementById('pedidosGrid');
  if (!grid) return;

  let dados = _todosPedidos;
  if (_provinciaPedidos !== 'todos') {
    dados = dados.filter(p => p.local && p.local.trim() === _provinciaPedidos.trim());
  }

  if (!dados.length) {
    const msg = _provinciaPedidos !== 'todos'
      ? 'Nenhum pedido publicado nesta província.'
      : 'Ainda não há pedidos publicados.';
    grid.innerHTML = `<p style="color:#aaa;font-size:13px;padding:1rem">${msg}</p>`;
    return;
  }

  grid.innerHTML = dados.map(p => {
    const data = tempoRelativo(p.criado_em);
    const descCurta = p.descricao.length > 140 ? p.descricao.substring(0, 140) + '...' : p.descricao;
    const orc = p.orcamento_min || p.orcamento_max
      ? `Orçamento: ${p.orcamento_min ? Number(p.orcamento_min).toLocaleString('pt-MZ') + ' MZN' : '?'} – ${p.orcamento_max ? Number(p.orcamento_max).toLocaleString('pt-MZ') + ' MZN' : 'Sem limite'}`
      : '';
    return `
      <div class="pedido-card">
        <span class="pedido-tipo">${p.tipo}</span>
        <h4>${p.tipo} · ${p.local}</h4>
        <p class="pedido-meta">Cliente: ${p.nome_cliente} · Publicado ${data}</p>
        <p style="font-size:13px; color:#5F5E5A;">${descCurta}</p>
        <div class="pedido-sugestao">
          <strong>Urgência:</strong> ${p.urgencia || 'Não definida'}${orc ? ' &nbsp;·&nbsp; ' + orc : ''}
        </div>
      </div>`;
  }).join('');
}

async function carregarProjetos() {
  const grid = document.getElementById('projetosGrid');
  
  try {
    const response = await fetch(`${API_URL}/projetos`);
    
    if (response.ok) {
      todosProjetos = await response.json();
      aplicarFiltro();
    } else {
      throw new Error('Erro ao carregar projetos');
    }
  } catch (error) {
    console.error('Erro:', error);
    if (grid) {
      grid.innerHTML = `
        <div class="empty-projetos">
          <h3>⚠️ Erro ao carregar projetos</h3>
          <p>Não foi possível conectar ao servidor. Verifique se o backend está rodando.</p>
          <button onclick="location.reload()" style="margin-top: 1rem; padding: 8px 16px; background: var(--laranja); color: white; border: none; border-radius: 8px; cursor: pointer;">Tentar novamente</button>
        </div>
      `;
    }
  }
}

// ── APLICAR FILTRO ──
function filtrarProjetos(categoria, provincia) {
  if (categoria !== null && categoria !== undefined) _categoriaActiva = categoria;
  if (provincia  !== null && provincia  !== undefined) _provinciaProjectos = provincia;
  categoriaAtual = categoria;
  
  // Atualizar botões ativos
  document.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.classList.remove('ativo');
    if (btn.getAttribute('data-categoria') === categoria) {
      btn.classList.add('ativo');
    }
  });
  
  aplicarFiltro();
}

function aplicarFiltro() {
  if (categoriaAtual === 'todos') {
    projetosFiltrados = [...todosProjetos];
  } else {
    projetosFiltrados = todosProjetos.filter(p => p.categoria === categoriaAtual);
  }
  // Filtro de província
  if (_provinciaProjectos !== 'todos') {
    projetosFiltrados = projetosFiltrados.filter(p => p.local && p.local.includes(_provinciaProjectos));
  }
  exibirProjetos();
}

// ── EXIBIR PROJETOS NA GRID ──
function exibirProjetos() {
  const grid = document.getElementById('projetosGrid');
  
  if (!grid) return;
  
  if (projetosFiltrados.length === 0) {
    grid.innerHTML = `
      <div class="empty-projetos">
        <h3>📭 Nenhum projeto encontrado</h3>
        <p>${categoriaAtual !== 'todos' ? `Nenhum projeto na categoria "${categoriaAtual}" ainda.` : 'Seja o primeiro a publicar um projeto!'}</p>
        ${categoriaAtual !== 'todos' ? '<button class="btn-outline" onclick="filtrarProjetos(\'todos\')" style="margin-top: 1rem;">Ver todos</button>' : '<a href="cadastro-engenheiro.html" class="btn-primary" style="margin-top: 1rem; display: inline-block;">Criar perfil</a>'}
      </div>
    `;
    return;
  }
  
  grid.innerHTML = projetosFiltrados.map(projeto => {
    const iniciais = (projeto.engenheiro_nome || projeto.engenheiro || 'Eng').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const local = projeto.local || 'Moçambique';
    
    // CORREÇÃO: Verificar se tags é array, se não for, converter ou usar array vazio
    let tags = [];
    if (projeto.tags) {
      if (Array.isArray(projeto.tags)) {
        tags = projeto.tags;
      } else if (typeof projeto.tags === 'string') {
        tags = projeto.tags.split(',').map(t => t.trim());
      }
    }
    
    return `
      <div class="card">
        <img class="card-img" src="${projeto.foto_capa || (projeto.fotos && projeto.fotos[0]) || 'https://placehold.co/600x400/D4B896/FFFFFF?text=Sem+Imagem'}" alt="${escapeHtml(projeto.titulo)}">
        <div class="card-body">
          <div class="card-engenheiro">
            <div class="avatar">${iniciais}</div>
            <div>
              <div class="card-nome">${escapeHtml(projeto.engenheiro_nome || projeto.engenheiro || 'Engenheiro')}</div>
              <div class="card-local"><span class="dot-local"></span>${escapeHtml(local)}</div>
            </div>
          </div>
          <h3 onclick="verDetalhes(${projeto.id})">${escapeHtml(projeto.titulo)}</h3>
          <p>${escapeHtml(projeto.descricao.substring(0, 100))}${projeto.descricao.length > 100 ? '...' : ''}</p>
          <div class="card-tags">
            ${tags.slice(0, 3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
          <div class="card-acoes">
            <button class="btn-contacto" onclick="abrirModalContacto('${escapeHtml(projeto.engenheiro_nome || projeto.engenheiro || 'Engenheiro')}', ${projeto.usuario_id || 0}, ${projeto.id})">Pedir contacto</button>
            <button class="btn-ver" onclick="verDetalhes(${projeto.id})">Ver</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ── VER DETALHES DO PROJETO ──
function verDetalhes(projetoId) {
  window.location.href = `detalhes.html?id=${projetoId}`;
}

// ── CARREGAR PEDIDOS (dados estáticos para demonstração) ──
async function carregarPedidos() {
  const pedidosGrid = document.getElementById('pedidosGrid');
  if (!pedidosGrid) return;

  pedidosGrid.innerHTML = '<p style="color:#aaa;font-size:13px;padding:1rem">A carregar pedidos...</p>';

  try {
    const res = await fetch(`${API_URL}/pedidos`);
    if (!res.ok) throw new Error('Erro na API');
    const pedidos = await res.json();

    _todosPedidos = pedidos;
    renderPedidosFiltrados();
    return;

    // render legacy (nunca executado — mantido para referência)
    pedidosGrid.innerHTML = pedidos.map(p => {
      const data = tempoRelativo(p.criado_em);
      const descCurta = p.descricao.length > 140 ? p.descricao.substring(0, 140) + '...' : p.descricao;
      const orc = p.orcamento_min || p.orcamento_max
        ? `Orçamento: ${p.orcamento_min ? Number(p.orcamento_min).toLocaleString('pt-MZ') + ' MZN' : '?'} – ${p.orcamento_max ? Number(p.orcamento_max).toLocaleString('pt-MZ') + ' MZN' : 'Sem limite'}`
        : '';
      return `
        <div class="pedido-card">
          <span class="pedido-tipo">${p.tipo}</span>
          <h4>${p.tipo} · ${p.local}</h4>
          <p class="pedido-meta">Cliente: ${p.nome_cliente} · Publicado ${data}</p>
          <p style="font-size:13px; color:#5F5E5A;">${descCurta}</p>
          <div class="pedido-sugestao">
            <strong>Urgência:</strong> ${p.urgencia || 'Não definida'}${orc ? ' &nbsp;·&nbsp; ' + orc : ''}
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    pedidosGrid.innerHTML = '<p style="color:#aaa;font-size:13px;padding:1rem">Não foi possível carregar os pedidos.</p>';
  }
}

function tempoRelativo(iso) {
  if (!iso) return '–';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 3600)  return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return 'ontem';
  return `há ${Math.floor(diff / 86400)} dias`;
}

// ── AUTH E WELCOME ──
function atualizarWelcome() {
  const bemVindo = document.getElementById('bemVindo');
  
  // Tentar obter o nome de várias fontes possíveis para evitar falhas
  let nome = localStorage.getItem('usuarioLogado');
  
  if (!nome) {
    try {
      const userObj = JSON.parse(localStorage.getItem('user') || '{}');
      if (userObj && userObj.nome) {
        nome = userObj.nome;
      }
    } catch(e) {
      console.error('Erro ao ler dados do utilizador:', e);
    }
  }

  if (bemVindo) {
    bemVindo.innerText = nome ? `Bem-vindo, ${nome}` : 'Bem-vindo, Visitante';
  }
  
  atualizarNavbar();
}

function atualizarNavbar() {
  const navLinks = document.getElementById('navLinks');
  if (!navLinks) return;

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const tipo = user.tipo || user.role || '';
  const tiposEng = ['senior', 'junior', 'empresa'];
  const isEng    = tiposEng.includes(tipo);
  const isAdmin  = tipo === 'admin' || user.email === 'admin@obravia.com';
  const logado   = !!user.id;

  // Limpar itens dinâmicos (manter Sobre e Sair que estão no HTML)
  navLinks.querySelectorAll('.item-dinamico').forEach(el => el.remove());

  const inserirAntesSobre = (html) => {
    const sobre = navLinks.querySelector('.btn-sobre')?.parentElement;
    if (sobre) sobre.insertAdjacentHTML('beforebegin', html);
  };

  // Gerir visibilidade do botão Sair
  const itemSair = document.getElementById('itemSair');

  if (!logado) {
    // Visitante: botão Entrar + esconder Sair
    if (itemSair) itemSair.style.display = 'none';
    inserirAntesSobre('<li class="item-dinamico"><a href="welcome.html" class="btn-add-project">Entrar</a></li>');
    return;
  }

  // Logado: mostrar Sair
  if (itemSair) itemSair.style.display = 'list-item';

  if (isAdmin) {
    inserirAntesSobre('<li class="item-dinamico"><a href="admin.html" class="btn-admin">Admin</a></li>');
    return;
  }

  if (isEng) {
    // Engenheiro: Adicionar Projecto + Ver Pedidos + Chat
    inserirAntesSobre(`
      <li class="item-dinamico"><a href="#" class="btn-add-project" onclick="abrirModalLoginProjetos(); return false;">Adicionar Projecto</a></li>
      <li class="item-dinamico"><a href="painel-engenheiro.html" class="btn-add-project" style="background:#3B6D11">Ver Pedidos</a></li>
      <li class="item-dinamico">
        <a href="#" class="btn-notificacoes" id="btnNotif" onclick="toggleChat(event)">
          💬 Mensagens <span class="notif-badge" id="notifBadge" style="display:none">0</span>
        </a>
      </li>
    `);
    carregarBadgeChat();
  } else {
    // Cliente: Notificações de propostas + Chat
    inserirAntesSobre(`
      <li class="item-dinamico">
        <a href="#" class="btn-notificacoes" id="btnNotifPropostas" onclick="toggleNotificacoes(event)">
          🔔 Propostas <span class="notif-badge" id="notifBadge" style="display:none">0</span>
        </a>
      </li>
      <li class="item-dinamico">
        <a href="#" class="btn-notificacoes" id="btnNotif" onclick="toggleChat(event)" style="background:#3B6D11">
          💬 Mensagens <span class="notif-badge" id="chatBadge" style="display:none">0</span>
        </a>
      </li>
    `);
    carregarNotificacoes();
    carregarBadgeChat();
  }
}

async function verificarCadastroAdmin(username, menuAdmin) {
  if (!menuAdmin) return;
  
  try {
    const response = await fetch(`${API_URL}/verificar-cadastro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    
    const data = await response.json();
    
    if (data.cadastrado && data.status === 'aprovado') {
      menuAdmin.style.display = "list-item";
    } else {
      menuAdmin.style.display = "none";
    }
  } catch (error) {
    console.error('Erro ao verificar cadastro:', error);
    menuAdmin.style.display = "none";
  }
}

// ── NOTIFICAÇÕES (propostas recebidas pelo cliente) ──
let notifAberto = false;

async function carregarNotificacoes() {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  if (!token) return;
  try {
    const res = await fetch(`${API_URL}/meus-pedidos`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const pedidos = await res.json();

    // Para cada pedido, buscar propostas
    const todasPropostas = [];
    for (const p of pedidos) {
      const r2 = await fetch(`${API_URL}/pedidos/${p.id}/propostas`);
      if (r2.ok) {
        const props = await r2.json();
        props.forEach(pr => todasPropostas.push({ ...pr, pedido_tipo: p.tipo, pedido_local: p.local, pedido_codigo: p.codigo }));
      }
    }

    const badge = document.getElementById('notifBadge');
    if (badge) {
      const pendentes = todasPropostas.filter(p => p.status === 'pendente').length;
      badge.textContent = pendentes;
      badge.style.display = pendentes > 0 ? 'inline-flex' : 'none';
    }
    window._notificacoes = todasPropostas;
  } catch (e) { console.error('Erro notificações:', e); }
}

function toggleNotificacoes(e) {
  e.preventDefault();
  const existente = document.getElementById('painelNotif');
  if (existente) { existente.remove(); notifAberto = false; return; }
  notifAberto = true;
  renderPainelNotificacoes();
}

function renderPainelNotificacoes() {
  const existente = document.getElementById('painelNotif');
  if (existente) existente.remove();

  const propostas = window._notificacoes || [];
  const itens = propostas.length
    ? propostas.map(p => `
        <div style="padding:12px 16px;border-bottom:1px solid #F1EFE8;">
          <div style="font-size:11px;color:#aaa;font-family:monospace">${p.pedido_codigo || 'PED-?'}</div>
          <div style="font-weight:700;font-size:13px;margin:2px 0">${p.pedido_tipo} · ${p.pedido_local}</div>
          <div style="font-size:12px;color:#666">👷 ${p.engenheiro_nome}</div>
          <div style="font-size:13px;color:#3B6D11;font-weight:600;margin-top:4px">${p.valor ? Number(p.valor).toLocaleString('pt-MZ') + ' MZN' : 'Valor não definido'} · ${p.prazo || '–'}</div>
          <div style="font-size:12px;color:#888;margin-top:2px">${p.descricao ? p.descricao.substring(0,80)+'...' : ''}</div>
          <div style="margin-top:8px;display:flex;gap:6px">
            <button onclick="aceitarProposta(${p.id})" style="background:#3B6D11;color:white;border:none;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">✓ Aceitar</button>
            <button onclick="rejeitarProposta(${p.id})" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">✕ Rejeitar</button>
          </div>
        </div>`).join('')
    : '<div style="padding:2rem;text-align:center;color:#bbb;font-size:13px">Ainda não recebeu propostas.</div>';

  const painel = document.createElement('div');
  painel.id = 'painelNotif';
  painel.style.cssText = `
    position:fixed; top:80px; right:1.5rem;
    width:340px; max-height:480px;
    background:white; border-radius:14px;
    border:1.5px solid #D3D1C7;
    box-shadow:0 16px 48px rgba(0,0,0,0.15);
    overflow:hidden; z-index:500;
    animation:fadeDown .2s ease;
  `;
  painel.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid #F1EFE8;display:flex;align-items:center;justify-content:space-between;background:#FAFAF7">
      <span style="font-family:'Syne',sans-serif;font-size:14px;font-weight:800">🔔 Propostas Recebidas</span>
      <button onclick="document.getElementById('painelNotif').remove()" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:#aaa">✕</button>
    </div>
    <div style="overflow-y:auto;max-height:400px">${itens}</div>
  `;
  document.body.appendChild(painel);

  // Fechar ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', function fecharFora(ev) {
      const p = document.getElementById('painelNotif');
      const btn = document.getElementById('btnNotif');
      if (p && !p.contains(ev.target) && btn && !btn.contains(ev.target)) {
        p.remove();
        document.removeEventListener('click', fecharFora);
      }
    });
  }, 100);
}

async function aceitarProposta(id) {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  try {
    await fetch(`${API_URL}/propostas/${id}/aceitar`, {
      method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` }
    });
    mostrarToast('✅ Proposta aceite! O engenheiro será notificado.');
    document.getElementById('painelNotif')?.remove();
    carregarNotificacoes();
  } catch(e) { mostrarToast('Erro ao aceitar proposta.'); }
}

async function rejeitarProposta(id) {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  try {
    await fetch(`${API_URL}/propostas/${id}/rejeitar`, {
      method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` }
    });
    mostrarToast('Proposta rejeitada.');
    document.getElementById('painelNotif')?.remove();
    carregarNotificacoes();
  } catch(e) { mostrarToast('Erro ao rejeitar proposta.'); }
}

// ════════════════════════════════════════════
//  CHAT INTERNO
// ════════════════════════════════════════════

let chatAberto = false;
let conversaAtiva = null;
let pollingInterval = null;

async function carregarBadgeChat() {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  if (!token) return;
  try {
    const res = await fetch(`${API_URL}/chat/nao-lidas`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const { total } = await res.json();
    ['notifBadge','chatBadge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = total; el.style.display = total > 0 ? 'inline-flex' : 'none'; }
    });
  } catch(e) {}
}

async function toggleChat(e) {
  e.preventDefault();
  const existente = document.getElementById('painelChat');
  if (existente) {
    existente.remove();
    clearInterval(pollingInterval);
    conversaAtiva = null;
    return;
  }
  abrirPainelChat();
}

async function abrirPainelChat() {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  if (!token) return;

  const painel = document.createElement('div');
  painel.id = 'painelChat';
  painel.style.cssText = `
    position:fixed; top:80px; right:1.5rem;
    width:380px; height:520px;
    background:white; border-radius:16px;
    border:1.5px solid #D3D1C7;
    box-shadow:0 20px 60px rgba(0,0,0,0.18);
    z-index:500; display:flex; flex-direction:column;
    overflow:hidden; animation:fadeDown .2s ease;
    font-family:'DM Sans',sans-serif;
  `;
  painel.innerHTML = `
    <div id="chatHeader" style="padding:14px 16px;background:#444441;color:white;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <span style="font-family:'Syne',sans-serif;font-weight:800;font-size:14px">💬 Mensagens</span>
      <button onclick="document.getElementById('painelChat').remove(); clearInterval(pollingInterval);" style="background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.7);font-size:1.1rem">✕</button>
    </div>
    <div id="chatBody" style="flex:1;overflow:hidden;display:flex;flex-direction:column">
      <div id="listaConversas" style="flex:1;overflow-y:auto"></div>
    </div>
  `;
  document.body.appendChild(painel);
  await carregarConversas();
}

async function carregarConversas() {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  const lista = document.getElementById('listaConversas');
  if (!lista) return;

  lista.innerHTML = '<div style="padding:1rem;text-align:center;color:#bbb;font-size:13px">A carregar...</div>';

  try {
    const res = await fetch(`${API_URL}/chat/conversas`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const conversas = await res.json();

    if (!conversas.length) {
      lista.innerHTML = '<div style="padding:2rem;text-align:center;color:#bbb;font-size:13px">Sem conversas ainda.<br>As conversas aparecem quando uma proposta é aceite.</div>';
      return;
    }

    lista.innerHTML = conversas.map(c => `
      <div onclick="abrirConversa(${c.proposta_id})" style="padding:14px 16px;border-bottom:1px solid #F1EFE8;cursor:pointer;transition:background .15s;display:flex;gap:12px;align-items:flex-start" onmouseover="this.style.background='#FAFAF7'" onmouseout="this.style.background='white'">
        <div style="width:40px;height:40px;border-radius:50%;background:#FAECE7;color:#D85A30;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">
          ${c.pedido_tipo?.[0] || '🏗'}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
            <span style="font-weight:700;font-size:13px">${c.pedido_tipo} · ${c.pedido_local}</span>
            ${c.nao_lidas > 0 ? `<span style="background:#D85A30;color:white;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700">${c.nao_lidas}</span>` : ''}
          </div>
          <div style="font-size:12px;color:#888;margin-bottom:2px">${c.engenheiro_nome || c.nome_cliente || ''}</div>
          <div style="font-size:12px;color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.ultima_msg || 'Sem mensagens ainda — inicie a conversa'}</div>
        </div>
      </div>
    `).join('');
  } catch(e) {
    lista.innerHTML = '<div style="padding:1rem;text-align:center;color:#bbb;font-size:13px">Erro ao carregar conversas.</div>';
  }
}

async function abrirConversa(propostaId) {
  conversaAtiva = propostaId;
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  const user  = JSON.parse(localStorage.getItem('user') || '{}');

  const chatBody = document.getElementById('chatBody');
  if (!chatBody) return;

  chatBody.innerHTML = `
    <div style="padding:10px 14px;background:#FAFAF7;border-bottom:1px solid #F1EFE8;display:flex;align-items:center;gap:8px;flex-shrink:0">
      <button onclick="conversaAtiva=null; carregarConversas(); clearInterval(pollingInterval);" style="background:none;border:none;cursor:pointer;font-size:1rem;color:#888">←</button>
      <span style="font-size:13px;font-weight:700" id="chatTitulo">Conversa</span>
    </div>
    <div id="chatMensagens" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px"></div>
    <div style="padding:10px 12px;border-top:1px solid #F1EFE8;display:flex;gap:8px;flex-shrink:0">
      <input id="inputMsg" type="text" placeholder="Escreva uma mensagem..." maxlength="500"
        style="flex:1;padding:10px 13px;border:1.5px solid #D3D1C7;border-radius:8px;font-size:13px;outline:none;font-family:'DM Sans',sans-serif"
        onkeydown="if(event.key==='Enter') enviarMsg(${propostaId})"
        onfocus="this.style.borderColor='#D85A30'" onblur="this.style.borderColor='#D3D1C7'">
      <button onclick="enviarMsg(${propostaId})" style="background:#D85A30;color:white;border:none;border-radius:8px;padding:10px 16px;cursor:pointer;font-size:1rem">➤</button>
    </div>
  `;

  await renderMensagens(propostaId, user.id);

  // Polling a cada 3 segundos
  clearInterval(pollingInterval);
  pollingInterval = setInterval(() => renderMensagens(propostaId, user.id), 3000);
}

async function renderMensagens(propostaId, meuId) {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  const container = document.getElementById('chatMensagens');
  if (!container) { clearInterval(pollingInterval); return; }

  try {
    const res = await fetch(`${API_URL}/chat/${propostaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const msgs = await res.json();
    const eraNoFundo = container.scrollTop + container.clientHeight >= container.scrollHeight - 10;

    container.innerHTML = msgs.length
      ? msgs.map(m => {
          const minha = m.remetente_id === meuId;
          const hora  = new Date(m.enviada_em).toLocaleTimeString('pt', { hour:'2-digit', minute:'2-digit' });
          return `
            <div style="display:flex;flex-direction:column;align-items:${minha?'flex-end':'flex-start'}">
              ${!minha ? `<span style="font-size:10px;color:#aaa;margin-bottom:2px;padding-left:4px">${m.remetente_nome}</span>` : ''}
              <div style="max-width:78%;padding:9px 13px;border-radius:${minha?'14px 14px 4px 14px':'14px 14px 14px 4px'};background:${minha?'#D85A30':'#F1EFE8'};color:${minha?'white':'#444441'};font-size:13px;line-height:1.4">
                ${m.conteudo}
              </div>
              <span style="font-size:10px;color:#ccc;margin-top:2px;padding:0 4px">${hora}</span>
            </div>`;
        }).join('')
      : '<div style="text-align:center;color:#ccc;font-size:12px;padding:2rem">Sem mensagens. Diga olá! 👋</div>';

    if (eraNoFundo) container.scrollTop = container.scrollHeight;
    carregarBadgeChat();
  } catch(e) {}
}

async function enviarMsg(propostaId) {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  const input = document.getElementById('inputMsg');
  const texto = input?.value.trim();
  if (!texto) return;
  input.value = '';
  try {
    await fetch(`${API_URL}/chat/${propostaId}`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
      body: JSON.stringify({ conteudo: texto })
    });
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    await renderMensagens(propostaId, user.id);
  } catch(e) {}
}

function pedirServico() {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  if (!token) {
    window.location.href = 'welcome.html';
  } else {
    window.location.href = 'publicar-pedido.html';
  }
}

function logout() {
  const token = localStorage.getItem("authToken");
  
  if (token) {
    fetch(`${API_URL}/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    }).catch(console.error);
  }
  
  localStorage.removeItem('usuarioLogado');
  localStorage.removeItem('authToken');
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

// ── MODAIS EXISTENTES ──
let engenheiroAtual = '';
let engenheiroAlvoId = 0;
let projetoRefId = 0;

function abrirModalContacto(engenheiro, engId, projId) {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  if (!token) { window.location.href = 'welcome.html'; return; }
  engenheiroAtual  = engenheiro;
  engenheiroAlvoId = engId || 0;
  projetoRefId     = projId || 0;
  document.getElementById('modalTitulo').innerText = `Contactar: ${engenheiro}`;
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.nome) document.getElementById('clienteNome').value = user.nome;
  document.getElementById('modalContacto').classList.add('aberto');
}

function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove("aberto");
  }
}

async function enviarPedido() {
  const nome = document.getElementById('clienteNome')?.value.trim();
  const tel  = document.getElementById('clienteTel')?.value.trim();
  const tipo = document.getElementById('clienteTipo')?.value;
  const msg  = document.getElementById('clienteMensagem')?.value.trim();
  if (!nome || !tel) { mostrarToast('Por favor preencha nome e telefone.'); return; }
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  const user  = JSON.parse(localStorage.getItem('user') || '{}');
  try {
    await fetch(`${API_URL}/pedidos-directos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        engenheiro_id: engenheiroAlvoId, engenheiro_nome: engenheiroAtual,
        projeto_id: projetoRefId, cliente_nome: nome, cliente_tel: tel,
        tipo_projeto: tipo, mensagem: msg, cliente_id: user.id || null
      })
    });
  } catch(e) {}
  fecharModal('modalContacto');
  mostrarToast(`✅ Pedido enviado para ${engenheiroAtual}! Aguarde o contacto.`);
  ['clienteNome','clienteTel','clienteMensagem'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
}


function mostrarToast(msg) {
  const toast = document.getElementById("toast");
  document.getElementById("toastMensagem").innerText = msg;
  toast.classList.add("visivel");
  setTimeout(() => toast.classList.remove("visivel"), 4000);
}

// ── ADICIONAR PROJECTO ──
function abrirModalLoginProjetos() {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  const user  = JSON.parse(localStorage.getItem('user') || '{}');
  const tiposEng = ['senior', 'junior', 'empresa'];

  if (token && tiposEng.includes(user.tipo)) {
    // Logado como engenheiro → vai directo
    window.location.href = 'publicar-projeto.html';
  } else {
    // Não logado → vai para login
    window.location.href = 'login.html';
  }
}


async function verificarEngenheiro() {
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value;
  const errorDiv = document.getElementById('loginError');
  
  if (!email || !senha) {
    if (errorDiv) {
      errorDiv.textContent = 'Preencha email e senha!';
      errorDiv.style.display = 'block';
    }
    return;
  }
  
  if (errorDiv) errorDiv.style.display = 'none';
  
  // Mostrar loading
  const btn = event.target;
  const originalText = btn.innerText;
  btn.innerText = 'Verificando...';
  btn.disabled = true;
  
  try {
    // USAR A ROTA DE LOGIN EXISTENTE (ela já aceita qualquer usuário)
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })  // Note: "senha" não "password"
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Salvar dados do usuário
      localStorage.setItem('authToken', result.token);
      localStorage.setItem('token', result.token);
      localStorage.setItem('usuarioLogado', result.user.nome);
      localStorage.setItem('role', result.user.role);
      localStorage.setItem('user', JSON.stringify(result.user));

      mostrarToast(`✅ Bem-vindo, ${result.user.nome}! Redirecionando...`);
      fecharModal('modalLoginProjetos');

      // Redirecionar conforme o tipo de utilizador
      const tipo = result.user.tipo || result.user.role;
      const engenheiros = ['senior', 'junior', 'empresa'];
      const destino = engenheiros.includes(tipo)
        ? 'painel-engenheiro.html'
        : 'publicar-projeto.html';

      setTimeout(() => {
        window.location.href = destino;
      }, 1500);
    } else {
      if (errorDiv) {
        errorDiv.textContent = result.error || '❌ Usuário não encontrado! Faça o registro primeiro.';
        errorDiv.style.display = 'block';
      }
      mostrarToast(result.error || 'Erro no login!', true);
    }
  } catch (error) {
    console.error('Erro:', error);
    if (errorDiv) {
      errorDiv.textContent = 'Erro ao conectar com o servidor.';
      errorDiv.style.display = 'block';
    }
    mostrarToast('Erro de conexão', true);
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

// ── UTILITÁRIOS ──
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── EVENTOS E INICIALIZAÇÃO ──
document.addEventListener('DOMContentLoaded', () => {
  // Configurar modais
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('aberto');
    });
  });
  
  // Configurar botão Adicionar Projetos
  const addProjectBtn = document.getElementById('addProjectBtn');
  if (addProjectBtn) {
    addProjectBtn.addEventListener('click', function(e) {
      e.preventDefault();
      abrirModalLoginProjetos();
    });
  }
  
  // Carregar dados
  atualizarWelcome();
  carregarProjetos();
  carregarPedidos();
});