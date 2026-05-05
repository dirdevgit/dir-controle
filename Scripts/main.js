if ('caches' in window) {
    caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyA5t1hamctvHaL9N0p93CT6922GsdgKySM",
    authDomain: "dir-controle.firebaseapp.com",
    databaseURL: "https://dir-controle-default-rtdb.firebaseio.com",
    projectId: "dir-controle",
    storageBucket: "dir-controle.firebasestorage.app",
    messagingSenderId: "234991247921",
    appId: "1:234991247921:web:a6e700075a5dc73eb02b10"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const GRUPOS = [
    { id: 9,   nome: 'Corregedoria', tag: 'COR', url: '/g9-corregedoria', chave: 'cor', isAdm: true },
    { id: 110, nome: 'Grupamento de Ações Táticas Especiais', tag: 'GATE', url: '/g110-grupamento-de-acoes-taticas-especiais', chave: 'gate', isAdm: true },
    { id: 721, nome: 'Procuradoria Militar de Justiça', tag: 'PMJ', url: '/g721-procuradoria-militar-de-justica', chave: 'pmj', isAdm: true },
    { id: 146, nome: 'Diretoria do Corpo Executivo', tag: 'DIR', url: '/g146-diretoria-do-corpo-executivo', chave: 'dir', isAdm: true },
    { id: 268, nome: '[CE] Especialização Intermediária', tag: 'EI', url: '/g268-ce-especializacao-intermediaria', chave: 'ei', isAdm: false },
];

const PRIORIDADE_CARGO = ['gate', 'cor', 'pmj', 'dir', 'ei'];

const TAG_ESTILOS = {
    cor:  { bg: '#1a1a1a', color: '#85e300', border: '#85e300' },
    gate: { bg: '#2a0a0a', color: '#8b0000', border: '#8b0000' },
    pmj:  { bg: '#2a2a2a', color: '#cccccc', border: '#888888' },
    dir:  { bg: '#1a1a1a', color: '#85e300', border: '#85e300' },
    ei:   { bg: '#2a1a00', color: '#ff8c00', border: '#ff8c00' },
};

let DADOS = {
    usuarios: [],
    relatorios: [],
    acompanhamentos: [],
    log_acoes: [],
    estatisticas: { total_usuarios: 0, total_relatorios: 0, usuarios_hoje: 0 },
    acessos_membros: {}
};

let USUARIO_ATUAL = '';
let CARGOS_USUARIO = [];
const PAGE_SIZE = 3;
const state = { posts: { page: 1, filter: '' }, info: { page: 1, filter: '' }, profile: { page: 1, user: '' } };
let unsubscribeFirebase = null;

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="ph ${type === 'success' ? 'ph-check-circle' : type === 'error' ? 'ph-x-circle' : 'ph-warning-circle'} toast-icon"></i>
        <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { if (container.contains(toast)) container.removeChild(toast); }, 300);
    }, 3000);
}

function gerarIdRelatorio() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'CE-';
    for (let i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return DADOS.relatorios.some(r => r.id === id) ? gerarIdRelatorio() : id;
}

function avatarUrl(user) {
    return `https://www.habbo.com.br/habbo-imaging/avatarimage?user=${encodeURIComponent(user)}&action=std,crr=65&direction=2&head_direction=3&img_format=png&gesture=sml&headonly=0&size=l`;
}

function avatarHeadUrl(user) {
    return `https://www.habbo.com.br/habbo-imaging/avatarimage?&user=${encodeURIComponent(user)}&action=std,crr=65&direction=2&head_direction=3&img_format=png&gesture=sml&headonly=1&size=l`;
}

function formatarData(dataString) {
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const data = new Date(dataString.replace(' ', 'T'));
    const dataBR = new Date(data.getTime() - 3 * 60 * 60 * 1000);
    const dia = String(dataBR.getDate()).padStart(2, '0');
    const mes = meses[dataBR.getMonth()];
    const ano = dataBR.getFullYear();
    const horas = String(dataBR.getHours()).padStart(2, '0');
    const minutos = String(dataBR.getMinutes()).padStart(2, '0');
    return `${dia} ${mes} ${ano} ${horas}:${minutos}h`;
}

