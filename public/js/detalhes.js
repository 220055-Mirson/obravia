// ── CONFIGURAÇÃO DA API ──
const API_URL = 'http://localhost:3000/api';  // CORRIGIDO: adicionado /api

// ── DADOS DOS PROJETOS (FALLBACK - usado apenas se backend falhar) ──
const projetosDataFallback = {
  1: {
    id: 1,
    titulo: "Moradia Unifamiliar T4",
    descricao: "Projeto de construção residencial com acabamentos modernos, estrutura em betão armado. Esta moradia foi projetada para oferecer conforto e funcionalidade, com áreas bem distribuídas e iluminação natural privilegiada.",
    categoria: "Residencial",
    tags: ["Residencial", "Betão armado", "Moderno"],
    engenheiro: {
      nome: "Eng. Nédio Ugembe",
      local: "Maputo",
      avatar: "NU"
    },
    imagemPrincipal: "/uploads/teste1.png",
    galeria: ["/uploads/teste1.png", "/uploads/teste1.png", "/uploads/teste1.png"],
    comentarios: [
      { id: 1, usuario: "Carlos Silva", texto: "Excelente projeto! Muito bem executado.", data: "2024-01-15" }
    ]
  },
  2: {
    id: 2,
    titulo: "Edifício Comercial 5 Pisos",
    descricao: "Projeto de edifício comercial com planta aberta, sistema de climatização central e fachada moderna em vidro.",
    categoria: "Comercial",
    tags: ["Comercial", "Estruturas", "Sustentável"],
    engenheiro: {
      nome: "Eng. Ana Machava",
      local: "Matola",
      avatar: "AM"
    },
    imagemPrincipal: "/uploads/teste2.png",
    galeria: ["/uploads/teste2.png", "/uploads/teste2.png"],
    comentarios: []
  },
  3: {
    id: 3,
    titulo: "Ponte Pedonal Municipal",
    descricao: "Infra-estrutura urbana em aço galvanizado com capacidade para 500 pessoas.",
    categoria: "Infra-estrutura",
    tags: ["Infra-estrutura", "Aço", "Ponte"],
    engenheiro: {
      nome: "Eng. João Pereira",
      local: "Beira",
      avatar: "JP"
    },
    imagemPrincipal: "/uploads/teste3.png",
    galeria: ["/uploads/teste3.png", "/uploads/teste3.png"],
    comentarios: []
  },
  4: {
    id: 4,
    titulo: "Escola Primária 8 Salas",
    descricao: "Construção modular de escola com materiais locais sustentáveis e ventilação natural.",
    categoria: "Educação",
    tags: ["Educação", "Sustentável", "Modular"],
    engenheiro: {
      nome: "Eng. Sara Fumo",
      local: "Nampula",
      avatar: "SF"
    },
    imagemPrincipal: "/uploads/teste4.png",
    galeria: ["/uploads/teste4.png", "/uploads/teste4.png"],
    comentarios: []
  }
};

//VARIÁVEIS GLOBAIS
let projetoAtual = null;
let engenheiroAtual = '';

//PEGAR ID DA URL
function getProjetoId() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');
  console.log('ID do projeto:', id);
  return id;
}

function obterProjetoEmCache(id) {
  try {
    const raw = localStorage.getItem('projetoSelecionado');
    if (!raw) return null;

    const projeto = JSON.parse(raw);
    if (String(projeto.id) === String(id)) {
      return projeto;
    }
  } catch (error) {
    console.warn('Não foi possível ler o projeto em cache:', error);
  }

  return null;
}

function normalizarListaFotos(fotos, fotoCapa = '') {
  const lista = [];
  const entradas = Array.isArray(fotos) ? fotos : (fotos ? [fotos] : []);

  if (fotoCapa) entradas.unshift(fotoCapa);

  entradas.forEach((foto) => {
    if (!foto || typeof foto !== 'string') return;
    const valor = tratarCaminhoImagem(foto);
    if (valor && !lista.includes(valor)) {
      lista.push(valor);
    }
  });

  return lista;
}

