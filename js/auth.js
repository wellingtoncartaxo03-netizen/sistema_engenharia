// Módulo Central de Autenticação e Segurança (Supabase)
const supabaseUrl = 'https://gydkginbvvcsnyhyixrv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5ZGtnaW5idnZjc255aHlpeHJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODk1NzMsImV4cCI6MjA5Nzg2NTU3M30.KmIAlTNxWMhDMlVs0e9rwxbZVFrseLYc94uNV_vnkCA';

// Inicializa o cliente reutilizando o global do CDN
if (window.supabase && typeof window.supabase.createClient === 'function') {
    window.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
}

// Função para proteger rotas privadas (Executada no head de forma síncrona/rápida)
async function protegerRota() {
    if (!window.supabase) return;
    
    const { data: { session }, error: sessionError } = await window.supabase.auth.getSession();
    if (sessionError || !session) {
        window.location.href = "login.html";
        return;
    }

    // Busca perfil complementar do usuário
    const { data: perfil, error: perfilError } = await window.supabase
        .from('perfis_usuarios')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (perfilError || !perfil) {
        console.error("Perfil de usuário não localizado:", perfilError);
        await window.supabase.auth.signOut();
        window.location.href = "login.html";
        return;
    }

    // Salva perfil no sessionStorage para consultas rápidas
    sessionStorage.setItem('usuario_logado', JSON.stringify(perfil));

    // Valida se o usuário tem permissão para a página atual
    validarAcessoPagina(perfil);
    
    // Atualiza a visualização dos itens da sidebar
    atualizarSidebar(perfil);
}

// Função auxiliar para obter o nome da página sem extensão e caminhos
function obterNomePaginaLimpo(pathname) {
    const parts = pathname.split('/');
    const lastPart = parts[parts.length - 1];
    return lastPart.replace('.html', '').toLowerCase();
}

// Bloqueia acesso a páginas de outros núcleos
function validarAcessoPagina(perfil) {
    const path = window.location.pathname;

    // Admins e Diretores têm livre acesso a todas as telas
    if (perfil.nivel_acesso === 'admin' || perfil.nivel_acesso === 'diretor') {
        return;
    }

    const paginaAtual = obterNomePaginaLimpo(path);

    // Nova Demanda (triagem) é de acesso global para todos os usuários autenticados
    if (paginaAtual === 'triagem') {
        return;
    }

    // Mapeamento de arquivos correspondentes (sem extensão para suportar clean URLs)
    const mapeamentoRotas = {
        'Triagem': ['triagem'],
        'NPO': ['npo_dashboard'],
        'NCE': ['nce_dashboard', 'despacho_nce_dashboard'],
        'NCO': ['nco_dashboard'],
        'NGC': ['ngc_dashboard'],
        'NPE': ['npe_dashboard'],
        'NPA': ['npa_dashboard'],
        'Diretoria': ['ditran_dashboard', 'diretoria_dashboard']
    };

    const paginasPermitidas = mapeamentoRotas[perfil.nucleo_lotacao] || [];
    const todasPaginasMapeadas = Object.values(mapeamentoRotas).flat();

    if (todasPaginasMapeadas.includes(paginaAtual) && !paginasPermitidas.includes(paginaAtual)) {
        const defaultPage = paginasPermitidas[0] + ".html";
        console.warn(`Acesso negado para o núcleo: ${perfil.nucleo_lotacao}. Redirecionando para ${defaultPage}`);
        window.location.href = defaultPage;
    }
}

// Oculta abas não pertencentes ao núcleo do usuário logado
function atualizarSidebar(perfil) {
    const aplicarFiltrosSidebar = () => {
        // Se for admin ou diretor, todos os menus ficam visíveis
        if (perfil.nivel_acesso === 'admin' || perfil.nivel_acesso === 'diretor') {
            return;
        }

        // Mapeamento de id do menu para núcleo correspondente
        const menuMapping = {
            'menu-npo': 'NPO',
            'menu-nce-projetos': 'NCE',
            'menu-nco': 'NCO',
            'menu-ngc': 'NGC',
            'menu-npa': 'NPA',
            'menu-npe': 'NPE',
            'menu-diretoria': 'Diretoria',
            'menu-ditran': 'Diretoria'
        };

        for (const [menuId, nucleo] of Object.entries(menuMapping)) {
            const elemento = document.getElementById(menuId);
            if (elemento) {
                if (perfil.nucleo_lotacao !== nucleo) {
                    elemento.style.setProperty('display', 'none', 'important');
                }
            }
        }
        
        // Oculta painel administrativo para não-admins
        if (perfil.nivel_acesso !== 'admin') {
            const menuAdmin = document.getElementById('menu-admin');
            if (menuAdmin) {
                menuAdmin.style.setProperty('display', 'none', 'important');
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", aplicarFiltrosSidebar);
    } else {
        aplicarFiltrosSidebar();
    }
}

// Função auxiliar de logout
async function realizarLogout() {
    if (window.supabase) {
        await window.supabase.auth.signOut();
        sessionStorage.clear();
        window.location.href = "login.html";
    }
}

// Inicia a validação da rota imediatamente se a página não for a de login ou raiz
const paginaAtualLimpa = obterNomePaginaLimpo(window.location.pathname);
if (paginaAtualLimpa !== 'login' && paginaAtualLimpa !== '') {
    protegerRota();
}

// Prevenção de cache em links da sidebar
document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.href && (link.href.includes('.html') || !link.href.includes('.')) && !link.href.includes('logout') && !link.href.includes('#')) {
        try {
            const url = new URL(link.href);
            url.searchParams.set('t', Date.now());
            link.href = url.toString();
        } catch (err) {
            console.error("Erro ao aplicar cache buster:", err);
        }
    }
});