function tempoRelativo(dataString) {
    if (!dataString) return 'nunca';
    const data = new Date(dataString.replace(' ', 'T'));
    const agora = new Date();
    const diff = Math.floor((agora - data) / 1000);
    if (diff < 60) return 'agora mesmo';
    if (diff < 3600) return `${Math.floor(diff/60)}min atrás`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h atrás`;
    if (diff < 86400 * 7) return `${Math.floor(diff/86400)}d atrás`;
    return formatarData(dataString);
}

function obterDadosIniciais() {
    return { usuarios: [], relatorios: [], acompanhamentos: [], log_acoes: [],
             estatisticas: { total_usuarios: 0, total_relatorios: 0, usuarios_hoje: 0 },
             acessos_membros: {} };
}

async function carregarDados() {
    try {
        const snapshot = await get(ref(db, 'dados_sistema'));
        if (snapshot.exists()) {
            DADOS = snapshot.val();
            if (!DADOS.usuarios) DADOS.usuarios = [];
            if (!DADOS.relatorios) DADOS.relatorios = [];
            if (!DADOS.acompanhamentos) DADOS.acompanhamentos = [];
            if (!DADOS.log_acoes) DADOS.log_acoes = [];
            if (!DADOS.estatisticas) DADOS.estatisticas = { total_usuarios: 0, total_relatorios: 0, usuarios_hoje: 0 };
            if (!DADOS.acessos_membros) DADOS.acessos_membros = {};
        } else {
            DADOS = obterDadosIniciais();
            await salvarDados();
        }
    } catch (erro) {
        console.error('Erro ao carregar dados:', erro);
        DADOS = obterDadosIniciais();
    }
    atualizarInterfaceAcesso();
    if (temAcesso()) {
        atualizarTodasInterfaces();
        renderAdminPanel();
    }
    return DADOS;
}

async function salvarDados() {
    try { await set(ref(db, 'dados_sistema'), DADOS); return true; }
    catch (erro) { console.error('Erro ao salvar:', erro); return false; }
}

function iniciarAtualizacaoEmTempoReal() {
    if (unsubscribeFirebase) unsubscribeFirebase();
    const dbRef = ref(db, 'dados_sistema');
    unsubscribeFirebase = onValue(dbRef, (snapshot) => {
        if (!snapshot.exists()) return;
        const novosDados = snapshot.val();
        if (JSON.stringify(DADOS) !== JSON.stringify(novosDados)) {
            DADOS = novosDados;
            if (!DADOS.usuarios) DADOS.usuarios = [];
            if (!DADOS.relatorios) DADOS.relatorios = [];
            if (!DADOS.acompanhamentos) DADOS.acompanhamentos = [];
            if (!DADOS.log_acoes) DADOS.log_acoes = [];
            if (!DADOS.acessos_membros) DADOS.acessos_membros = {};
            atualizarInterfaceAcesso();
            if (temAcesso()) {
                atualizarTodasInterfaces();
                if (!document.getElementById('admin-panel-page').classList.contains('hidden')) renderAdminPanel();
            }
        }
    });
}

async function pegarUsername() {
    try {
        const resposta = await fetch("/forum");
        const html = await resposta.text();
        const regex = /_userdata\["username"\]\s*=\s*"([^"]+)"/;
        const match = html.match(regex);
        return match && match[1] ? match[1].trim() : null;
    } catch { return null; }
}

async function verificarMembroGrupo(grupoUrl, username) {
    try {
        let start = 0;
        const porPagina = 50;
        while (true) {
            const url = start === 0 ? grupoUrl : `${grupoUrl}?start=${start}`;
            const resposta = await fetch(url);
            const html = await resposta.text();
            const doc = new DOMParser().parseFromString(html, "text/html");
            const linksMembros = [...doc.querySelectorAll('a[href*="/u"]')];
            const nomes = linksMembros.map(a => a.textContent.trim()).filter(Boolean);
            if (nomes.some(nome => nome.toLowerCase() === username.toLowerCase())) return true;
            const existeProxima = !!doc.querySelector(`a[href*="start=${start + porPagina}"]`);
            if (!existeProxima) return false;
            start += porPagina;
        }
    } catch { return false; }
}

async function detectarCargosUsuario(username) {
    if (!username) return [];
    const resultados = await Promise.all(
        GRUPOS.map(async g => {
            const isMembro = await verificarMembroGrupo(g.url, username);
            return isMembro ? g.chave : null;
        })
    );
    return resultados.filter(Boolean);
}

function temAcesso() { return CARGOS_USUARIO.length > 0; }

function isAdm() {
    return CARGOS_USUARIO.some(c => {
        const g = GRUPOS.find(g => g.chave === c);
        return g && g.isAdm;
    });
}

function getCargoPrincipal(cargos) {
    for (const p of PRIORIDADE_CARGO) { if (cargos.includes(p)) return p; }
    return null;
}

function renderTagsBadge(cargos) {
    return cargos.map(c => {
        const g = GRUPOS.find(g => g.chave === c);
        if (!g) return '';
        const est = TAG_ESTILOS[c] || {};
        return `<span class="role-badge" style="background:${est.bg};color:${est.color};border:1px solid ${est.border};font-size:9px;padding:2px 6px;border-radius:4px;margin-left:3px;">${g.tag}</span>`;
    }).join('');
}

async function registrarAcesso(username, cargos) {
    if (!username || cargos.length === 0) return;
    const agora = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const chaveSegura = username.replace(/[.#$[\]]/g, '_');
    const existente = DADOS.acessos_membros?.[chaveSegura];
    const ehPrimeiroLogin = !existente;

    DADOS.acessos_membros = DADOS.acessos_membros || {};
    DADOS.acessos_membros[chaveSegura] = {
        nick: username,
        cargos: cargos,
        ultimo_acesso: agora,
        primeiro_acesso: existente?.primeiro_acesso || agora,
        total_acessos: (existente?.total_acessos || 0) + 1
    };

    try {
        await update(ref(db, `dados_sistema/acessos_membros/${chaveSegura}`), DADOS.acessos_membros[chaveSegura]);
        if (ehPrimeiroLogin) {
            showToast(`Bem-vindo, ${username}! Primeiro acesso registrado.`, 'success');
        }
    } catch (e) { console.error('Erro ao registrar acesso:', e); }
}

function atualizarInterfaceAcesso() {
    const authOverlay = document.getElementById('auth-overlay');
    const mainContent = document.querySelector('.content');
    const identificandoOverlay = document.getElementById('identificando-overlay');
    identificandoOverlay.classList.add('hidden');

    let paginaAtual = '';
    ['dashboard-page','search-page','info-page','profile-page','admin-panel-page'].forEach(id => {
        if (!document.getElementById(id).classList.contains('hidden')) paginaAtual = id.replace('-page','');
    });

    if (!temAcesso()) {
        authOverlay.classList.remove('hidden');
        mainContent.classList.add('hidden');
        const messageEl = document.getElementById('auth-message');
        if (!USUARIO_ATUAL) {
            messageEl.textContent = 'Não foi possível detectar seu usuário. Faça login no fórum.';
            messageEl.classList.add('error');
        } else {
            messageEl.textContent = `Usuário identificado: ${USUARIO_ATUAL} — sem grupos com acesso.`;
            messageEl.classList.remove('error');
        }
        messageEl.style.display = 'block';
        return;
    }

    authOverlay.classList.add('hidden');
    mainContent.classList.remove('hidden');

    const menuAdmin = document.getElementById('menu-admin');
    const drawerAdmin = document.getElementById('drawer-menu-admin');
    const mobItemAdmin = document.getElementById('mobitem-admin');

    if (isAdm()) {
        menuAdmin?.classList.remove('hidden');
        drawerAdmin?.classList.remove('hidden');
        if (mobItemAdmin) {
            mobItemAdmin.style.display = 'flex';
            mobItemAdmin.classList.remove('hidden');
        }
    } else {
        menuAdmin?.classList.add('hidden');
        drawerAdmin?.classList.add('hidden');
        if (mobItemAdmin) mobItemAdmin.style.display = 'none';
        if (paginaAtual === 'admin') { switchPage('dashboard'); return; }
    }

    if (paginaAtual) {
        ['dashboard-page','search-page','info-page','profile-page','admin-panel-page'].forEach(id => document.getElementById(id).classList.add('hidden'));
        ['menu-dashboard','menu-search','menu-info','menu-admin'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });
        document.getElementById('drawer-menu-admin')?.classList.remove('active');

        const pageMap = {
            dashboard: ['dashboard-page','menu-dashboard','CONTROLE DE INFORMAÇÕES'],
            search:    ['search-page','menu-search','POSTAGENS'],
            info:      ['info-page','menu-info','INFORMAÇÕES'],
            profile:   ['profile-page', null, state.profile.user],
            admin:     ['admin-panel-page','menu-admin','PAINEL DE CONTROLE']
        };
        const m = pageMap[paginaAtual];
        if (m) {
            document.getElementById(m[0]).classList.remove('hidden');
            if (m[1]) document.getElementById(m[1])?.classList.add('active');
            setHeaderTitle(m[2]);
            if (['search-page','info-page','profile-page'].includes(m[0])) fixLayoutWidthToHeader(m[0]);
            if (paginaAtual === 'admin') document.getElementById('drawer-menu-admin')?.classList.add('active');
        }
    } else { switchPage('dashboard'); }

    atualizarPerfilInterface();
}

function atualizarPerfilInterface() {
    const principal = getCargoPrincipal(CARGOS_USUARIO);
    const tagsHtml = CARGOS_USUARIO.map(c => { const g = GRUPOS.find(g => g.chave === c); return g ? g.tag : ''; }).filter(Boolean).join('/');

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setSrc = (id, src) => { const el = document.getElementById(id); if (el) el.src = src; };
    const setClass = (id, cls) => { const el = document.getElementById(id); if (el) el.className = cls; };

    set('header-profile-name', USUARIO_ATUAL);
    set('drawer-profile-name', USUARIO_ATUAL);
    set('header-profile-role', tagsHtml || 'Membro');
    set('drawer-profile-role', tagsHtml || 'Membro');
    setClass('header-profile-role', 'profile-sub ' + (principal || ''));
    setClass('drawer-profile-role', 'profile-sub ' + (principal || ''));
    setSrc('header-profile-avatar', avatarUrl(USUARIO_ATUAL));
    setSrc('drawer-profile-avatar', avatarUrl(USUARIO_ATUAL));

    set('mob-menu-nick', USUARIO_ATUAL);
    set('mob-menu-role', tagsHtml || 'Membro');
    setSrc('mob-menu-avatar', avatarHeadUrl(USUARIO_ATUAL));
}

async function registrarExecutivo(nick, autor) {
    const existe = DADOS.usuarios.some(u => u.nick.toLowerCase() === nick.toLowerCase());
    if (existe) { showToast(`Executivo ${nick} já está registrado!`, 'warning'); return false; }
    DADOS.usuarios.push({ nick, status: "Acompanhado/Auxiliado", data_registro: new Date().toISOString().split('T')[0], registrado_por: autor, responsavel: autor });
    DADOS.log_acoes.push({ tipo: "registro_executivo", nick, responsavel: autor, data: new Date().toISOString().replace('T',' ').slice(0,19) });
    DADOS.estatisticas.total_usuarios = DADOS.usuarios.length;
    DADOS.estatisticas.usuarios_hoje = (DADOS.estatisticas.usuarios_hoje || 0) + 1;
    const sucesso = await salvarDados();
    if (sucesso) { showToast(`Executivo ${nick} registrado com sucesso!`); return true; }
    return false;
}

async function excluirExecutivo(nick, autor) {
    const confirmado = await modalConfirm(`Tem certeza que deseja excluir ${nick}?`);
    if (!confirmado) return false;
    const index = DADOS.usuarios.findIndex(u => u.nick.toLowerCase() === nick.toLowerCase());
    if (index === -1) { showToast(`Executivo ${nick} não encontrado!`, 'error'); return false; }
    DADOS.usuarios.splice(index, 1);
    DADOS.acompanhamentos = DADOS.acompanhamentos.filter(a => a.executivo.toLowerCase() !== nick.toLowerCase());
    DADOS.log_acoes.push({ tipo: "exclusao_executivo", nick, responsavel: autor, data: new Date().toISOString().replace('T',' ').slice(0,19) });
    DADOS.estatisticas.total_usuarios = DADOS.usuarios.length;
    const sucesso = await salvarDados();
    if (sucesso) { showToast(`Executivo ${nick} excluído!`); return true; }
    return false;
}

async function postarRelatorio(autor, alvo, texto, print_url) {
    const novoId = gerarIdRelatorio();
    DADOS.relatorios.unshift({ id: novoId, autor, alvo, texto, print: print_url || "", data: new Date().toISOString().replace('T',' ').slice(0,19) });
    DADOS.log_acoes.push({ tipo: "novo_relatorio", id: novoId, autor, alvo, responsavel: autor, data: new Date().toISOString().replace('T',' ').slice(0,19) });
    DADOS.estatisticas.total_relatorios = DADOS.relatorios.length;
    const usuarioExistente = DADOS.usuarios.find(u => u.nick.toLowerCase() === alvo.toLowerCase());
    if (!usuarioExistente) {
        DADOS.usuarios.push({ nick: alvo, status: "Acompanhado/Auxiliado", data_registro: new Date().toISOString().split('T')[0], registrado_por: autor, responsavel: autor });
        DADOS.log_acoes.push({ tipo: "registro_executivo", nick: alvo, responsavel: autor, data: new Date().toISOString().replace('T',' ').slice(0,19) });
        DADOS.estatisticas.total_usuarios = DADOS.usuarios.length;
        DADOS.estatisticas.usuarios_hoje = (DADOS.estatisticas.usuarios_hoje || 0) + 1;
        if (!DADOS.acompanhamentos.some(a => a.executivo.toLowerCase() === alvo.toLowerCase()))
            DADOS.acompanhamentos.push({ executivo: alvo, responsavel: autor, status: "ativo" });
    } else {
        if (!DADOS.acompanhamentos.some(a => a.executivo.toLowerCase() === alvo.toLowerCase())) {
            if (!usuarioExistente.responsavel) usuarioExistente.responsavel = autor;
            DADOS.acompanhamentos.push({ executivo: alvo, responsavel: usuarioExistente.responsavel, status: "ativo" });
            usuarioExistente.status = "Acompanhado/Auxiliado";
        }
    }
    const sucesso = await salvarDados();
    if (sucesso) { showToast(`Relatório ${novoId} postado!`); return true; }
    return false;
}

async function editarRelatorio(id, novoTexto, novoPrint) {
    const rel = DADOS.relatorios.find(r => r.id === id);
    if (!rel) { showToast('Relatório não encontrado!', 'error'); return false; }
    rel.texto = novoTexto; rel.print = novoPrint || rel.print;
    rel.editado_em = new Date().toISOString().replace('T',' ').slice(0,19); rel.editado_por = USUARIO_ATUAL;
    DADOS.log_acoes.push({ tipo: "edicao_relatorio", id, responsavel: USUARIO_ATUAL, data: new Date().toISOString().replace('T',' ').slice(0,19) });
    const sucesso = await salvarDados();
    if (sucesso) { showToast(`Relatório ${id} editado!`); return true; }
    return false;
}

async function excluirRelatorio(id) {
    const confirmado = await modalConfirm(`Excluir relatório ${id}?`);
    if (!confirmado) return false;
    const index = DADOS.relatorios.findIndex(r => r.id === id);
    if (index === -1) { showToast('Relatório não encontrado!', 'error'); return false; }
    DADOS.relatorios.splice(index, 1);
    DADOS.estatisticas.total_relatorios = DADOS.relatorios.length;
    DADOS.log_acoes.push({ tipo: "exclusao_relatorio", id, responsavel: USUARIO_ATUAL, data: new Date().toISOString().replace('T',' ').slice(0,19) });
    const sucesso = await salvarDados();
    if (sucesso) { showToast(`Relatório ${id} excluído!`); return true; }
    return false;
}

async function atualizarStatusExecutivo(nick, novoStatus, autor) {
    const usuario = DADOS.usuarios.find(u => u.nick.toLowerCase() === nick.toLowerCase());
    if (!usuario) { showToast(`Executivo ${nick} não encontrado!`, 'error'); return false; }
    if (!podeAlterarStatusExecutivo(nick)) { showToast(`Sem permissão para alterar o status de ${nick}.`, 'error'); return false; }
    const statusAnterior = usuario.status;
    usuario.status = novoStatus;
    DADOS.log_acoes.push({ tipo: "atualizacao_status", nick, status_anterior: statusAnterior, status_novo: novoStatus, responsavel: autor, data: new Date().toISOString().replace('T',' ').slice(0,19) });
    if (novoStatus === "Não tem interesse" || novoStatus === "Livre") {
        DADOS.acompanhamentos = DADOS.acompanhamentos.filter(a => a.executivo.toLowerCase() !== nick.toLowerCase());
        if (novoStatus === "Livre") usuario.responsavel = null;
    } else if (novoStatus === "Acompanhado/Auxiliado") {
        if (!DADOS.acompanhamentos.some(a => a.executivo.toLowerCase() === nick.toLowerCase())) {
            if (!usuario.responsavel) usuario.responsavel = autor;
            DADOS.acompanhamentos.push({ executivo: nick, responsavel: usuario.responsavel, status: "ativo" });
        }
    }
    const sucesso = await salvarDados();
    if (sucesso) { showToast(`Status de ${nick}: ${novoStatus}`); return true; }
    return false;
}

async function transferirResponsabilidade(nick, novoResponsavel, autor) {
    if (!isAdm()) { showToast('Apenas ADMs podem transferir!', 'error'); return false; }
    const usuario = DADOS.usuarios.find(u => u.nick.toLowerCase() === nick.toLowerCase());
    if (!usuario) { showToast(`Executivo ${nick} não encontrado!`, 'error'); return false; }
    const responsavelAnterior = usuario.responsavel || 'Ninguém';
    usuario.responsavel = novoResponsavel;
    const acompIdx = DADOS.acompanhamentos.findIndex(a => a.executivo.toLowerCase() === nick.toLowerCase());
    if (acompIdx !== -1) DADOS.acompanhamentos[acompIdx].responsavel = novoResponsavel;
    DADOS.log_acoes.push({ tipo: "transferencia_responsabilidade", nick, responsavel_anterior: responsavelAnterior, responsavel_novo: novoResponsavel, responsavel: autor, data: new Date().toISOString().replace('T',' ').slice(0,19) });
    const sucesso = await salvarDados();
    if (sucesso) { showToast(`Responsabilidade transferida para ${novoResponsavel}`); return true; }
    return false;
}

function podeAlterarStatusExecutivo(nick) {
    const usuario = DADOS.usuarios.find(u => u.nick.toLowerCase() === nick.toLowerCase());
    if (!usuario) return true;
    if (isAdm()) return true;
    return usuario.responsavel && usuario.responsavel.toLowerCase() === USUARIO_ATUAL.toLowerCase();
}

function atualizarTodasInterfaces() {
    renderRegistered(); renderFollowUps(); renderActions(); renderRanking(); renderStatistics();
    ['posts','info'].forEach(mode => { renderFeed(mode); renderPagination(mode); renderProfile(mode); });
    if (state.profile.user) { renderProfileSidebar(); renderProfileFeed(); renderProfilePagination(); }
    if (!document.getElementById('admin-panel-page').classList.contains('hidden')) renderAdminPanel();
}

function renderRegistered() {
    const tbody = document.getElementById('registered-body');
    if (!tbody) return;
    tbody.innerHTML = DADOS.usuarios.map(u => {
        let statusIcon = '', statusTooltip = '', statusClass = '';
        if (u.status === 'Livre') { statusIcon = 'ph ph-coffee'; statusTooltip = 'Livre'; statusClass = 'status-livre'; }
        else if (u.status === 'Acompanhado/Auxiliado') { statusIcon = 'ph ph-user-focus'; statusTooltip = 'Acompanhado/Auxiliado'; statusClass = 'status-acompanhado'; }
        else if (u.status === 'Não tem interesse') { statusIcon = 'ph ph-x'; statusTooltip = 'Não tem interesse'; statusClass = 'status-nao-tem-interesse'; }
        return `<tr>
            <td><div class="habbo-cell"><img src="${avatarHeadUrl(u.nick)}" /><span>${u.nick}</span></div></td>
            <td><div class="status-cell ${statusClass}" title="${statusTooltip}"><i class="${statusIcon}"></i></div></td>
            <td>${u.responsavel ? `<div class="habbo-cell"><img src="${avatarHeadUrl(u.responsavel)}" /><span>${u.responsavel}</span></div>` : '<span style="color:#888;font-style:italic;">-x-</span>'}</td>
        </tr>`;
    }).join('');
}

function renderFollowUps() {
    const tbody = document.getElementById('followups-body');
    if (!tbody) return;
    tbody.innerHTML = DADOS.acompanhamentos.map(f => `
        <tr>
            <td><div class="habbo-cell"><img src="${avatarHeadUrl(f.executivo)}" /><span>${f.executivo}</span></div></td>
            <td><div class="habbo-cell"><img src="${avatarHeadUrl(f.responsavel)}" /><span>${f.responsavel}</span></div></td>
        </tr>`).join('');
}

function renderActions() {
    const list = document.getElementById('action-list');
    if (!list) return;
    const ultimasAcoes = [...DADOS.log_acoes].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 3);
    list.innerHTML = ultimasAcoes.map(a => `
        <div class="action-item">
            <div class="action-avatar"><img src="${avatarHeadUrl(a.responsavel || a.autor || '')}" /></div>
            <div class="action-info">
                <span>${formatarLogAcao(a)}</span>
                <span class="action-time">${formatarData(a.data)}</span>
            </div>
        </div>`).join('');
}

function formatarLogAcao(log) {
    switch (log.tipo) {
        case 'registro_executivo': return `${log.responsavel} registrou ${log.nick}`;
        case 'exclusao_executivo': return `${log.responsavel} excluiu ${log.nick}`;
        case 'atualizacao_status': return `${log.responsavel} alterou status de ${log.nick}`;
        case 'novo_relatorio': return `${log.autor} postou ${log.id || ''} sobre ${log.alvo}`;
        case 'edicao_relatorio': return `${log.responsavel} editou ${log.id}`;
        case 'exclusao_relatorio': return `${log.responsavel} excluiu ${log.id}`;
        case 'transferencia_responsabilidade': return `${log.responsavel} transferiu ${log.nick} → ${log.responsavel_novo}`;
        default: return `Ação: ${log.tipo}`;
    }
}

function renderRanking() {
    const list = document.getElementById('ranking-list');
    if (!list) return;
    const ranking = {};
    DADOS.relatorios.forEach(r => { if (!ranking[r.autor]) ranking[r.autor] = 0; ranking[r.autor]++; });
    const rankingArray = Object.entries(ranking).map(([nick, count]) => ({ nick, count })).sort((a, b) => b.count - a.count).slice(0, 3);
    list.innerHTML = rankingArray.map((r, idx) => `
        <div class="ranking-item rank-${idx + 1}">
            <div class="ranking-pos">${idx + 1}º</div>
            <div class="habbo-cell"><img src="${avatarHeadUrl(r.nick)}" /><span>${r.nick} — ${r.count} posts</span></div>
        </div>`).join('');
    if (rankingArray.length === 0) list.innerHTML = '<div style="color:#888;text-align:center;padding:20px 0;">Sem dados.</div>';
}

function renderStatistics() {
    const hoje = new Date().toISOString().split('T')[0];
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('stats-infos',    DADOS.relatorios.filter(r => r.data.startsWith(hoje)).length);
    el('stats-registers', DADOS.usuarios.filter(u => u.data_registro === hoje).length);
    el('stats-updates', DADOS.log_acoes.filter(l => l.tipo === 'atualizacao_status' && l.data.startsWith(hoje)).length);
}

function renderAdminPanel() {
    if (!isAdm()) return;
    renderAdminPostagens();
    renderAdminUsuarios();
    renderAdminMembrosAcesso();
    renderAdminStatBar();
}

function renderAdminStatBar() {
    const hoje = new Date().toISOString().split('T')[0];
    const acessos = DADOS.acessos_membros || {};
    const acessosHoje = Object.values(acessos).filter(m => m.ultimo_acesso && m.ultimo_acesso.startsWith(hoje)).length;
    const totalMembros = Object.keys(acessos).length;
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('adm-stat-usuarios', DADOS.usuarios.length);
    el('adm-stat-relatorios', DADOS.relatorios.length);
    el('adm-stat-hoje', acessosHoje);
    el('adm-stat-membros', totalMembros);
}

function renderAdminMembrosAcesso() {
    const container = document.getElementById('admin-membros-acesso');
    if (!container) return;
    const acessos = DADOS.acessos_membros || {};
    const membros = Object.values(acessos).sort((a, b) => new Date(b.ultimo_acesso || 0) - new Date(a.ultimo_acesso || 0));
    if (membros.length === 0) {
        container.innerHTML = '<div style="color:#888;text-align:center;padding:20px 0;">Nenhum acesso registrado ainda.</div>';
        return;
    }
    const hoje = new Date().toISOString().split('T')[0];
    container.innerHTML = membros.map(m => {
        const eHoje = m.ultimo_acesso && m.ultimo_acesso.startsWith(hoje);
        const cargosHtml = (m.cargos || []).map(c => {
            const g = GRUPOS.find(g => g.chave === c);
            const est = TAG_ESTILOS[c] || {};
            return g ? `<span style="background:${est.bg};color:${est.color};border:1px solid ${est.border};font-size:8px;padding:1px 5px;border-radius:3px;">${g.tag}</span>` : '';
        }).join('');
        return `
        <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px;">
            <img src="${avatarHeadUrl(m.nick)}" style="width:28px;height:28px;border-radius:6px;flex-shrink:0;" />
            <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:700;display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                    ${m.nick} ${cargosHtml}
                </div>
                <div class="member-last-seen ${eHoje ? 'online' : ''}">${eHoje ? '● ' : ''}Último: ${tempoRelativo(m.ultimo_acesso)} · ${m.total_acessos || 1} acesso(s)</div>
            </div>
        </div>`;
    }).join('');
}

function renderAdminPostagens() {
    const container = document.getElementById('admin-postagens-list');
    if (!container) return;
    const relatorios = [...DADOS.relatorios].sort((a, b) => new Date(b.data) - new Date(a.data));
    const query = (document.getElementById('admin-search-postagens')?.value || '').toLowerCase();
    const filtrados = query ? relatorios.filter(r => r.id.toLowerCase().includes(query) || r.autor.toLowerCase().includes(query) || r.alvo.toLowerCase().includes(query)) : relatorios;
    if (filtrados.length === 0) { container.innerHTML = '<div style="color:#888;text-align:center;padding:20px 0;">Nenhum relatório encontrado.</div>'; return; }
    container.innerHTML = filtrados.map(r => `
        <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">
                <div>
                    <span style="font-size:10px;color:#85e300;font-weight:bold;">${r.id}</span>
                    <span style="font-size:10px;color:#888;margin-left:8px;">${formatarData(r.data)}</span>
                    ${r.editado_em ? `<span style="font-size:9px;color:#666;margin-left:6px;">(editado)</span>` : ''}
                </div>
                <div style="display:flex;gap:4px;">
                    <button onclick="window.abrirEdicaoRelatorio('${r.id}')" style="background:#2a2a2a;color:#85e300;border:1px solid #85e300;padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer;"><i class="ph ph-pencil"></i></button>
                    <button onclick="window.excluirRelatorio('${r.id}')" style="background:#2a0a0a;color:#ff4757;border:1px solid #ff4757;padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer;"><i class="ph ph-trash"></i></button>
                </div>
            </div>
            <div style="margin-top:6px;font-size:11px;color:#ccc;">
                <span style="color:#fff;font-weight:500;">${r.autor}</span>
                <span style="color:#888;"> → </span>
                <span style="color:#85e300;">${r.alvo}</span>
            </div>
            <div style="margin-top:4px;font-size:11px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.texto.slice(0,100)}${r.texto.length > 100 ? '...' : ''}</div>
        </div>`).join('');
}

function renderAdminUsuarios() {
    const usersList = document.getElementById('admin-users-list');
    if (!usersList) return;
    const query = (document.getElementById('admin-search-users')?.value || '').toLowerCase();
    const filtrados = query ? DADOS.usuarios.filter(u => u.nick.toLowerCase().includes(query)) : DADOS.usuarios;
    usersList.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:0 8px;">
            <div style="font-size:11px;color:#fff;">Total: <strong>${DADOS.usuarios.length}</strong></div>
        </div>
        <input id="admin-search-users" class="form-input" placeholder="Pesquisar nick..." style="width:100%;margin-bottom:12px;padding:8px 12px;background:#1f1f1f;border:1px solid #444;color:#fff;border-radius:6px;font-size:12px;" value="${query}" />
        ${filtrados.map(u => `
            <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <img src="${avatarHeadUrl(u.nick)}" style="width:24px;height:24px;border-radius:4px;" />
                        <div>
                            <div style="font-weight:bold;font-size:12px;">${u.nick}</div>
                            <div style="font-size:10px;color:#888;">Responsável: ${u.responsavel || '-x-'}</div>
                        </div>
                    </div>
                    <button onclick="window.abrirTransferenciaResponsavel('${u.nick}')" style="background:#1a2a0a;color:#85e300;border:1px solid #85e300;padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer;" title="Alterar responsável"><i class="ph ph-arrows-left-right"></i></button>
                </div>
            </div>`).join('')}`;
    if (filtrados.length === 0) usersList.innerHTML += '<div style="color:#888;text-align:center;padding:20px 0;">Nenhum executivo encontrado.</div>';
    document.getElementById('admin-search-users')?.addEventListener('input', () => renderAdminUsuarios());
}

