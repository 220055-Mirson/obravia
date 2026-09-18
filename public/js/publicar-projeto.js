// ── CONFIGURAÇÃO DA API ──
function getApiUrl() {
    // 1. Usa API_URL do config.js se disponível
    if (typeof API_URL !== 'undefined' && API_URL) return API_URL;
    // 2. Fallback automático por hostname
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3000/api';
    return window.location.protocol + '//' + window.location.host + '/api';
}

// ── VARIÁVEIS ──
let imagensSelecionadas = [];
let projetosDoEngenheiro = [];

// ── OBTER TOKEN DE AUTENTICAÇÃO ──
function getAuthToken() {
    return localStorage.getItem("token") || localStorage.getItem("authToken");
}

function getUsuarioLogado() {
    return localStorage.getItem("usuarioLogado");
}

// ── CARREGAR PROJETOS DO BACKEND ──
async function carregarProjetos() {
    const engenheiroLogado = getUsuarioLogado();
    const container = document.getElementById("meusProjetosGrid");
    
    if (!engenheiroLogado) {
        if (container) {
            container.innerHTML = `
                <div class="empty-projetos">
                    🔐 Faça login para ver seus projetos.<br>
                    <a href="index.html" style="color: var(--laranja);">Ir para página inicial</a>
                </div>
            `;
        }
        return;
    }

    try {
        await new Promise(r => setTimeout(r, 300));
        const response = await fetch(`${getApiUrl()}/meus-projetos`, {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (response.ok) {
            projetosDoEngenheiro = await response.json();
            atualizarListaProjetos();
        } else if (response.status === 401) {
            if (container) {
                container.innerHTML = `
                    <div class="empty-projetos">
                         Sessão expirada. Faça login novamente.<br>
                        <a href="index.html" style="color: var(--laranja);">Ir para página inicial</a>
                    </div>
                `;
            }
        } else {
            throw new Error('Erro ao carregar projetos');
        }
    } catch (error) {
        console.error('Erro:', error);
        if (container) {
            container.innerHTML = `
                <div class="empty-projetos">
                     Erro ao conectar com o servidor.<br>
                    Verifique se o backend está rodando.
                </div>
            `;
        }
    }
}

// ── ATUALIZAR LISTA DE PROJETOS ──
function atualizarListaProjetos() {
    const container = document.getElementById("meusProjetosGrid");
    const contador = document.getElementById("contadorProjetos");
    
    if (!container) return;
    
    if (contador) contador.textContent = projetosDoEngenheiro.length;
    
    if (projetosDoEngenheiro.length === 0) {
        container.innerHTML = `
            <div class="empty-projetos">
                 Nenhum projeto publicado ainda.<br>
                Preencha o formulário acima para começar!
            </div>
        `;
        return;
    }
    
    container.innerHTML = projetosDoEngenheiro.map(projeto => {
        // Tratar fotos (pode ser string JSON ou array)
        let fotoCapa = '';
        try {
            const fotos = typeof projeto.fotos === 'string' ? JSON.parse(projeto.fotos) : (projeto.fotos || []);
            fotoCapa = projeto.foto_capa || (fotos[0]) || 'https://placehold.co/400x200/D85A30/FFFFFF?text=OBRAVIA';
        } catch(e) {
            fotoCapa = 'https://placehold.co/400x200/D85A30/FFFFFF?text=OBRAVIA';
        }
        
        return `
            <div class="projeto-card">
                <img class="projeto-card-img" src="${fotoCapa}" alt="${escapeHtml(projeto.titulo)}">
                <div class="projeto-card-body">
                    <h3 class="projeto-card-title">${escapeHtml(projeto.titulo)}</h3>
                    <p class="projeto-card-desc">${escapeHtml(projeto.descricao.substring(0, 100))}${projeto.descricao.length > 100 ? '...' : ''}</p>
                    <div class="projeto-card-meta">
                        <span> ${projeto.categoria}</span>
                        <span> ${projeto.local || 'Moçambique'}</span>
                    </div>
                    <div class="card-actions">
                        <button class="btn-editar" onclick="abrirModalEditar(${projeto.id})"> Editar</button>
                        <button class="btn-excluir" onclick="excluirProjeto(${projeto.id})"> Excluir</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ── CRIAR PROJETO (PUBLICAR) ──
async function publicarProjeto(event) {
    event.preventDefault();
    
    const engenheiroLogado = getUsuarioLogado();
    if (!engenheiroLogado) {
        mostrarToast("Faça login para publicar projetos!", true);
        setTimeout(() => { window.location.href = "index.html"; }, 1500);
        return;
    }
    
    const titulo    = document.getElementById("projetoTitulo")?.value.trim() || '';
    const descricao = document.getElementById("projetoDescricao")?.value.trim() || '';
    const categoria = document.getElementById("projetoCategoria")?.value || 'Outros';
    const provincia = document.getElementById("projetoProvincia")?.value.trim() || '';
    const local     = document.getElementById("projetoLocal")?.value?.trim() || '';
    const tagsRaw   = document.getElementById("projetoTags")?.value.trim() || '';
    
    if (!titulo || !descricao) {
        mostrarToast("Preencha título e descrição do projeto!", true);
        return;
    }
    
    if (imagensSelecionadas.length === 0) {
        mostrarToast("Adicione pelo menos uma foto do projeto!", true);
        return;
    }
    
    const localFinal = provincia || local || '';

    // Preparar FormData para envio
    const formData = new FormData();
    formData.append('titulo', titulo);
    formData.append('descricao', descricao);
    formData.append('categoria', categoria);
    formData.append('local', localFinal);
    formData.append('tags', tagsRaw);
    
    // Adicionar imagens
    imagensSelecionadas.forEach((img) => {
        formData.append('fotos', img.file);
    });
    
    // Mostrar loading
    const btn = document.querySelector('#formProjeto button[type="submit"]');
    const originalText = btn ? btn.innerText : 'Publicar Projeto';
    if (btn) { btn.innerText = 'A publicar...'; btn.disabled = true; }
    
    try {
        // Pequeno delay para garantir config.js carregado
        await new Promise(r => setTimeout(r, 150));

        let response;
        try {
            response = await fetch(`${getApiUrl()}/projetos`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getAuthToken()}` },
                body: formData
            });
        } catch(netErr) {
            await new Promise(r => setTimeout(r, 600));
            response = await fetch(`${getApiUrl()}/projetos`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getAuthToken()}` },
                body: formData
            });
        }
        
        if (response.ok) {
            // Limpar formulário
            // Limpar form com protecção contra campos inexistentes
            const _clear = id => { const el = document.getElementById(id); if (el) el.value = ''; };
            _clear("projetoTitulo"); _clear("projetoDescricao"); _clear("projetoLocal");
            _clear("projetoTags"); _clear("projetoProvincia"); _clear("projetoCategoria");
            
            // Limpar imagens
            imagensSelecionadas.forEach(img => URL.revokeObjectURL(img.previewUrl));
            imagensSelecionadas = [];
            atualizarPreview();
            
            mostrarToast(" Projeto publicado com sucesso!");
            
            // Limpar campos restantes
            if (document.getElementById("projetoCategoria")) document.getElementById("projetoCategoria").value = "";
            if (document.getElementById("projetoProvincia")) document.getElementById("projetoProvincia").value = "";
            if (document.getElementById("projetoTags")) document.getElementById("projetoTags").value = "";
            if (document.getElementById("projetoTitulo")) document.getElementById("projetoTitulo").value = "";
            if (document.getElementById("projetoDescricao")) document.getElementById("projetoDescricao").value = "";

            // Recarregar lista imediatamente e depois novamente após 1.5s
            await carregarProjetos();
            setTimeout(() => carregarProjetos(), 1500);
            
            // Scroll para a lista de projectos
            const lista = document.querySelector(".lista-projetos") || document.querySelector(".projetos-container");
            if (lista) lista.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
            const error = await response.json();
            mostrarToast(error.error || "Erro ao publicar projeto", true);
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast("Erro de conexão com o servidor", true);
    } finally {
        if (btn) { btn.innerText = originalText; btn.disabled = false; }
        if (btn) { btn.innerText = originalText; btn.disabled = false; }
    }
}

// EDITAR PROJETO
async function abrirModalEditar(id) {
    const projeto = projetosDoEngenheiro.find(p => p.id === id);
    if (!projeto) return;
    
    document.getElementById("editId").value = projeto.id;
    document.getElementById("editTitulo").value = projeto.titulo;
    document.getElementById("editCategoria").value = projeto.categoria;

    const provSelect = document.getElementById("editProvincia");
    if (provSelect) {
        const valorLocal = projeto.local || '';
        provSelect.value = [...provSelect.options].some(opt => opt.value === valorLocal) ? valorLocal : '';
    }

    document.getElementById("editLocal").value = projeto.local || '';
    document.getElementById("editDescricao").value = projeto.descricao;
    
    // Tratar tags
    let tagsStr = '';
    try {
        if (typeof projeto.tags === 'string') {
            tagsStr = projeto.tags;
        } else if (Array.isArray(projeto.tags)) {
            tagsStr = projeto.tags.join(', ');
        }
    } catch(e) {
        tagsStr = '';
    }
    document.getElementById("editTags").value = tagsStr;
    
    document.getElementById("modalEditar").classList.add("aberto");
}

async function salvarEdicao(event) {
    event.preventDefault();
    
    const id = document.getElementById("editId").value;
    const provinciaEdit = document.getElementById("editProvincia") ? document.getElementById("editProvincia").value : '';
    const localEdit = document.getElementById("editLocal").value.trim();
    const dados = {
        titulo: document.getElementById("editTitulo").value,
        categoria: document.getElementById("editCategoria").value,
        local: provinciaEdit || localEdit || '',
        descricao: document.getElementById("editDescricao").value,
        tags: document.getElementById("editTags").value
    };
    
    try {
        const response = await fetch(`${getApiUrl()}/projetos/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(dados)
        });
        
        if (response.ok) {
            mostrarToast(" Projeto atualizado com sucesso!");
            fecharModal();
            carregarProjetos();
        } else {
            const error = await response.json();
            mostrarToast(error.error || "Erro ao atualizar", true);
        }
    } catch (error) {
        mostrarToast("Erro de conexão", true);
    }
}

