//  OBRAVIA — cadastro.js
//  Gestão do formulário de cadastro de engenheiros

// Fechar modal
function fecharModal(id) {
  document.getElementById(id).classList.remove('aberto');
  document.getElementById(id).style.display = 'none';
}

// Abrir modal
function abrirModal(tipo) {
  const ids = { empresa: 'modalEmpresa', senior: 'modalSenior', junior: 'modalJunior' };
  const id = ids[tipo];
  if (!id) return;
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('aberto');
  }
}

// Fechar ao clicar fora
document.addEventListener('click', function(e) {
  ['modalEmpresa', 'modalSenior', 'modalJunior'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal && e.target === modal) {
      modal.style.display = 'none';
      modal.classList.remove('aberto');
    }
  });
});

// Upload preview
function setupUpload(inputId, areaId, nomeId) {
  const input = document.getElementById(inputId);
  const nome  = document.getElementById(nomeId);
  if (!input) return;
  input.addEventListener('change', function() {
    if (this.files[0]) {
      if (nome) nome.textContent = '✅ ' + this.files[0].name;
    }
  });
}

setupUpload('alvaraInput',         'uploadAlvara',         'alvaraNome');
setupUpload('nuitInput',           'uploadNuit',           'nuitNome');
setupUpload('diplomaInput',        'uploadDiploma',        'diplomaNome');
setupUpload('juniorDiplomaInput',  'uploadJuniorDiploma',  'juniorDiplomaNome');

// Mostrar toast
function mostrarToast(msg, erro) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = erro ? '#DC2626' : '#3B6D11';
  toast.classList.add('visivel');
  setTimeout(() => toast.classList.remove('visivel'), 4000);
}

// Enviar cadastro
async function enviarCadastro(tipo) {
  // Usar API_URL do config.js — com fallback robusto para produção
  let BASE;
  if (typeof API_URL !== 'undefined' && API_URL) {
    BASE = API_URL;
  } else {
    const host = window.location.hostname;
    BASE = (host === 'localhost' || host === '127.0.0.1')
      ? 'http://localhost:3000/api'
      : `${window.location.protocol}//${host}/api`;
  }

  let url, formData;

  if (tipo === 'empresa') {
    const nome     = document.getElementById('empresaNome')?.value.trim();
    const email    = document.getElementById('empresaEmail')?.value.trim();
    const senha    = document.getElementById('empresaSenha')?.value;
    const confirma = document.getElementById('empresaConfirmarSenha')?.value;
    const nuit     = document.getElementById('empresaNuit')?.value.trim();
    const resp     = document.getElementById('empresaResponsavel')?.value.trim();
    const bi       = document.getElementById('empresaBi')?.value.trim();

    if (!nome || !email || !senha || !nuit || !resp || !bi) {
      return mostrarToast('Por favor preencha todos os campos obrigatórios.', true);
    }
    if (senha !== confirma) {
      return mostrarToast('As senhas não coincidem.', true);
    }
    if (senha.length < 6) {
      return mostrarToast('A senha deve ter pelo menos 6 caracteres.', true);
    }

    url = `${BASE}/cadastro/empresa`;
    formData = new FormData();
    formData.append('nome_empresa', nome);
    formData.append('email', email);
    formData.append('senha', senha);
    formData.append('nuit', nuit);
    formData.append('responsavel', resp);
    formData.append('bi', bi);
    const alvara = document.getElementById('alvaraInput')?.files[0];
    const nuitDoc = document.getElementById('nuitInput')?.files[0];
    if (alvara)   formData.append('alvara', alvara);
    if (nuitDoc)  formData.append('nuit_comprovativo', nuitDoc);

  } else if (tipo === 'senior') {
    const nome     = document.getElementById('seniorNome')?.value.trim();
    const email    = document.getElementById('seniorEmail')?.value.trim();
    const senha    = document.getElementById('seniorSenha')?.value;
    const confirma = document.getElementById('seniorConfirmarSenha')?.value;
    const anos     = document.getElementById('seniorExperiencia')?.value;

    if (!nome || !email || !senha) {
      return mostrarToast('Por favor preencha todos os campos obrigatórios.', true);
    }
    if (senha !== confirma) {
      return mostrarToast('As senhas não coincidem.', true);
    }
    if (senha.length < 6) {
      return mostrarToast('A senha deve ter pelo menos 6 caracteres.', true);
    }

    url = `${BASE}/cadastro/senior`;
    formData = new FormData();
    formData.append('nome', nome);
    formData.append('email', email);
    formData.append('senha', senha);
    formData.append('anos_experiencia', anos || '');
    const diploma = document.getElementById('diplomaInput')?.files[0];
    if (diploma) formData.append('diploma', diploma);

  } else if (tipo === 'junior') {
    const nome     = document.getElementById('juniorNome')?.value.trim();
    const email    = document.getElementById('juniorEmail')?.value.trim();
    const senha    = document.getElementById('juniorSenha')?.value;
    const confirma = document.getElementById('juniorConfirmarSenha')?.value;
    const espec    = document.getElementById('juniorEspecializacao')?.value;
    const linkedin = document.getElementById('juniorLinkedin')?.value.trim();

    if (!nome || !email || !senha) {
      return mostrarToast('Por favor preencha todos os campos obrigatórios.', true);
    }
    if (senha !== confirma) {
      return mostrarToast('As senhas não coincidem.', true);
    }
    if (senha.length < 6) {
      return mostrarToast('A senha deve ter pelo menos 6 caracteres.', true);
    }

    url = `${BASE}/cadastro/junior`;
    formData = new FormData();
    formData.append('nome', nome);
    formData.append('email', email);
    formData.append('senha', senha);
    formData.append('especializacao', espec || '');
    formData.append('linkedin', linkedin || '');
    const diploma = document.getElementById('juniorDiplomaInput')?.files[0];
    if (diploma) formData.append('diploma', diploma);

  } else {
    return;
  }

  // Desabilitar botão
  const btn = document.querySelector(`#modal${tipo.charAt(0).toUpperCase() + tipo.slice(1)} .btn-submit`);
  if (btn) { btn.disabled = true; btn.textContent = 'A enviar...'; }

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: formData
      // Não definir Content-Type — o browser define automaticamente com boundary para FormData
    });

    const data = await res.json();

    if (res.ok) {
      // Fechar modal
      const modalId = { empresa: 'modalEmpresa', senior: 'modalSenior', junior: 'modalJunior' }[tipo];
      if (modalId) {
        document.getElementById(modalId).style.display = 'none';
        document.getElementById(modalId).classList.remove('aberto');
      }
      mostrarToast('✅ Cadastro enviado! Aguarde a aprovação do administrador OBRAVIA.');
    } else {
      mostrarToast(data.error || 'Erro ao enviar cadastro. Tente novamente.', true);
    }
  } catch (err) {
    console.error('Erro no cadastro:', err);
    mostrarToast('Não foi possível ligar ao servidor. Verifique a sua ligação.', true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Enviar para Verificação';
    }
  }
}