function getFilteredData(mode) {
    const f = state[mode].filter.trim().toLowerCase();
    if (!f) return [];
    return mode === 'posts' ? DADOS.relatorios.filter(i => i.autor.toLowerCase() === f) : DADOS.relatorios.filter(i => i.alvo.toLowerCase() === f);
}

function isSearching(mode) { return state[mode].filter.trim().length > 0; }

function renderProfile(mode) {
    const filtered = getFilteredData(mode);
    const countEl = document.getElementById(`profile-info-count-${mode}`);
    const avatarEl = document.getElementById(`profile-avatar-${mode}`);
    const placeholderEl = document.getElementById(`profile-placeholder-${mode}`);
    const feedListEl = document.getElementById(`feed-list-${mode}`);
    if (!isSearching(mode) || filtered.length === 0) {
        countEl.textContent = 'Nenhuma informação encontrada.';
        avatarEl.classList.add('hidden');
        placeholderEl.style.display = 'flex';
        if (feedListEl) feedListEl.innerHTML = '<div style="color:#888;text-align:center;padding:32px 0;">Nenhuma informação encontrada.</div>';
    } else {
        countEl.textContent = `${filtered.length} informação(ões) disponível(eis)`;
        const userForAvatar = state[mode].filter || (mode === 'posts' ? filtered[0].autor : filtered[0].alvo);
        avatarEl.src = avatarUrl(userForAvatar);
        avatarEl.classList.remove('hidden');
        placeholderEl.style.display = 'none';
    }
}