//CARREGAR PROJETO DO BACKEND
async function carregarProjeto() {
  const projetoId = getProjetoId();
  
  if (!projetoId) {
    mostrarErro('ID do projeto não informado');
    return;
  }

  const projetoEmCache = obterProjetoEmCache(projetoId);
  if (projetoEmCache) {
    projetoAtual = {
      id: projetoEmCache.id,
      titulo: projetoEmCache.titulo,
      descricao: projetoEmCache.descricao,
      categoria: projetoEmCache.categoria,
      tags: projetoEmCache.tags ? (Array.isArray(projetoEmCache.tags) ? projetoEmCache.tags : projetoEmCache.tags.split(',').map(t => t.trim())) : [],
      engenheiro: {
        nome: projetoEmCache.engenheiro_nome || projetoEmCache.engenheiro || 'Engenheiro',
        local: projetoEmCache.local || 'Moçambique',
        avatar: (projetoEmCache.engenheiro_nome || projetoEmCache.engenheiro || 'EN').substring(0, 2).toUpperCase()
      },
      imagemPrincipal: tratarCaminhoImagem(projetoEmCache.foto_capa || (projetoEmCache.fotos && projetoEmCache.fotos[0])),
      galeria: normalizarListaFotos(projetoEmCache.fotos || [], projetoEmCache.foto_capa || ''),
      comentarios: projetoEmCache.comentarios || []
    };
    exibirDetalhes();
    return;
  }
  
  try {
    const url = `${API_URL}/projetos/${projetoId}`;
    console.log('Buscando projeto em:', url);
    
    const response = await fetch(url);
    console.log('Status da resposta:', response.status);
    
    if (response.ok) {
      const projeto = await response.json();
      console.log('Projeto carregado do backend:', projeto);
      const galeria = normalizarListaFotos(projeto.fotos || [], projeto.foto_capa || '');
      
      // Converter formato do backend para o formato esperado
      projetoAtual = {
        id: projeto.id,
        titulo: projeto.titulo,
        descricao: projeto.descricao,
        categoria: projeto.categoria,
        tags: projeto.tags ? (Array.isArray(projeto.tags) ? projeto.tags : projeto.tags.split(',').map(t => t.trim())) : [],
        engenheiro: {
          nome: projeto.engenheiro_nome || projeto.engenheiro || 'Engenheiro',
          local: projeto.local || 'Moçambique',
          avatar: (projeto.engenheiro_nome || projeto.engenheiro || 'EN').substring(0, 2).toUpperCase()
        },
        imagemPrincipal: galeria[0] || tratarCaminhoImagem(projeto.foto_capa || (projeto.fotos && projeto.fotos[0])),
        galeria,
        comentarios: projeto.comentarios || []
      };
      exibirDetalhes();
    } else {
      console.log('Backend não encontrou projeto, usando fallback');
      usarFallback(projetoId);
    }
  } catch (error) {
    console.warn('Backend indisponível; usando fallback local para o projeto.', error);
    usarFallback(projetoId);
  }
}

// ── TRATAR CAMINHO DA IMAGEM ──
function tratarCaminhoImagem(caminho) {
  if (!caminho) return 'https://placehold.co/800x400/D85A30/FFFFFF?text=Sem+Imagem';
  
  let imgPath = caminho.replace(/\\/g, '/');
  
  if (imgPath.startsWith('uploads/')) {
    imgPath = '/' + imgPath;
  }
  
  if (!imgPath.startsWith('http') && !imgPath.startsWith('/')) {
    imgPath = '/' + imgPath;
  }
  
  return imgPath;
}

// ── USAR FALLBACK (DADOS LOCAIS) ──
function usarFallback(projetoId) {
  if (projetosDataFallback[projetoId]) {
    console.log('Usando dados fallback para projeto ID:', projetoId);
    projetoAtual = projetosDataFallback[projetoId];
    exibirDetalhes();
  } else {
    mostrarErro('Projeto não encontrado');
  }
}

