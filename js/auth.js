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

    // Mapeamento de arquivos correspondentes (sem extensão para suportar clean URLs)
    const mapeamentoRotas = {
        'Triagem': ['triagem'],
        'NPO': ['npo_dashboard'],
        'NCE': ['nce_dashboard', 'despacho_nce_dashboard'],
        'NCO': ['nco_dashboard'],
        'NGC': ['ngc_dashboard'],
        'NPE': ['npe_dashboard'],
        'NPA': ['npa_dashboard'],
        'Diretoria': ['diretoria_dashboard', 'ditran_dashboard']
    };

    const paginasPermitidas = mapeamentoRotas[perfil.nucleo_lotacao] || [];
    const todasPaginasMapeadas = Object.values(mapeamentoRotas).flat();
    const paginaAtual = obterNomePaginaLimpo(path);

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
            'menu-triagem': 'Triagem',
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