function renderFeed(mode) {
    const listEl = document.getElementById(`feed-list-${mode}`);
    const data = getFilteredData(mode);
    if (!isSearching(mode) || data.length === 0) { listEl.innerHTML = ''; return; }
    const page = state[mode].page;
    const start = (page - 1) * PAGE_SIZE;
    const items = data.slice(start, start + PAGE_SIZE);
    listEl.innerHTML = items.map(item => {
        const avatarUser = mode === 'posts' ? item.alvo : item.autor;
        const headerName = mode === 'posts' ? item.alvo : item.autor;
        const MAX_CHARS = 350;
        let texto = item.texto;
        let showReadMore = false;
        if (texto.length > MAX_CHARS) { texto = texto.slice(0, MAX_CHARS) + '...'; showReadMore = true; }
        const editadoLabel = item.editado_em ? `<span style="font-size:9px;color:#888;margin-left:8px;">(editado)</span>` : '';
        const acoesAdm = isAdm() ? `
            <div style="display:flex;gap:6px;margin-top:8px;">
                <button onclick="window.abrirEdicaoRelatorio('${item.id}')" style="background:#2a2a2a;color:#85e300;border:1px solid #85e300;padding:3px 10px;border-radius:4px;font-size:10px;cursor:pointer;"><i class="ph ph-pencil"></i> Editar</button>
                <button onclick="window.excluirRelatorio('${item.id}')" style="background:#2a0a0a;color:#ff4757;border:1px solid #ff4757;padding:3px 10px;border-radius:4px;font-size:10px;cursor:pointer;"><i class="ph ph-trash"></i> Excluir</button>
            </div>` : '';
        return `
            <div class="feed-item">
                <div class="feed-header-badge">${headerName} - ${formatarData(item.data)} <span style="font-size:9px;color:#85e300;margin-left:6px;">${item.id}</span>${editadoLabel}</div>
                <div class="feed-content-card">
                    <div class="feed-avatar-box"><img src="${avatarUrl(avatarUser)}" alt="Avatar"></div>
                    <div class="feed-content">
                        <p>${texto}</p>
                        ${showReadMore ? `<button class='ler-mais-btn' onclick='this.previousElementSibling.textContent = ${JSON.stringify(item.texto)}; this.style.display = "none";'>Ler mais</button>` : ''}
                        ${item.print ? `<p>Print: <a href="${item.print}" style="color:#7CFF9B;" target="_blank" rel="noopener noreferrer">Clique aqui</a></p>` : ''}
                        ${acoesAdm}
                    </div>
                </div>
            </div>`;
    }).join('');
}