// ─── Funcionalidade de Redirecionamento Dinâmico de Setores (Coordenadores) ───
window.renderSectorRouting = async function(demandaId) {
    const container = document.getElementById('routing-container');
    if (!container) return;

    // Obtém o usuário logado para validar se é coordenador ou admin
    const userLogado = JSON.parse(sessionStorage.getItem('usuario_logado') || '{}');
    const isCoordenador = userLogado && (
        userLogado.nivel_acesso === 'coordenador' || 
        userLogado.nivel_acesso === 'diretor' || 
        userLogado.nivel_acesso === 'admin'
    );

    container.innerHTML = `
        <div style="margin-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 1.25rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                <span class="form-label" style="margin: 0; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--amc-text-muted, #9ca3af);">Encaminhamento (Setores)</span>
                ${isCoordenador ? `
                    <button type="button" id="btn-save-routing" onclick="window.saveSectorRouting('${demandaId}')" style="background: rgba(248, 183, 0, 0.12); border: 1px solid rgba(248, 183, 0, 0.25); color: var(--amc-primary, #F8B700); padding: 5px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fa fa-route"></i> Atualizar Encaminhamento
                    </button>
                ` : ''}
            </div>
            <div id="routing-checkboxes-loader" style="font-size:12px; color:var(--amc-text-muted, #9ca3af); padding: 4px 0;">
                <i class="fa fa-spinner fa-spin"></i> Carregando setores da demanda...
            </div>
            <div id="routing-checkboxes" style="display: none; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px;">
                ${['NPA', 'NPE', 'NCO', 'NCE', 'NPO', 'NGC'].map(sec => `
                    <label style="display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px; cursor: ${isCoordenador ? 'pointer' : 'not-allowed'}; transition: all 0.2s; user-select: none;">
                        <input type="checkbox" name="routing-sector" value="${sec}" ${!isCoordenador ? 'disabled' : ''} style="width: 15px; height: 15px; accent-color: var(--amc-primary, #F8B700); cursor: ${isCoordenador ? 'pointer' : 'not-allowed'};">
                        <span style="font-size: 12px; font-weight: 600; color: #fff;">${sec}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;

    try {
        const { data, error } = await window.supabase
            .from('demandas_pai')
            .select('nucleos_atribuidos')
            .eq('id', demandaId)
            .single();

        if (error) throw error;

        const assigned = data.nucleos_atribuidos || [];
        document.querySelectorAll('input[name="routing-sector"]').forEach(chk => {
            if (assigned.includes(chk.value)) {
                chk.checked = true;
            }
        });

        const loader = document.getElementById('routing-checkboxes-loader');
        const checkboxes = document.getElementById('routing-checkboxes');
        if (loader) loader.style.display = 'none';
        if (checkboxes) checkboxes.style.display = 'grid';
    } catch (err) {
        console.error("Erro ao carregar setores da demanda:", err);
        const loader = document.getElementById('routing-checkboxes-loader');
        if (loader) {
            loader.innerHTML = '<span style="color:#ef4444;"><i class="fa fa-triangle-exclamation"></i> Falha ao carregar setores da demanda</span>';
        }
    }
};

window.saveSectorRouting = async function(demandaId) {
    const btn = document.getElementById('btn-save-routing');
    const checked = Array.from(document.querySelectorAll('input[name="routing-sector"]:checked')).map(c => c.value);

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Salvando...';
    }

    try {
        const { error } = await window.supabase
            .from('demandas_pai')
            .update({ nucleos_atribuidos: checked.length > 0 ? checked : null })
            .eq('id', demandaId);

        if (error) throw error;

        if (typeof showToast === 'function') {
            showToast('Sucesso', 'Encaminhamento de setores atualizado!', 'success');
        } else if (window.showToast) {
            window.showToast('Sucesso', 'Encaminhamento de setores atualizado!', 'success');
        } else {
            alert('Encaminhamento de setores atualizado com sucesso!');
        }

        // Tenta acionar o reload da página correspondente
        const reloadFns = [
            'fetchNpoProjects', 
            'fetchNpeProjects', 
            'fetchNgcProjects', 
            'fetchNcoProjects', 
            'fetchData', 
            'fetchDemands', 
            'loadConsolidatedData'
        ];
        
        for (const fnName of reloadFns) {
            if (typeof window[fnName] === 'function') {
                await window[fnName]();
                
                if (fnName === 'fetchNpoProjects' && typeof window.setupModalNpoWriteAccess === 'function') {
                    const hasNpo = checked.includes('NPO');
                    window.setupModalNpoWriteAccess(hasNpo);
                }
                break;
            }
        }

    } catch (err) {
        console.error("Erro ao salvar encaminhamento:", err);
        const errorMsg = err.message || '';
        if (typeof showToast === 'function') {
            showToast('Erro', 'Falha ao atualizar encaminhamento: ' + errorMsg, 'error');
        } else {
            alert('Falha ao atualizar encaminhamento: ' + errorMsg);
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa fa-route"></i> Atualizar Encaminhamento';
        }
    }
};