//EXIBIR DETALHES DO PROJETO
function exibirDetalhes() {
  if (!projetoAtual) return;
  
  console.log('Exibindo projeto:', projetoAtual.titulo);
  const fotosProjeto = normalizarListaFotos(projetoAtual.galeria || [], projetoAtual.imagemPrincipal || projetoAtual.foto_capa || '');
  const imagemPrincipal = fotosProjeto[0] || tratarCaminhoImagem(projetoAtual.imagemPrincipal || projetoAtual.foto_capa);
  
  // Montar galeria de fotos
  let galeriaHtml = '';
  if (fotosProjeto.length > 0) {
    galeriaHtml = `
      <div class="galeria-section">
        <h4>📸 Galeria de Fotos</h4>
        <div class="galeria-grid">
          ${fotosProjeto.map((img, index) => `<img src="${img}" alt="Foto do projeto" class="galeria-img" onclick="abrirGaleria(${index})">`).join('')}
        </div>
      </div>
    `;
  }
  
  // Montar comentários
  let comentariosHtml = '';
  const comentarios = projetoAtual.comentarios || [];
  
  comentariosHtml = `
    <div class="comentarios-section">
      <h4> Comentários (${comentarios.length})</h4>
      ${comentarios.length > 0 ? comentarios.map(com => `
        <div class="comentario-card">
          <div class="comentario-header">
            <div class="comentario-avatar">${escapeHtml(com.usuario.charAt(0))}</div>
            <span class="comentario-nome">${escapeHtml(com.usuario)}</span>
            <span class="comentario-data">${com.data || new Date().toLocaleDateString()}</span>
          </div>
          <div class="comentario-texto">${escapeHtml(com.texto)}</div>
        </div>
      `).join('') : '<p style="color: #888780; margin-bottom: 1rem;">Seja o primeiro a comentar este projeto!</p>'}
      <div class="form-comentario">
        <textarea id="novoComentario" placeholder="Deixe seu comentário..." rows="3"></textarea>
        <button class="btn-enviar" onclick="adicionarComentario(${projetoAtual.id})">Enviar comentário</button>
      </div>
    </div>
  `;
  
  const tags = projetoAtual.tags || [];
  const engenheiro = projetoAtual.engenheiro || { nome: 'Engenheiro', local: 'Moçambique', avatar: 'EN' };
  
  const html = `
    <div class="projeto-detalhes">
      <img class="projeto-imagem-principal" src="${imagemPrincipal}" alt="${escapeHtml(projetoAtual.titulo)}" onclick="abrirGaleria(0)" onerror="this.src='https://placehold.co/800x400/D85A30/FFFFFF?text=Imagem+não+disponível'">
      <div class="projeto-info">
        <span class="projeto-categoria">${escapeHtml(projetoAtual.categoria || 'Projeto')}</span>
        <h1 class="projeto-titulo">${escapeHtml(projetoAtual.titulo)}</h1>
        
        <div class="projeto-engenheiro">
          <div class="avatar-grande">${escapeHtml(engenheiro.avatar)}</div>
          <div class="eng-info">
            <h3>${escapeHtml(engenheiro.nome)}</h3>
            <div class="eng-local"><span class="dot-local"></span> ${escapeHtml(engenheiro.local)}</div>
          </div>
        </div>
        
        <div class="projeto-descricao">
          <h4>Sobre o projeto</h4>
          <p>${escapeHtml(projetoAtual.descricao)}</p>
        </div>
        
        <div class="projeto-tags">
          ${tags.map(tag => `<span class="tag-detalhe">${escapeHtml(tag)}</span>`).join('')}
        </div>
        
        <button class="btn-contato-contato" onclick="abrirModalContacto('${escapeHtml(engenheiro.nome)}')">
           Pedir contacto com o engenheiro
        </button>
      </div>
    </div>
    ${galeriaHtml}
    ${comentariosHtml}
  `;
  
  const container = document.getElementById('detalhesContainer');
  if (container) {
    container.innerHTML = html;
  } else {
    console.error('Container "detalhesContainer" não encontrado');
  }
}