function renderPagination(mode) {
    const pagEl = document.getElementById(`pagination-${mode}`);
    const total = getFilteredData(mode).length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (!isSearching(mode) || totalPages === 0) { pagEl.innerHTML = ''; return; }
    state[mode].page = Math.min(Math.max(state[mode].page, 1), totalPages);
    const cur = state[mode].page;
    const start = Math.max(1, Math.min(cur - 1, totalPages - 2));
    const pages = [];
    for (let i = start; i <= Math.min(totalPages, start + 2); i++) pages.push(i);
    let html = `<button class="page-btn" data-prev="true"><i class="ph ph-caret-left"></i></button>`;
    pages.forEach(i => { html += `<button class="page-btn ${i === cur ? 'active' : ''}" data-page="${i}">${String(i).padStart(2,'0')}</button>`; });
    html += `<button class="page-btn" data-next="true"><i class="ph ph-caret-right"></i></button>`;
    pagEl.innerHTML = html;
    pagEl.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('data-prev')) state[mode].page = Math.max(1, cur - 1);
            else if (btn.getAttribute('data-next')) state[mode].page = Math.min(totalPages, cur + 1);
            else state[mode].page = Math.min(Math.max(parseInt(btn.getAttribute('data-page'), 10), 1), totalPages);
            renderFeed(mode); renderPagination(mode); renderProfile(mode);
        });
    });
}

function getProfileData() {
    if (!state.profile.user) return [];
    const u = state.profile.user.toLowerCase();
    return DADOS.relatorios.filter(i => i.autor.toLowerCase() === u);
}