// ── EXCLUIR PROJETO ──
async function excluirProjeto(id) {
    if (!confirm(" Tem certeza que deseja excluir este projeto permanentemente? Esta ação não pode ser desfeita!")) return;
    
    try {
        const response = await fetch(`${getApiUrl()}/projetos/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (response.ok) {
            mostrarToast(" Projeto excluído com sucesso!");
            carregarProjetos();
        } else {
            const error = await response.json();
            mostrarToast(error.error || "Erro ao excluir", true);
        }
    } catch (error) {
        mostrarToast("Erro de conexão", true);
    }
}

// UPLOAD DE IMAGENS 
function inicializarUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fotosInput = document.getElementById('fotosInput');
    const previewContainer = document.getElementById('previewContainer');
    
    if (!uploadArea || !fotosInput) {
        console.log('Elementos de upload não encontrados');
        return;
    }
    
    console.log('Inicializando upload...');
    
    uploadArea.addEventListener('click', () => {
        console.log('Área de upload clicada');
        fotosInput.click();
    });
    
    uploadArea.addEventListener('dragover', (e) => { 
        e.preventDefault(); 
        uploadArea.classList.add('dragover'); 
    });
    
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        console.log('Arquivos soltos:', files.length);
        adicionarImagens(files);
    });
    
    fotosInput.addEventListener('change', (e) => {
        console.log('Input de arquivo mudou, arquivos:', e.target.files.length);
        adicionarImagens(Array.from(e.target.files));
        fotosInput.value = '';
    });
}

function adicionarImagens(files) {
    if (!files || files.length === 0) return;
    
    console.log('Adicionando imagens:', files.length);
    
    files.forEach(file => {
        if (file.size > 10 * 1024 * 1024) {
            mostrarToast(`Imagem ${file.name} excede 10MB`, true);
            return;
        }
        const previewUrl = URL.createObjectURL(file);
        imagensSelecionadas.push({ file, previewUrl });
    });
    atualizarPreview();
}

function atualizarPreview() {
    const previewContainer = document.getElementById('previewContainer');
    if (!previewContainer) return;
    
    console.log('Atualizando preview, imagens:', imagensSelecionadas.length);
    
    previewContainer.innerHTML = imagensSelecionadas.map((img, index) => `
        <div class="preview-item">
            <img src="${img.previewUrl}" alt="Preview">
            <button class="remove-img" onclick="removerImagem(${index})">✕</button>
        </div>
    `).join('');
}

function removerImagem(index) {
    if (imagensSelecionadas[index]) {
        URL.revokeObjectURL(imagensSelecionadas[index].previewUrl);
        imagensSelecionadas.splice(index, 1);
        atualizarPreview();
    }
}

// UTILITÁRIOS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function fecharModal() {
    const modal = document.getElementById("modalEditar");
    if (modal) modal.classList.remove("aberto");
}

function mostrarToast(msg, isError = false) {
    const toast = document.getElementById("toast");
    const toastMsg = document.getElementById("toastMsg");
    
    if (!toast || !toastMsg) return;
    
    toastMsg.textContent = msg;
    toast.classList.add("visivel");
    if (isError) toast.classList.add("error");
    else toast.classList.remove("error");
    
    setTimeout(() => {
        toast.classList.remove("visivel");
        toast.classList.remove("error");
    }, 4000);
}

// AUTH
function atualizarWelcome() {
    const nome = getUsuarioLogado();
    const bemVindo = document.getElementById("bemVindo");
    if (bemVindo) {
        bemVindo.innerText = nome ? `Bem-vindo, ${nome}` : `Bem-vindo, Visitante`;
    }
}

function logout() {
    localStorage.removeItem("usuarioLogado");
    localStorage.removeItem("authToken");
    localStorage.removeItem("role");
    window.location.href = "index.html";
}

// ── VERIFICAR ACESSO ──
function verificarAcesso() {
    const token = getAuthToken();
    const usuario = getUsuarioLogado();
    
    console.log('Verificando acesso:', { token: !!token, usuario });
    
    // Só verifica se o usuário está logado (qualquer role)
    if (!token || !usuario) {
        mostrarToast("Faça login para acessar esta página!", true);
        setTimeout(() => {
            window.location.href = "index.html";
        }, 2000);
        return false;
    }
    
    console.log('Acesso permitido para:', usuario);
    return true;
}

// EVENTOS E INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM carregado - Inicializando página de projetos');
    
    // Verificar acesso antes de tudo
    if (!verificarAcesso()) return;
    
    const formProjeto = document.getElementById("formProjeto");
    const formEditar = document.getElementById("formEditar");
    
    if (formProjeto) {
        console.log('Formulário de projeto encontrado');
        formProjeto.addEventListener("submit", publicarProjeto);
    } else {
        console.log('Formulário de projeto NÃO encontrado');
    }
    
    if (formEditar) {
        formEditar.addEventListener("submit", salvarEdicao);
    }
    
    // Inicializar upload
    inicializarUpload();
    
    // Fechar modal ao clicar fora
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) this.classList.remove('aberto');
        });
    });
    
    atualizarWelcome();
    carregarProjetos();
});

// Tornar funções globais para o HTML
window.abrirModalEditar = abrirModalEditar;
window.excluirProjeto = excluirProjeto;
window.removerImagem = removerImagem;
window.fecharModal = fecharModal;
window.logout = logout;