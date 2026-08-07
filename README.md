# AMC — Sistema de Engenharia de Tráfego

Sistema web interno da **AMC (Autarquia Municipal de Trânsito)** para gerenciamento de demandas de engenharia de tráfego, incluindo triagem, controle de execuções, projetos operacionais, vistorias, e painéis gerenciais.

## Stack Tecnológica

| Camada     | Tecnologia                                            |
|------------|-------------------------------------------------------|
| Frontend   | HTML5, CSS3 (Vanilla), JavaScript (ES6+)              |
| Backend    | [Supabase](https://supabase.com) (PostgreSQL + Auth)  |
| Fontes     | Google Fonts (Inter, Oswald)                          |
| Ícones     | Font Awesome 6, Lucide Icons                          |

## Estrutura do Projeto

```
sistema_engenharia/
├── index.html          ← Entry point (redireciona para login)
├── .gitignore
├── README.md
│
├── pages/              ← Todas as páginas HTML do sistema
│   ├── login.html                      Tela de login (CPF ou e-mail)
│   ├── triagem.html                    Cadastro de novas demandas
│   ├── admin_usuarios.html             Gestão de usuários e perfis
│   ├── dashboard_geral.html            Painel geral consolidado
│   ├── diretoria_dashboard.html        Dashboard gerencial
│   ├── ditran_dashboard.html           Painel DITRAN
│   ├── nce_dashboard.html              NCE - Controle de Execuções
│   ├── nco_dashboard.html              NCO - Controle de Obras
│   ├── ngc_dashboard.html              NGC - Gestão Cicloviária
│   ├── npa_dashboard.html              NPA - Planejamento e Análise
│   ├── npe_dashboard.html              NPE - Projetos Especiais
│   ├── npo_dashboard.html              NPO - Projetos Operacionais
│   └── despacho_nce_dashboard.html     Despacho NCE
│
├── js/                 ← Scripts JavaScript compartilhados
│   ├── auth.js                         Autenticação, proteção de rotas, sidebar
│   └── reports.js                      Módulo compartilhado de relatórios
│
├── docs/               ← Documentação técnica
│   └── schema.sql                      Schema do banco de dados (PostgreSQL)
│
├── data/               ← Dados e assets
│   └── bairros_fortaleza.xlsx          Base de bairros para autocomplete
│
└── _archive/           ← Arquivos arquivados (não vão para produção)
```

## Como Executar Localmente

```bash
# Instale o http-server (se ainda não tiver)
npm install -g http-server

# Na raiz do projeto
http-server -p 3000

# Acesse no navegador
http://localhost:3000
```

## Núcleos do Sistema

| Sigla   | Nome                          | Página Principal             |
|---------|-------------------------------|------------------------------|
| DITRAN  | Diretoria de Trânsito         | `ditran_dashboard.html`      |
| NCE     | Controle de Execuções         | `nce_dashboard.html`         |
| NCO     | Controle de Obras             | `nco_dashboard.html`         |
| NGC     | Gestão Cicloviária            | `ngc_dashboard.html`         |
| NPA     | Planejamento e Análise        | `npa_dashboard.html`         |
| NPE     | Projetos Especiais            | `npe_dashboard.html`         |
| NPO     | Projetos Operacionais         | `npo_dashboard.html`         |

## Níveis de Acesso

- **Admin** — Acesso total + gestão de usuários
- **Diretor** — Acesso a todos os núcleos
- **Operador** — Acesso restrito ao seu núcleo de lotação