function renderProfileSidebar() {
    const user = state.profile.user;
    const avatarEl = document.getElementById('profile-avatar-profile');
    const nickEl = document.getElementById('profile-nick-display');
    const countEl = document.getElementById('profile-info-count-profile');
    if (!user) { nickEl.textContent = ''; avatarEl.src = ''; countEl.textContent = '0 informação(ões) disponível(eis)'; return; }
    nickEl.innerHTML = user;
    avatarEl.src = avatarUrl(user);
    countEl.textContent = `${getProfileData().length} informação(ões) disponível(eis)`;
}

function renderProfileFeed() {
    const listEl = document.getElementById('feed-list-profile');
    const data = getProfileData();
    if (!state.profile.user || data.length === 0) { listEl.innerHTML = ''; return; }
    const page = state.profile.page;
    const start = (page - 1) * PAGE_SIZE;
    const items = data.slice(start, start + PAGE_SIZE);
    listEl.innerHTML = items.map(item => {
        const MAX_CHARS = 350;
        let texto = item.texto;
        let showReadMore = false;
        if (texto.length > MAX_CHARS) { texto = texto.slice(0, MAX_CHARS) + '...'; showReadMore = true; }
        const editadoLabel = item.editado_em ? `<span style="font-size:9px;color:#888;margin-left:8px;">(editado)</span>` : '';
        const acoesAdm = isAdm() ? `
            <div style="display:flex;gap:6px;margin-top:8px;">
                <button onclick="window.abrirEdicaoRelatorio('${item.id}')" style="background:#2a2a2a;color:#85e300;border:1px solid #85e300;padding:3px 10px;border-radius:4px;font-size:10px;cursor:pointer;"><i class="ph ph-pencil"></i> Editar</button>
                <button onclick="window.excluirRelatorio('${item.id}')" style="background:#2a0a0a;color:#ff4757;border:1px solid #ff4757;padding:3px 10px;border-radius:4px;font-size:10px;cursor:pointer;"><i class="ph ph-trash"></i> Excluir</button>
            </div>` : '';
        return `
            <div class="feed-item">
                <div class="feed-header-badge">${item.alvo} - ${formatarData(item.data)} <span style="font-size:9px;color:#85e300;margin-left:6px;">${item.id}</span>${editadoLabel}</div>
                <div class="feed-content-card">
                    <div class="feed-avatar-box"><img src="${avatarUrl(item.alvo)}" alt="Avatar"></div>
                    <div class="feed-content">
                        <p>${texto}</p>
                        ${showReadMore ? `<button class='ler-mais-btn' onclick='this.previousElementSibling.textContent = ${JSON.stringify(item.texto)}; this.style.display = "none";'>Ler mais</button>` : ''}
                        ${item.print ? `<p>Print: <a href="${item.print}" style="color:#7CFF9B;" target="_blank" rel="noopener noreferrer">Clique aqui</a></p>` : ''}
                        ${acoesAdm}
                    </div>
                </div>
            </div>`;
    }).join('');
}

function renderProfilePagination() {
    const pagEl = document.getElementById('pagination-profile');
    const total = getProfileData().length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (!state.profile.user || totalPages === 0) { pagEl.innerHTML = ''; return; }
    state.profile.page = Math.min(Math.max(state.profile.page, 1), totalPages);
    const cur = state.profile.page;
    const start = Math.max(1, Math.min(cur - 1, totalPages - 2));
    const pages = [];
    for (let i = start; i <= Math.min(totalPages, start + 2); i++) pages.push(i);
    let html = `<button class="page-btn" data-prev="true"><i class="ph ph-caret-left"></i></button>`;
    pages.forEach(i => { html += `<button class="page-btn ${i === cur ? 'active' : ''}" data-page="${i}">${String(i).padStart(2,'0')}</button>`; });
    html += `<button class="page-btn" data-next="true"><i class="ph ph-caret-right"></i></button>`;
    pagEl.innerHTML = html;
    pagEl.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('data-prev')) state.profile.page = Math.max(1, cur - 1);
            else if (btn.getAttribute('data-next')) state.profile.page = Math.min(totalPages, cur + 1);
            else state.profile.page = Math.min(Math.max(parseInt(btn.getAttribute('data-page'), 10), 1), totalPages);
            renderProfileFeed(); renderProfilePagination(); renderProfileSidebar();
        });
    });
}

function modalConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.display = 'flex';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">CONFIRMAÇÃO</div>
                <div class="modal-body">${message}</div>
                <div class="modal-actions">
                    <button id="confirm-cancel" class="btn">Cancelar</button>
                    <button id="confirm-ok" class="btn btn-primary">Confirmar</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#confirm-cancel').onclick = () => { document.body.removeChild(overlay); resolve(false); };
        overlay.querySelector('#confirm-ok').onclick = () => { document.body.removeChild(overlay); resolve(true); };
    });
}