// ── MOSTRAR ERRO ──
function mostrarErro(mensagem) {
  const container = document.getElementById('detalhesContainer');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem; background: white; border-radius: 20px;">
        <h2 style="color: #D85A30;">⚠️ ${mensagem}</h2>
        <p style="margin-top: 1rem;">O projeto que você procura não existe ou foi removido.</p>
        <button class="btn-voltar" onclick="voltarPagina()" style="margin-top: 1rem;">← Voltar para projetos</button>
      </div>
    `;
  }
}

// ── FUNÇÕES AUXILIARES ──
function voltarPagina() {
  window.location.href = 'index.html';
}

function atualizarContadorLightbox(indexAtual, total) {
  const counter = document.getElementById('lightboxCounter');
  if (!counter) return;
  counter.textContent = `${indexAtual + 1} / ${total}`;
}

function abrirGaleria(indiceImagem = 0) {
  if (!projetoAtual) return;

  const imagens = normalizarListaFotos(projetoAtual.galeria || [], projetoAtual.imagemPrincipal || projetoAtual.foto_capa || '');
  if (!imagens.length) return;

  const overlay = document.getElementById('lightboxOverlay');
  const track = document.getElementById('lightboxTrack');
  const prev = document.getElementById('lightboxPrev');
  const next = document.getElementById('lightboxNext');

  if (!overlay || !track || !prev || !next) return;

  track.innerHTML = imagens.map((img, index) => `
    <div class="lightbox-slide ${index === indiceImagem ? 'ativo' : ''}">
      <img src="${img}" alt="Foto ${index + 1} do projeto" onerror="this.src='https://placehold.co/1200x800/D85A30/FFFFFF?text=Imagem+não+disponível'">
    </div>
  `).join('');

  let indexAtual = Math.min(Math.max(indiceImagem, 0), imagens.length - 1);
  track.dataset.indice = String(indexAtual);

  const atualizarPosicao = () => {
    const slides = [...track.children];
    const slideAtivo = slides[indexAtual] || slides[0];
    if (slideAtivo) {
      track.dataset.indice = String(indexAtual);
      track.style.transform = `translateX(-${slideAtivo.offsetLeft}px)`;
      atualizarContadorLightbox(indexAtual, imagens.length);
    }
  };

  prev.onclick = () => {
    indexAtual = (indexAtual - 1 + imagens.length) % imagens.length;
    atualizarPosicao();
  };

  next.onclick = () => {
    indexAtual = (indexAtual + 1) % imagens.length;
    atualizarPosicao();
  };

  overlay.classList.add('aberto');
  overlay.setAttribute('aria-hidden', 'false');
  atualizarPosicao();
}

function fecharGaleria() {
  const overlay = document.getElementById('lightboxOverlay');
  if (overlay) {
    overlay.classList.remove('aberto');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function abrirImagemGrande(imgSrc) {
  if (!projetoAtual) return;
  const imagens = normalizarListaFotos(projetoAtual.galeria || [], projetoAtual.imagemPrincipal || projetoAtual.foto_capa || '');
  const index = imagens.findIndex(img => img === tratarCaminhoImagem(imgSrc));
  abrirGaleria(index >= 0 ? index : 0);
}

async function adicionarComentario(projetoId) {
  const comentario = document.getElementById('novoComentario')?.value.trim();
  if (!comentario) {
    mostrarToast("Por favor, escreva um comentário.");
    return;
  }
  
  const usuarioLogado = localStorage.getItem("usuarioLogado") || "Visitante";
  
  // Aqui você pode enviar o comentário para o backend
  console.log('Comentário adicionado:', { projetoId, usuario: usuarioLogado, texto: comentario });
  mostrarToast("Comentário adicionado com sucesso!");
  document.getElementById('novoComentario').value = '';
  
  // Recarregar página para mostrar novo comentário (simulação)
  setTimeout(() => {
    window.location.reload();
  }, 1000);
}

// ── MODAIS ──
function abrirModalContacto(engenheiro) {
  engenheiroAtual = engenheiro;
  const modal = document.getElementById("modalContacto");
  const modalTitulo = document.getElementById("modalTitulo");
  if (modalTitulo) modalTitulo.innerText = `Contactar: ${engenheiro}`;
  if (modal) modal.classList.add("aberto");
}

function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("aberto");
}

function enviarPedido() {
  const nome = document.getElementById("clienteNome")?.value.trim();
  const tel = document.getElementById("clienteTel")?.value.trim();
  if (!nome || !tel) {
    mostrarToast("Por favor preencha nome e telefone.");
    return;
  }
  fecharModal("modalContacto");
  mostrarToast(`Pedido de contacto enviado para ${engenheiroAtual}!`);
  const nomeInput = document.getElementById("clienteNome");
  const telInput = document.getElementById("clienteTel");
  if (nomeInput) nomeInput.value = '';
  if (telInput) telInput.value = '';
}

function mostrarToast(msg) {
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMensagem");
  if (toastMsg) toastMsg.innerText = msg;
  if (toast) toast.classList.add("visivel");
  setTimeout(() => {
    if (toast) toast.classList.remove("visivel");
  }, 4000);
}

// ── UTILITÁRIOS ──
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── AUTH ──
function atualizarWelcome() {
  const nome = localStorage.getItem("usuarioLogado");
  const bemVindo = document.getElementById("bemVindo");
  const menuAdmin = document.getElementById("menuAdmin");
  
  if (bemVindo) {
    bemVindo.innerText = nome ? `Bem-vindo, ${nome}` : `Bem-vindo, Visitante`;
  }
  if (menuAdmin) {
    menuAdmin.style.display = nome ? "list-item" : "none";
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
  
  localStorage.removeItem("usuarioLogado");
  localStorage.removeItem("authToken");
  localStorage.removeItem("role");
  window.location.href = "login.html";
}

// ── EVENTOS E INICIALIZAÇÃO ──
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM carregado - Inicializando detalhes.js');
  
  const lightboxOverlay = document.getElementById('lightboxOverlay');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxTrack = document.getElementById('lightboxTrack');
  if (lightboxOverlay) {
    lightboxOverlay.addEventListener('click', (event) => {
      if (event.target === lightboxOverlay) {
        fecharGaleria();
      }
    });
  }
  if (lightboxClose) {
    lightboxClose.addEventListener('click', fecharGaleria);
  }

  let touchStartX = 0;
  let touchStartY = 0;

  const iniciarSwipe = (event) => {
    const touch = event.touches ? event.touches[0] : event;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  };

  const finalizarSwipe = (event) => {
    if (!lightboxOverlay?.classList.contains('aberto')) return;
    const touch = event.changedTouches ? event.changedTouches[0] : event;
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY)) {
      const imagens = normalizarListaFotos(projetoAtual?.galeria || [], projetoAtual?.imagemPrincipal || projetoAtual?.foto_capa || '');
      if (imagens.length > 0) {
        const atual = Number(lightboxTrack?.dataset?.indice || 0);
        if (deltaX < 0) {
          abrirGaleria((atual + 1) % imagens.length);
        } else {
          abrirGaleria((atual - 1 + imagens.length) % imagens.length);
        }
      }
    }
  };

  if (lightboxTrack) {
    lightboxTrack.addEventListener('touchstart', iniciarSwipe, { passive: true });
    lightboxTrack.addEventListener('touchend', finalizarSwipe, { passive: true });
    lightboxTrack.addEventListener('pointerdown', iniciarSwipe);
    lightboxTrack.addEventListener('pointerup', finalizarSwipe);
  }

  document.addEventListener('keydown', (event) => {
    const overlayAberto = document.getElementById('lightboxOverlay')?.classList.contains('aberto');
    if (!overlayAberto) return;

    if (event.key === 'Escape') {
      fecharGaleria();
    }

    if (event.key === 'ArrowRight') {
      const imagens = normalizarListaFotos(projetoAtual?.galeria || [], projetoAtual?.imagemPrincipal || projetoAtual?.foto_capa || '');
      if (imagens.length > 0) {
        const atual = Number(document.getElementById('lightboxTrack')?.dataset?.indice || 0);
        abrirGaleria((atual + 1) % imagens.length);
      }
    }

    if (event.key === 'ArrowLeft') {
      const imagens = normalizarListaFotos(projetoAtual?.galeria || [], projetoAtual?.imagemPrincipal || projetoAtual?.foto_capa || '');
      if (imagens.length > 0) {
        const atual = Number(document.getElementById('lightboxTrack')?.dataset?.indice || 0);
        abrirGaleria((atual - 1 + imagens.length) % imagens.length);
      }
    }
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('aberto');
    });
  });
  
  atualizarWelcome();
  carregarProjeto();
});