function openModal(type, extra = null) {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    const submitEl = document.getElementById('modal-submit');
    submitEl.onclick = null;

    if (type === 'new-executive') {
        titleEl.textContent = 'REGISTRAR/EXCLUIR EXECUTIVO';
        bodyEl.innerHTML = `
            <div class="form-row"><div class="form-label">NICK DO EXECUTIVO</div><input id="exec-nick" class="form-input" placeholder="NICKNAME"></div>
            <div class="form-row"><div class="form-label">AÇÃO</div>
                <select id="exec-ops" class="form-select">
                    <option value="register">Registrar</option>
                    <option value="delete">Excluir</option>
                </select>
            </div>`;
        submitEl.onclick = async () => {
            const nick = document.getElementById('exec-nick').value.trim();
            const op = document.getElementById('exec-ops').value;
            if (!nick) { showToast('Por favor, insira um nick!', 'warning'); return; }
            if (op === 'register') await registrarExecutivo(nick, USUARIO_ATUAL);
            else await excluirExecutivo(nick, USUARIO_ATUAL);
            closeModal(); atualizarTodasInterfaces();
        };

    } else if (type === 'post-report') {
        titleEl.textContent = 'POSTAR RELATÓRIO';
        bodyEl.innerHTML = `
            <div class="form-row"><div class="form-label">AUTOR</div><input id="rep-author" class="form-input" value="${state.profile.user || USUARIO_ATUAL}" placeholder="Autor"></div>
            <div class="form-row"><div class="form-label">EXECUTIVO</div><input id="rep-target" class="form-input" placeholder="Nick do executivo"></div>
            <div id="rep-print-controls" class="form-row"><div class="form-label">PRINT</div><button type="button" id="add-print-btn" class="btn">Adicionar print?</button></div>
            <div id="rep-print-row" class="form-row hidden">
                <div class="form-label">PRINT URL</div>
                <input id="rep-print" class="form-input" placeholder="https://i.imgur.com/...">
                <button type="button" id="remove-print-btn" class="btn" title="Remover">×</button>
            </div>
            <div class="form-row"><div class="form-label">DETALHES</div><textarea id="rep-text" class="form-textarea" placeholder="Descreva o que aconteceu..." rows="4"></textarea></div>`;
        document.getElementById('add-print-btn').onclick = () => {
            document.getElementById('rep-print-row').classList.remove('hidden');
            document.getElementById('rep-print-controls').classList.add('hidden');
        };
        document.getElementById('remove-print-btn').onclick = () => {
            document.getElementById('rep-print-row').classList.add('hidden');
            document.getElementById('rep-print-controls').classList.remove('hidden');
            document.getElementById('rep-print').value = '';
        };
        submitEl.onclick = async () => {
            const author = document.getElementById('rep-author').value.trim();
            const target = document.getElementById('rep-target').value.trim();
            const text = document.getElementById('rep-text').value.trim();
            const print = document.getElementById('rep-print')?.value.trim() || '';
            if (!author || !target || !text) { showToast('Preencha autor, executivo e texto!', 'warning'); return; }
            await postarRelatorio(author, target, text, print);
            closeModal(); atualizarTodasInterfaces();
        };

    } else if (type === 'editar-relatorio') {
        const rel = extra;
        titleEl.textContent = `EDITAR RELATÓRIO ${rel.id}`;
        bodyEl.innerHTML = `
            <div style="font-size:11px;color:#888;margin-bottom:8px;">ID: <strong style="color:#85e300;">${rel.id}</strong> | Autor: ${rel.autor} → ${rel.alvo}</div>
            <div class="form-row"><div class="form-label">TEXTO</div><textarea id="edit-texto" class="form-textarea" rows="5">${rel.texto}</textarea></div>
            <div class="form-row"><div class="form-label">PRINT URL</div><input id="edit-print" class="form-input" value="${rel.print || ''}" placeholder="https://i.imgur.com/..."></div>`;
        submitEl.onclick = async () => {
            const novoTexto = document.getElementById('edit-texto').value.trim();
            const novoPrint = document.getElementById('edit-print').value.trim();
            if (!novoTexto) { showToast('O texto não pode ficar vazio!', 'warning'); return; }
            await editarRelatorio(rel.id, novoTexto, novoPrint);
            closeModal(); atualizarTodasInterfaces();
        };

    } else if (type === 'update-info') {
        titleEl.textContent = 'ATUALIZAR INFORMAÇÕES';
        bodyEl.innerHTML = `
            <div class="form-row"><div class="form-label">NICK DO EXECUTIVO</div>
                <div class="autocomplete-container">
                    <input id="upd-nick" class="form-input" placeholder="Digite o nickname..." autocomplete="off">
                    <div id="autocomplete-list-upd" class="autocomplete-list"></div>
                </div>
            </div>
            <div class="form-row"><div class="form-label">NOVO STATUS</div>
                <select id="upd-status" class="form-select">
                    <option value="Livre">Livre</option>
                    <option value="Acompanhado/Auxiliado">Acompanhado/Auxiliado</option>
                    <option value="Não tem interesse">Não tem interesse</option>
                </select>
            </div>
            <div id="responsavel-info" class="form-row hidden" style="background:rgba(255,193,7,0.1);border-radius:6px;padding:8px;margin-top:8px;font-size:11px;">
                <i class="ph ph-warning" style="color:#ffc107;margin-right:6px;"></i>
                <span>Responsável: <span id="responsavel-nome">N/A</span></span>
            </div>`;
        const nickInput = document.getElementById('upd-nick');
        const autocompleteList = document.getElementById('autocomplete-list-upd');
        const responsavelInfo = document.getElementById('responsavel-info');
        nickInput.addEventListener('input', function () {
            const query = this.value.toLowerCase();
            autocompleteList.innerHTML = '';
            responsavelInfo.classList.add('hidden');
            if (query.length < 1) { autocompleteList.style.display = 'none'; return; }
            const filtered = DADOS.usuarios.filter(u => u.nick.toLowerCase().includes(query)).slice(0, 8);
            if (filtered.length === 0) { autocompleteList.style.display = 'none'; return; }
            filtered.forEach(user => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.innerHTML = `${user.nick}${user.responsavel ? `<span style="color:#888;font-size:10px;"> (${user.responsavel})</span>` : ''}`;
                item.onclick = () => {
                    nickInput.value = user.nick;
                    autocompleteList.style.display = 'none';
                    if (user.responsavel) { document.getElementById('responsavel-nome').textContent = user.responsavel; responsavelInfo.classList.remove('hidden'); }
                };
                autocompleteList.appendChild(item);
            });
            autocompleteList.style.display = 'block';
        });
        document.addEventListener('click', function closeFn(e) {
            if (!nickInput.contains(e.target) && !autocompleteList.contains(e.target)) autocompleteList.style.display = 'none';
        });
        submitEl.onclick = async () => {
            const nick = document.getElementById('upd-nick').value.trim();
            const status = document.getElementById('upd-status').value;
            if (!nick) { showToast('Por favor, insira um nick!', 'warning'); return; }
            await atualizarStatusExecutivo(nick, status, USUARIO_ATUAL);
            closeModal(); atualizarTodasInterfaces();
        };

    } else if (type === 'manage-roles') {
        titleEl.textContent = 'GERENCIAR CARGOS';
        bodyEl.innerHTML = `
            <div style="background:rgba(133,227,0,0.1);border-radius:6px;padding:10px;font-size:12px;color:#ccc;margin-bottom:10px;">
                <i class="ph ph-info" style="color:#85e300;margin-right:6px;"></i>
                Os cargos são detectados automaticamente pelos grupos do fórum.
            </div>
            <div style="font-size:12px;color:#888;">Grupos com acesso:</div>
            <div style="margin-top:8px;">
                ${GRUPOS.map(g => `<div style="padding:4px 0;font-size:12px;color:#ccc;"><span style="color:#85e300;font-weight:bold;">${g.tag}</span> — ${g.nome} ${g.isAdm ? '<span style="color:#85e300;font-size:10px;">(ADM)</span>' : '<span style="color:#ff8c00;font-size:10px;">(Leitura)</span>'}</div>`).join('')}
            </div>`;
        submitEl.style.display = 'none';

    } else if (type === 'transferir-responsabilidade') {
        const nickPre = extra?.nick || '';
        titleEl.textContent = 'ALTERAR RESPONSÁVEL';
        bodyEl.innerHTML = `
            <div class="form-row"><div class="form-label">EXECUTIVO</div>
                <div class="autocomplete-container">
                    <input id="transfer-executivo" class="form-input" placeholder="Nick do executivo..." autocomplete="off" value="${nickPre}">
                    <div id="autocomplete-list-executivo" class="autocomplete-list"></div>
                </div>
            </div>
            <div class="form-row"><div class="form-label">RESPONSÁVEL ATUAL</div>
                <div id="responsavel-atual" style="padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;font-size:12px;color:#ccc;">
                    ${nickPre ? (DADOS.usuarios.find(u => u.nick.toLowerCase() === nickPre.toLowerCase())?.responsavel || 'Nenhum') : 'Selecione um executivo'}
                </div>
            </div>
            <div class="form-row"><div class="form-label">NOVO RESPONSÁVEL</div>
                <input id="transfer-novo" class="form-input" placeholder="Nick do novo responsável...">
            </div>`;
        const executivoInput = document.getElementById('transfer-executivo');
        const autocompleteExecutivo = document.getElementById('autocomplete-list-executivo');
        const responsavelAtualEl = document.getElementById('responsavel-atual');
        executivoInput.addEventListener('input', function () {
            const query = this.value.toLowerCase();
            autocompleteExecutivo.innerHTML = '';
            if (query.length < 1) { autocompleteExecutivo.style.display = 'none'; return; }
            const filtered = DADOS.usuarios.filter(u => u.nick.toLowerCase().includes(query)).slice(0, 8);
            filtered.forEach(user => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.textContent = user.nick;
                item.onclick = () => { executivoInput.value = user.nick; autocompleteExecutivo.style.display = 'none'; responsavelAtualEl.textContent = user.responsavel || 'Nenhum'; };
                autocompleteExecutivo.appendChild(item);
            });
            autocompleteExecutivo.style.display = filtered.length > 0 ? 'block' : 'none';
        });
        submitEl.onclick = async () => {
            const executivo = executivoInput.value.trim();
            const novoResponsavel = document.getElementById('transfer-novo').value.trim();
            if (!executivo) { showToast('Selecione um executivo!', 'warning'); return; }
            if (!novoResponsavel) { showToast('Insira o novo responsável!', 'warning'); return; }
            await transferirResponsabilidade(executivo, novoResponsavel, USUARIO_ATUAL);
            closeModal(); atualizarTodasInterfaces();
        };
    }

    submitEl.style.display = type === 'manage-roles' ? 'none' : '';
    overlay.style.display = 'flex';
    document.getElementById('modal-cancel').onclick = closeModal;
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    document.getElementById('modal-submit').style.display = '';
}

function switchPage(pageId) {
    ['dashboard-page','search-page','info-page','profile-page','admin-panel-page'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['menu-dashboard','menu-search','menu-info','menu-admin'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });
    document.getElementById('drawer-menu-admin')?.classList.remove('active');
    document.getElementById('header-profile-card')?.classList.remove('active');

    if (pageId === 'dashboard') {
        document.getElementById('dashboard-page').classList.remove('hidden');
        document.getElementById('menu-dashboard')?.classList.add('active');
        setHeaderTitle('CONTROLE DE INFORMAÇÕES');
    } else if (pageId === 'search') {
        document.getElementById('search-page').classList.remove('hidden');
        fixLayoutWidthToHeader('search-page');
        document.getElementById('menu-search')?.classList.add('active');
        setHeaderTitle('POSTAGENS');
    } else if (pageId === 'info') {
        document.getElementById('info-page').classList.remove('hidden');
        fixLayoutWidthToHeader('info-page');
        document.getElementById('menu-info')?.classList.add('active');
        setHeaderTitle('INFORMAÇÕES');
    }

    ['dashboard','search','info','admin'].forEach(id =>
        document.getElementById('mobitem-' + id)?.classList.remove('active'));
    document.getElementById('mobitem-' + pageId)?.classList.add('active');
    const titles = { dashboard: 'CONTROLE DE INFORMAÇÕES', search: 'POSTAGENS', info: 'INFORMAÇÕES' };
    const titleEl = document.getElementById('mob-topbar-title');
    if (titleEl) titleEl.textContent = titles[pageId] || '';
}

function setHeaderTitle(text) {
    const el = document.getElementById('header-title');
    if (el) el.textContent = text;
}

function openProfile(user) {
    state.profile.user = user;
    state.profile.page = 1;
    ['dashboard-page','search-page','info-page','admin-panel-page'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('profile-page').classList.remove('hidden');
    ['menu-dashboard','menu-search','menu-info','menu-admin'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });
    document.getElementById('header-profile-card')?.classList.add('active');
    setHeaderTitle(user);
    fixLayoutWidthToHeader('profile-page');
    renderProfileSidebar(); renderProfileFeed(); renderProfilePagination();
}

function openAdminPanel() {
    ['dashboard-page','search-page','info-page','profile-page'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('admin-panel-page').classList.remove('hidden');
    ['menu-dashboard','menu-search','menu-info'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });
    document.getElementById('menu-admin')?.classList.add('active');
    document.getElementById('drawer-menu-admin')?.classList.add('active');
    document.getElementById('header-profile-card')?.classList.remove('active');
    setHeaderTitle('PAINEL DE CONTROLE');
    renderAdminPanel();

    ['dashboard','search','info','admin'].forEach(id =>
        document.getElementById('mobitem-' + id)?.classList.remove('active'));
    document.getElementById('mobitem-admin')?.classList.add('active');
    const titleEl = document.getElementById('mob-topbar-title');
    if (titleEl) titleEl.textContent = 'PAINEL DE CONTROLE';
}

function initSearch(mode) {
    const input = document.getElementById(`nickname-input-${mode}`);
    input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            state[mode].filter = input.value;
            state[mode].page = 1;
            renderFeed(mode); renderPagination(mode); renderProfile(mode);
        }
    });
}

function fixLayoutWidthToHeader(pageId) {
    const headerEl = document.querySelector('header');
    const layout = document.querySelector(`#${pageId} .search-layout`);
    const sidebar = document.querySelector(`#${pageId} .profile-sidebar`);
    const feed = document.querySelector(`#${pageId} .feed-container`);
    if (!headerEl || !layout || !sidebar || !feed) return;
    if (window.innerWidth <= 1024) { layout.style.width = ''; feed.style.flex = ''; feed.style.width = ''; return; }
    const headerWidth = Math.round(headerEl.getBoundingClientRect().width);
    layout.style.width = `${headerWidth}px`;
    const feedWidth = Math.max(0, headerWidth - sidebar.offsetWidth - 30);
    feed.style.flex = 'none';
    feed.style.width = `${Math.round(feedWidth)}px`;
}

window.excluirRelatorio = async (id) => { await excluirRelatorio(id); atualizarTodasInterfaces(); };
window.abrirEdicaoRelatorio = (id) => { const rel = DADOS.relatorios.find(r => r.id === id); if (!rel) return; openModal('editar-relatorio', rel); };
window.abrirTransferenciaResponsavel = (nick) => openModal('transferir-responsabilidade', { nick });
window.openModal = openModal;
window.closeModal = closeModal;
window.openProfile = openProfile;
window.openAdminPanel = openAdminPanel;
window.switchPage = switchPage;

async function init() {
    document.getElementById('identificando-overlay')?.classList.remove('hidden');

    USUARIO_ATUAL = await pegarUsername() || '';
    if (USUARIO_ATUAL) CARGOS_USUARIO = await detectarCargosUsuario(USUARIO_ATUAL);

    await carregarDados();
    iniciarAtualizacaoEmTempoReal();

    if (temAcesso()) {
        await registrarAcesso(USUARIO_ATUAL, CARGOS_USUARIO);

        atualizarPerfilInterface();

        ['posts','info'].forEach(mode => { renderFeed(mode); renderPagination(mode); renderProfile(mode); initSearch(mode); });

        fixLayoutWidthToHeader('search-page');
        fixLayoutWidthToHeader('info-page');
        fixLayoutWidthToHeader('profile-page');

        document.getElementById('header-profile-card')?.addEventListener('click', () => openProfile(USUARIO_ATUAL));

        if (isAdm()) {
            const actionsContainer = document.querySelector('.actions-container');
            if (actionsContainer && !document.getElementById('btn-transferir-responsabilidade')) {
                const transferBtn = document.createElement('button');
                transferBtn.id = 'btn-transferir-responsabilidade';
                transferBtn.className = 'btn btn-primary';
                transferBtn.innerHTML = '<i class="ph ph-arrows-left-right"></i> Transferir responsabilidade';
                transferBtn.addEventListener('click', () => openModal('transferir-responsabilidade'));
                actionsContainer.appendChild(transferBtn);
            }
        }

        // Desktop drawer
        const drawer = document.getElementById('side-drawer');
        const overlayEl = document.getElementById('drawer-overlay');
        const openBtn = document.getElementById('hamburger-btn');
        const closeBtn = document.getElementById('drawer-close');
        const openDrawer = () => { overlayEl.style.display='block'; drawer.style.transform='translateX(0)'; document.body.style.overflow='hidden'; };
        const closeDrawer = () => { drawer.style.transform='translateX(-100%)'; overlayEl.style.display='none'; document.body.style.overflow=''; };
        openBtn?.addEventListener('click', openDrawer);
        closeBtn?.addEventListener('click', closeDrawer);
        overlayEl?.addEventListener('click', closeDrawer);
        document.querySelectorAll('#side-drawer .menu-item').forEach(mi => mi.addEventListener('click', () => closeDrawer()));
        document.getElementById('drawer-profile-card')?.addEventListener('click', () => { closeDrawer(); openProfile(USUARIO_ATUAL); });

        document.getElementById('menu-dashboard')?.classList.add('active');
        document.getElementById('btn-new-executive')?.addEventListener('click', () => openModal('new-executive'));
        document.getElementById('btn-post-report')?.addEventListener('click', () => openModal('post-report'));
        document.getElementById('btn-update-info')?.addEventListener('click', () => openModal('update-info'));
        document.getElementById('current-year').textContent = new Date().getFullYear();

        document.addEventListener('input', function (e) {
            if (e.target?.id === 'admin-search-postagens') renderAdminPostagens();
            if (e.target?.id === 'admin-search-users') renderAdminUsuarios();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const mobHam  = document.getElementById('mob-ham');
    const mobMenu = document.getElementById('mob-menu');

    window.closeMobMenu = function() {
        mobHam.classList.remove('open');
        mobMenu.classList.remove('open');
    };

    mobHam.addEventListener('click', function(e) {
        e.stopPropagation();
        mobHam.classList.toggle('open');
        mobMenu.classList.toggle('open');
    });

    document.addEventListener('click', function(e) {
        if (!mobHam.contains(e.target) && !mobMenu.contains(e.target)) {
            closeMobMenu();
        }
    });

    document.querySelectorAll('.mob-menu-item').forEach(item => {
        item.addEventListener('click', () => closeMobMenu());
    });

    document.getElementById('mob-menu-profile')?.addEventListener('click', () => {
        closeMobMenu();
        if (typeof openProfile === 'function') openProfile(USUARIO_ATUAL);
    });

    init();
});
