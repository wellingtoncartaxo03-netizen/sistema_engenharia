/**
 * reports.js — Módulo Compartilhado de Relatórios AMC
 *
 * Como usar em qualquer dashboard:
 *   1. Inclua: <script src="reports.js"></script>
 *   2. No botão de relatório: onclick="openReportModal(meuConfig)"
 *
 * Formato do config:
 * {
 *   title       : string   — título do modal/relatório
 *   color       : string   — cor CSS do núcleo (ex: '#a78bfa')
 *   getData     : ()=>[]   — função que retorna o array de dados em memória
 *   nucleoKey   : string   — chave do join na demandas_pai (ex: 'execucao_nce')
 *   statusField : string   — campo de status no sub-objeto (ex: 'status_nce')
 *   dateField   : string   — campo de data (ex: 'data_execucao')
 *   teamFields  : { nome, tipo } — campos de equipe no sub-objeto
 *   statusOptions: string[] — lista de status para o seletor
 *   totalsFields : [{ label, field, suffix, parse }] — métricas numéricas
 *   detailsBuilder: (nuc)=>string[] — gera os detalhes do formato completo
 *   hasOS       : bool     — exibe a aba Ordem de Serviço?
 *   osStatusFilter: string[] — status permitidos na OS
 *   projectResolver: (p)=>string|null — resolve URL do PDF do projeto
 * }
 */

(function () {
    'use strict';

    // ── Estado Interno ──────────────────────────────────────────────────────
    let _config       = null;
    let _currentTab   = 'execucao';
    let _lastFiltered = [];

    // ── Helpers ─────────────────────────────────────────────────────────────
    function _escHtml(t) {
        if (t == null) return '';
        const m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(t).replace(/[&<>"']/g, c => m[c]);
    }
    window._escHtml = _escHtml;


    function _getNucleoData(p) {
        if (!_config) return null;
        const raw = p[_config.nucleoKey];
        return Array.isArray(raw) ? raw[0] : (raw || null);
    }

    function _showToast(title, message, type) {
        // Tenta usar o showToast do dashboard pai, se existir
        if (typeof window.showToast === 'function') {
            window.showToast(title, message, type);
        } else {
            console.warn(`[reports.js] ${type}: ${title} — ${message}`);
        }
    }

    // ── Injeção de CSS ───────────────────────────────────────────────────────
    function _injectStyles() {
        if (document.getElementById('amc-reports-styles')) return;
        const style = document.createElement('style');
        style.id = 'amc-reports-styles';
        style.textContent = `
            #shared-report-modal {
                position: fixed; inset: 0; z-index: 1400;
                background: rgba(0,0,0,0.75); backdrop-filter: blur(18px);
                display: flex; align-items: center; justify-content: center;
                opacity: 0; pointer-events: none; transition: opacity 0.3s;
            }
            #shared-report-modal.show { opacity: 1; pointer-events: auto; }
            .rep-modal-content {
                width: 960px; max-width: 97vw; height: 85vh;
                background: rgba(10,10,12,0.97); border: 1px solid rgba(255,255,255,0.09);
                border-radius: 1.5rem; display: flex; flex-direction: column; overflow: hidden;
                transform: scale(0.96) translateY(10px);
                transition: transform 0.35s cubic-bezier(0.175,0.885,0.32,1.275);
            }
            #shared-report-modal.show .rep-modal-content { transform: scale(1) translateY(0); }
            .rep-modal-header {
                padding: 1.25rem 2rem; border-bottom: 1px solid rgba(255,255,255,0.06);
                display: flex; justify-content: space-between; align-items: center;
                background: rgba(0,0,0,0.3); flex-shrink: 0;
            }
            .rep-modal-header h4 { margin: 0; font-size: 16px; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 8px; }
            .rep-modal-body { display: flex; flex: 1; overflow: hidden; }
            .rep-sidebar { width: 220px; border-right: 1px solid rgba(255,255,255,0.06); padding: 1.25rem; background: rgba(0,0,0,0.2); display: flex; flex-direction: column; gap: 6px; }
            .rep-main-content { flex: 1; padding: 1.75rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1.25rem; }
            .rep-filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: flex-end; }
            .rep-filter-grid > div { min-width: 0; }
            .rep-filter-grid .form-input { width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; }
            .rep-totals-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
            .rep-total-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 12px; text-align: center; }
            .rep-total-num { font-size: 20px; font-weight: 700; color: var(--rep-color, #a78bfa); font-family: 'Oswald', sans-serif; }
            .rep-total-label { font-size: 10px; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-top: 4px; }
            #rep-paper-preview {
                background: #ffffff; color: #333333; border-radius: 12px;
                padding: 30px; margin-top: 8px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                border: 1px solid #e0e0e0;
            }
            #rep-paper-preview h3 { color: #111; font-size: 22px; font-weight: 700; margin: 0 0 5px 0; font-family: inherit; }
            #rep-paper-preview .rep-totals-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
            #rep-paper-preview .rep-total-card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; text-align: center; background: #fafafa; color: #333; }
            #rep-paper-preview .rep-total-num { font-size: 18px; font-weight: bold; color: #6366f1; font-family: 'Oswald', sans-serif; }
            #rep-paper-preview .rep-total-label { font-size: 10px; text-transform: uppercase; color: #777; margin-top: 4px; font-weight: bold; }
            #rep-paper-preview table.rep-results-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; color: #333; }
            #rep-paper-preview table.rep-results-table th { text-align: left; padding: 10px; background: #f2f2f2; color: #555; font-weight: bold; border-bottom: 2px solid #ddd; text-transform: uppercase; font-size: 10px; }
            #rep-paper-preview table.rep-results-table td { padding: 10px; border-bottom: 1px solid #eee; color: #333; }
            #rep-paper-preview .badge-generic { padding: 3px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; background: #eee; border: 1px solid #ccc; text-transform: uppercase; color: #333; }
            #rep-paper-preview h5 { font-size: 14px; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; color: #6366f1; text-transform: uppercase; margin-top: 20px; font-family: inherit; font-weight: 700; }
            .rep-modal-footer { padding: 1rem 2rem; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: flex-end; flex-shrink: 0; background: rgba(0,0,0,0.2); }
            .rep-modal-close { background: none; border: none; color: #9ca3af; font-size: 20px; cursor: pointer; line-height: 1; padding: 4px 8px; border-radius: 6px; transition: color 0.2s; }
            .rep-modal-close:hover { color: #fff; }
            .badge-generic-btn {
                cursor: pointer !important;
                background: rgba(255,255,255,0.05) !important;
                border: 1px solid rgba(255,255,255,0.1) !important;
                padding: 4px 8px !important;
                border-radius: 4px !important;
                font-size: 10px !important;
                color: #ffffff !important;
                transition: all 0.2s ease !important;
                font-family: inherit !important;
            }
            .badge-generic-btn:hover {
                background: rgba(255,255,255,0.12) !important;
                border-color: rgba(255,255,255,0.25) !important;
                color: #ffffff !important;
            }
            
            /* Abas do modal sidebar genéricas */
            .empresa-tab-btn {
                background: transparent; border: none; color: #9ca3af;
                padding: 10px 18px; font-size: 11px; font-weight: 700;
                text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer;
                transition: all 0.2s; border-bottom: 2px solid transparent;
                display: flex; align-items: center; gap: 7px; white-space: nowrap;
                font-family: 'Inter', sans-serif;
            }
            .empresa-tab-btn:hover { color: #fff; }
            .empresa-tab-btn.active {
                color: var(--rep-color, #a78bfa) !important;
                border-bottom-color: var(--rep-color, #a78bfa) !important;
                background: rgba(255,255,255,0.03) !important;
            }
        `;
        document.head.appendChild(style);
    }

    // ── Injeção do HTML do Modal ─────────────────────────────────────────────
    function _injectModal() {
        if (document.getElementById('shared-report-modal')) return;
        const div = document.createElement('div');
        div.id = 'shared-report-modal';
        div.innerHTML = `
            <div class="rep-modal-content">
                <div class="rep-modal-header">
                    <h4><i class="fa fa-chart-line"></i> Opções de Relatório</h4>
                    <button class="rep-modal-close" onclick="window._repClose()">&#x2715;</button>
                </div>
                <div class="rep-modal-body">
                    <!-- Sidebar: abas -->
                    <div class="rep-sidebar" id="rep-sidebar"></div>
                    <!-- Conteúdo Principal -->
                    <div class="rep-main-content">
                        <div class="rep-filter-grid" id="rep-filter-grid">
                            <div id="rep-period-group">
                                <label class="form-label">Tipo de Período</label>
                                <select id="rep-period-type" class="form-input" onchange="window._repToggleDates()">
                                    <option value="day">Dia Específico</option>
                                    <option value="range">Período Personalizado</option>
                                </select>
                            </div>
                            <div id="rep-date-single-group">
                                <label class="form-label">Data</label>
                                <input type="date" id="rep-date-single" class="form-input">
                            </div>
                            <div id="rep-date-start-group" style="display:none;">
                                <label class="form-label">De</label>
                                <input type="date" id="rep-date-start" class="form-input">
                            </div>
                            <div id="rep-date-end-group" style="display:none;">
                                <label class="form-label">Até</label>
                                <input type="date" id="rep-date-end" class="form-input">
                            </div>
                            <div id="rep-status-group">
                                <label class="form-label">Status da Execução</label>
                                <select id="rep-status" class="form-input">
                                    <option value="">Todos os Status</option>
                                </select>
                            </div>
                            <div id="rep-team-group">
                                <label class="form-label">Equipe / Empresa</label>
                                <select id="rep-team" class="form-input">
                                    <option value="">Todas as Equipes</option>
                                    <option value="amc">Equipes AMC (Totalizado)</option>
                                    <option value="terceirizada">Equipe Terceirizada (Totalizado)</option>
                                </select>
                            </div>
                            <div id="rep-format-group">
                                <label class="form-label">Formato</label>
                                <select id="rep-format" class="form-input">
                                    <option value="completo" selected>Completo</option>
                                    <option value="resumido">Resumido</option>
                                </select>
                            </div>
                            <!-- Grupo de Filtro de Critério Individual (Injetado) -->
                            <div id="rep-criteria-group" style="display:none; grid-column:span 2; display:none; gap:12px;">
                                <div style="flex:1;">
                                    <label class="form-label">Tipo de Critério</label>
                                    <select id="rep-criteria-type" class="form-input" onchange="window._repOnCriteriaTypeChange()">
                                        <option value="bairro">Bairro</option>
                                        <option value="regional">Regional</option>
                                        <option value="solicitante">Interessado / Solicitante</option>
                                        <option value="prioridade">Nome da Prioridade</option>
                                    </select>
                                </div>
                                <div style="flex:1;">
                                    <label class="form-label">Valor do Critério</label>
                                    <select id="rep-criteria-value" class="form-input">
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- Botões de Ação -->
                        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:4px;">
                            <button class="btn-save" onclick="window._repGenerate()" style="border-radius:8px; height:38px; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
                                <i class="fa fa-eye"></i> Visualizar
                            </button>
                            <button class="btn-save" onclick="window._repPrint()" style="border-radius:8px; height:38px; background:rgba(167,139,250,0.15); border:1px solid rgba(167,139,250,0.3); color:#a78bfa; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
                                <i class="fa fa-print"></i> Imprimir
                            </button>
                        </div>
                        <!-- Folha de Prévia (Papel A4) -->
                        <div id="rep-paper-preview" style="display:none;">
                            <h3 id="rep-paper-title"></h3>
                            <div id="rep-paper-subtitle" style="font-size:12px; color:#666; margin-bottom:20px; border-bottom:2px solid #eee; padding-bottom:8px;"></div>
                            <div id="rep-totals-area" class="rep-totals-grid" style="margin-bottom:20px;"></div>
                            <div id="rep-results-area" style="overflow-x:auto;"></div>
                        </div>
                        <!-- Área de Resultado Vazio -->
                        <div id="rep-empty-area" style="display:none;" class="aggr-empty"></div>
                    </div>
                </div>
                <div class="rep-modal-footer">
                    <button class="btn-cancel" onclick="window._repClose()">Fechar</button>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    // ── API Pública: openReportModal ─────────────────────────────────────────
    // ── API Pública: openReportModal ─────────────────────────────────────────
    window.openReportModal = function (config) {
        _config = config;
        _currentTab = 'execucao';
        _lastFiltered = [];

        // Aplica cor do núcleo como variável CSS
        document.documentElement.style.setProperty('--rep-color', config.color || '#a78bfa');

        // Popula as opções de status
        const statusSelect = document.getElementById('rep-status');
        statusSelect.innerHTML = '<option value="">Todos os Status</option>';
        (config.statusOptions || []).forEach(s => {
            const opt = document.createElement('option');
            opt.value = s; opt.textContent = s;
            statusSelect.appendChild(opt);
        });

        // Monta as abas na sidebar
        const sidebar = document.getElementById('rep-sidebar');
        let tabsHtml = `
            <div class="empresa-tab-btn active" id="tab-rep-execucao" onclick="window._repSwitchTab('execucao')" style="cursor:pointer;">
                <i class="fa fa-file-invoice" style="margin-right:6px;"></i> Relatório de Execução
            </div>
        `;
        if (config.hasOS) {
            tabsHtml += `
            <div class="empresa-tab-btn" id="tab-rep-os" onclick="window._repSwitchTab('os')" style="cursor:pointer;">
                <i class="fa fa-clipboard-list" style="margin-right:6px;"></i> Ordem de Serviço
            </div>
            `;
        }
        if (config.hasCriteriaReport) {
            tabsHtml += `
            <div class="empresa-tab-btn" id="tab-rep-criterio" onclick="window._repSwitchTab('criterio')" style="cursor:pointer;">
                <i class="fa fa-filter" style="margin-right:6px;"></i> Critério Individual
            </div>
            `;
        }
        sidebar.innerHTML = tabsHtml;

        // Inicializa a data padrão
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('rep-date-single').value = today;
        document.getElementById('rep-date-start').value  = today;
        document.getElementById('rep-date-end').value    = today;

        document.getElementById('rep-period-type').value = 'day';
        window._repToggleDates();

        // Reseta a prévia
        _resetPreview();

        // Exibe o modal
        document.getElementById('shared-report-modal').classList.add('show');
    };

    // ── Funções Internas (expostas com prefixo _rep para não conflitar) ──────

    window._repClose = function () {
        document.getElementById('shared-report-modal').classList.remove('show');
    };

    window._repToggleDates = function () {
        const pType = document.getElementById('rep-period-type').value;
        document.getElementById('rep-date-single-group').style.display = pType === 'day' ? 'block' : 'none';
        document.getElementById('rep-date-start-group').style.display  = pType === 'range' ? 'block' : 'none';
        document.getElementById('rep-date-end-group').style.display    = pType === 'range' ? 'block' : 'none';
    };

    window._repSwitchTab = function (tab) {
        _currentTab = tab;

        const tabExec = document.getElementById('tab-rep-execucao');
        const tabOS   = document.getElementById('tab-rep-os');
        const tabCrit = document.getElementById('tab-rep-criterio');
        if (tabExec) tabExec.classList.toggle('active', tab === 'execucao');
        if (tabOS)   tabOS.classList.toggle('active', tab === 'os');
        if (tabCrit) tabCrit.classList.toggle('active', tab === 'criterio');

        const isCrit = tab === 'criterio';

        // Alterna entre os containers de filtros
        document.getElementById('rep-filter-grid').style.display = 'grid';

        document.getElementById('rep-period-group').style.display      = isCrit ? 'none' : 'block';
        document.getElementById('rep-date-single-group').style.display  = isCrit ? 'none' : (document.getElementById('rep-period-type').value === 'day' ? 'block' : 'none');
        document.getElementById('rep-date-start-group').style.display   = isCrit ? 'none' : (document.getElementById('rep-period-type').value === 'range' ? 'block' : 'none');
        document.getElementById('rep-date-end-group').style.display     = isCrit ? 'none' : (document.getElementById('rep-period-type').value === 'range' ? 'block' : 'none');
        
        document.getElementById('rep-status-group').style.display       = (isCrit || tab === 'os') ? 'none' : 'block';
        document.getElementById('rep-team-group').style.display         = isCrit ? 'none' : 'block';
        document.getElementById('rep-format-group').style.display       = (isCrit || tab === 'os') ? 'none' : 'block';

        const critGroup = document.getElementById('rep-criteria-group');
        critGroup.style.display = isCrit ? 'flex' : 'none';

        if (isCrit) {
            window._repOnCriteriaTypeChange();
        }

        _resetPreview();
    };

    window._repOnCriteriaTypeChange = function () {
        if (!_config) return;
        const type = document.getElementById('rep-criteria-type').value;
        const valueSelect = document.getElementById('rep-criteria-value');
        valueSelect.innerHTML = '';

        const allData = _config.getData() || [];
        const uniqueValues = new Set();

        allData.forEach(p => {
            if (type === 'bairro') {
                const b = p.nome_bairro || p.raw?.cat_bairros?.nome_bairro;
                if (b) uniqueValues.add(b);
            } else if (type === 'regional') {
                const r = p.nome_regional || p.raw?.cat_bairros?.cat_regionais?.nome_regional;
                if (r) uniqueValues.add(r);
            } else if (type === 'solicitante') {
                const s = p.solicitante_oficial || p.raw?.solicitante_oficial;
                if (s) uniqueValues.add(s.trim());
            } else if (type === 'prioridade') {
                const pr = p.prioridade_nome || p.raw?.prioridade_nome;
                if (pr) uniqueValues.add(pr);
            }
        });

        // Ordena e adiciona
        Array.from(uniqueValues).sort().forEach(val => {
            const opt = document.createElement('option');
            opt.value = val; opt.textContent = val;
            valueSelect.appendChild(opt);
        });

        if (uniqueValues.size === 0) {
            valueSelect.innerHTML = '<option value="">Nenhum valor encontrado</option>';
        }
    };

    function _resetPreview() {
        document.getElementById('rep-paper-preview').style.display = 'none';
        document.getElementById('rep-empty-area').style.display    = 'none';
        const ta = document.getElementById('rep-totals-area');
        if (ta) { ta.style.display = 'none'; ta.innerHTML = ''; }
        const ra = document.getElementById('rep-results-area');
        if (ra) ra.innerHTML = '';
    }

    window._repGenerate = function () {
        if (!_config) return;

        const isCrit = _currentTab === 'criterio';

        // ── Filtro ──
        let filtered = [];
        let periodText = '';
        let actualFormat = 'resumido';

        if (isCrit) {
            const type = document.getElementById('rep-criteria-type').value;
            const val = document.getElementById('rep-criteria-value').value;
            const allData = _config.getData() || [];

            filtered = allData.filter(p => {
                if (type === 'bairro') {
                    const b = p.nome_bairro || p.raw?.cat_bairros?.nome_bairro;
                    return b === val;
                } else if (type === 'regional') {
                    const r = p.nome_regional || p.raw?.cat_bairros?.cat_regionais?.nome_regional;
                    return r === val;
                } else if (type === 'solicitante') {
                    const s = p.solicitante_oficial || p.raw?.solicitante_oficial;
                    return s && s.trim() === val;
                } else if (type === 'prioridade') {
                    const pr = p.prioridade_nome || p.raw?.prioridade_nome;
                    return pr === val;
                }
                return false;
            });

            const critLabel = document.getElementById('rep-criteria-type').options[document.getElementById('rep-criteria-type').selectedIndex].text;
            periodText = `Busca por ${critLabel}: "${val}"`;
        } else {
            const pType      = document.getElementById('rep-period-type').value;
            const singleDate = document.getElementById('rep-date-single').value;
            const startDate  = document.getElementById('rep-date-start').value;
            const endDate    = document.getElementById('rep-date-end').value;
            const filterStatus = document.getElementById('rep-status').value;
            const filterTeam   = document.getElementById('rep-team').value;
            const format       = document.getElementById('rep-format').value;
            actualFormat = _currentTab === 'os' ? 'completo' : format;

            const allData = _config.getData();

            filtered = allData.filter(p => {
                const nuc    = _getNucleoData(p);
                if (!nuc) return false;

                const status = nuc[_config.statusField] || '';
                const date   = nuc[_config.dateField]   || null;
                const teamNome = _config.teamFields ? (nuc[_config.teamFields.nome] || '').trim() : '';
                const teamTipo = _config.teamFields ? (nuc[_config.teamFields.tipo] || '') : '';

                if (pType === 'day') {
                    if (!date || date !== singleDate) return false;
                } else {
                    if (!date || date < startDate || date > endDate) return false;
                }

                if (_currentTab === 'os') {
                    const allowed = _config.osStatusFilter || [];
                    if (!allowed.includes(status)) return false;
                } else {
                    if (filterStatus && status !== filterStatus) return false;
                }

                if (filterTeam === 'amc'          && teamTipo !== 'AMC')          return false;
                if (filterTeam === 'terceirizada'  && teamTipo !== 'Terceirizada') return false;

                return true;
            });

            if (pType === 'day') {
                periodText = `Dia: ${new Date(singleDate + 'T00:00:00').toLocaleDateString('pt-BR')}`;
            } else {
                periodText = `Período: ${new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR')}`;
            }
        }

        _lastFiltered = filtered;

        if (filtered.length === 0) {
            document.getElementById('rep-paper-preview').style.display = 'none';
            const ea = document.getElementById('rep-empty-area');
            ea.innerHTML = '<i class="fa fa-info-circle" style="margin-right:6px;"></i> Nenhum registro encontrado para os filtros selecionados.';
            ea.style.display = 'block';
            _showToast('Aviso', 'Nenhum registro encontrado para os filtros selecionados.', 'error');
            return;
        }
        document.getElementById('rep-empty-area').style.display = 'none';

        // Ordena por equipe para o formato completo
        if (actualFormat === 'completo') {
            filtered.sort((a, b) => {
                const nA = _getNucleoData(a);
                const nB = _getNucleoData(b);
                const kA = nA && _config.teamFields && nA[_config.teamFields.nome] ? `${nA[_config.teamFields.tipo]} - ${nA[_config.teamFields.nome]}` : 'Não designada';
                const kB = nB && _config.teamFields && nB[_config.teamFields.nome] ? `${nB[_config.teamFields.tipo]} - ${nB[_config.teamFields.nome]}` : 'Não designada';
                return kA.localeCompare(kB);
            });
        }

        // ── Totais ──
        const totalCount = filtered.length;
        const concludedCount = filtered.filter(p => {
            const nuc = _getNucleoData(p);
            return nuc && nuc[_config.statusField] === 'Concluído';
        }).length;

        const totalsArea = document.getElementById('rep-totals-area');
        let totalsHtml = '';

        if (isVist) {
            totalsHtml = `
                <div class="rep-total-card" style="grid-column: span 4;"><div class="rep-total-num">${totalCount}</div><div class="rep-total-label">Total de Locais para Vistoria</div></div>
            `;
        } else {
            totalsHtml = `
                <div class="rep-total-card"><div class="rep-total-num">${totalCount}</div><div class="rep-total-label">Total</div></div>
            `;
            if (isCrit) {
                let totalFinanceiro = 0;
                filtered.forEach(p => {
                    if (_config.valueResolver) {
                        totalFinanceiro += _config.valueResolver(p) || 0;
                    }
                });
                totalsHtml += `
                    <div class="rep-total-card" style="grid-column: span 3;"><div class="rep-total-num">R$ ${totalFinanceiro.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div><div class="rep-total-label">Valor Financeiro Total</div></div>
                `;
            } else {
                totalsHtml += `
                    <div class="rep-total-card"><div class="rep-total-num">${concludedCount}</div><div class="rep-total-label">Concluídos</div></div>
                `;
                (_config.totalsFields || []).forEach(tf => {
                    let total = 0;
                    filtered.forEach(p => {
                        const nuc = _getNucleoData(p);
                        if (nuc && nuc[tf.field] != null) {
                            total += tf.parse === 'float' ? parseFloat(nuc[tf.field] || 0) : parseInt(nuc[tf.field] || 0);
                        }
                    });
                    const display = tf.parse === 'float' ? total.toFixed(1) : total;
                    totalsHtml += `<div class="rep-total-card"><div class="rep-total-num">${display} ${tf.suffix || ''}</div><div class="rep-total-label">${tf.label}</div></div>`;
                });
            }
        }

        totalsArea.innerHTML = totalsHtml;
        totalsArea.style.display = 'grid';

        // ── Título da Folha ──
        const isOS = _currentTab === 'os';
        let paperTitle = '';
        if (isCrit) {
            paperTitle = `AMC — Relatório por Critério — ${_config.title}`;
        } else {
            paperTitle = isOS ? `AMC — Ordem de Serviço — ${_config.title}` : `AMC — ${_config.title}`;
        }
        document.getElementById('rep-paper-title').textContent = paperTitle;
        document.getElementById('rep-paper-subtitle').textContent = `Gerado em: ${new Date().toLocaleDateString('pt-BR')} | ${periodText}`;
        document.getElementById('rep-paper-preview').style.display = 'block';

        // ── Renderização da Tabela ──
        let resultsHtml = '';

        if (isCrit) {
            const groups = {};
            filtered.forEach(p => {
                const status = p.status_geral || p.raw?.status_geral || 'Sem Status';
                if (!groups[status]) groups[status] = [];
                groups[status].push(p);
            });

            Object.keys(groups).sort().forEach(statusKey => {
                const recs = groups[statusKey];
                let somaGrupo = 0;

                resultsHtml += `
                    <div class="rep-team-section" style="margin-top:1.5rem; margin-bottom:2rem;">
                        <h5 style="color:${_config.color || '#f8b700'}; border-bottom:1px solid rgba(0,0,0,0.08); padding-bottom:6px; margin-bottom:10px; font-weight:700; font-size: 14px;">
                            <i class="fa fa-info-circle" style="margin-right:6px;"></i> Status: ${_escHtml(statusKey)} (Total: ${recs.length})
                        </h5>
                        <table class="rep-results-table">
                            <thead><tr>
                                <th>Data Cadastro</th><th>Local / Endereço</th><th>O que foi feito / Autorizado</th><th>Valor</th>
                            </tr></thead>
                            <tbody>
                `;

                recs.forEach(p => {
                    const rawDate = p.created_at || p.raw?.created_at;
                    const date = rawDate ? new Date(rawDate).toLocaleDateString('pt-BR') : '—';
                    
                    const rua = p.nome_rua || p.raw?.ruas_fortaleza?.nome || '';
                    const bairro = p.nome_bairro || p.raw?.cat_bairros?.nome_bairro || '';
                    const local = p.endereco || p.raw?.endereco || `${rua}, ${bairro}` || '—';

                    const nuc = _getNucleoData(p);
                    const details = (_config.detailsBuilder && nuc) ? _config.detailsBuilder(nuc) : [];
                    const detailStr = details.join(' | ') || 'Sem detalhes de execução';

                    const valInd = _config.valueResolver ? (_config.valueResolver(p) || 0) : 0;
                    somaGrupo += valInd;

                    resultsHtml += `<tr>
                        <td>${_escHtml(date)}</td>
                        <td>${_escHtml(local)}</td>
                        <td>${_escHtml(detailStr)}</td>
                        <td>R$ ${valInd.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                    </tr>`;
                });

                resultsHtml += `
                            </tbody>
                            <tfoot>
                                <tr style="background: #f9f9f9; font-weight: bold; border-top: 2px solid #ddd; color:#111;">
                                    <td colspan="2" style="text-align: left; padding: 10px;">Subtotal do Status:</td>
                                    <td style="padding: 10px;">${recs.length} processo(s)</td>
                                    <td style="padding: 10px;">R$ ${somaGrupo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                `;
            });
        } else if (document.getElementById('rep-format').value === 'resumido') {
            resultsHtml = `
                <table class="rep-results-table"><thead><tr>
                    <th>Dia</th><th>Local / Endereço</th><th>Equipe / Empresa</th><th>Status</th>
                </tr></thead><tbody>
            `;
            filtered.forEach(p => {
                const nuc  = _getNucleoData(p);
                const date = nuc && nuc[_config.dateField] ? new Date(nuc[_config.dateField] + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
                const rua  = p.ruas_fortaleza ? p.ruas_fortaleza.nome : '';
                const local = p.endereco || rua || '—';
                const tNome = _config.teamFields ? (nuc?.[_config.teamFields.nome] || '') : '';
                const tTipo = _config.teamFields ? (nuc?.[_config.teamFields.tipo] || '') : '';
                const equipe = tNome ? `${tTipo} - ${tNome}` : 'Não designada';
                const status = nuc ? (nuc[_config.statusField] || '—') : '—';
                resultsHtml += `<tr>
                    <td>${_escHtml(date)}</td>
                    <td>${_escHtml(local)}</td>
                    <td>${_escHtml(equipe)}</td>
                    <td><span class="badge badge-generic">${_escHtml(status)}</span></td>
                </tr>`;
            });
            resultsHtml += '</tbody></table>';

        } else {
            const groups = {};
            filtered.forEach(p => {
                const nuc = _getNucleoData(p);
                const tNome = _config.teamFields ? (nuc?.[_config.teamFields.nome] || '') : '';
                const tTipo = _config.teamFields ? (nuc?.[_config.teamFields.tipo] || '') : '';
                const teamKey = tNome ? `${tTipo} - ${tNome}` : 'Não designada';
                if (!groups[teamKey]) groups[teamKey] = [];
                groups[teamKey].push(p);
            });

            Object.keys(groups).sort().forEach(teamKey => {
                const recs = groups[teamKey];
                const gCount = recs.length;
                const gConcluded = recs.filter(p => {
                    const nuc = _getNucleoData(p);
                    return nuc && nuc[_config.statusField] === 'Concluído';
                }).length;

                const subTotals = (_config.totalsFields || []).map(tf => {
                    let t = 0;
                    recs.forEach(p => {
                        const nuc = _getNucleoData(p);
                        if (nuc && nuc[tf.field] != null) {
                            t += tf.parse === 'float' ? parseFloat(nuc[tf.field] || 0) : parseInt(nuc[tf.field] || 0);
                        }
                    });
                    const display = tf.parse === 'float' ? t.toFixed(1) : t;
                    return `<span style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:4px 10px; border-radius:4px; font-size:11px;">${tf.label}: <b>${display} ${tf.suffix || ''}</b></span>`;
                }).join('');

                const projHeader = isOS ? '<th>Projeto</th>' : '';

                resultsHtml += `
                    <div class="rep-team-section" style="margin-top:1.5rem; margin-bottom:2rem;">
                        <h5 style="color:${_config.color || '#6366f1'}; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:6px; margin-bottom:10px; font-weight:700;">
                            <i class="fa fa-users" style="margin-right:6px;"></i> ${_escHtml(teamKey)}
                        </h5>
                        <div style="display:flex; gap:12px; margin-bottom:12px; flex-wrap:wrap;">
                            <span style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:4px 10px; border-radius:4px; font-size:11px;">Total: <b>${gCount}</b></span>
                            <span style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); color:#10b981; padding:4px 10px; border-radius:4px; font-size:11px;">Concluídos: <b>${gConcluded}</b></span>
                            ${subTotals}
                        </div>
                        <table class="rep-results-table">
                            <thead><tr>
                                <th>Dia</th><th>Local / Endereço</th><th>Status</th><th>O que deverá ser executado</th>
                                ${projHeader}
                            </tr></thead>
                            <tbody>
                `;

                recs.forEach(p => {
                    const nuc  = _getNucleoData(p);
                    const date = nuc && nuc[_config.dateField] ? new Date(nuc[_config.dateField] + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
                    const rua  = p.ruas_fortaleza ? p.ruas_fortaleza.nome : '';
                    const local = p.endereco || rua || '—';
                    const status = nuc ? (nuc[_config.statusField] || '—') : '—';
                    const details = (_config.detailsBuilder && nuc) ? _config.detailsBuilder(nuc) : [];
                    const detailStr = details.join(' | ') || 'Sem detalhes específicos';

                    let projCell = '';
                    if (isOS && _config.projectResolver) {
                        const projUrl = _config.projectResolver(p);
                        projCell = projUrl
                            ? `<td><a href="${projUrl}" target="_blank" class="badge-generic" style="text-decoration:none; color:#6366f1; border-color:#6366f1; background:rgba(99,102,241,0.05); display:inline-flex; align-items:center; gap:4px;"><i class="fa fa-file-pdf"></i> PDF</a></td>`
                            : `<td>—</td>`;
                    }

                    resultsHtml += `<tr>
                        <td>${_escHtml(date)}</td>
                        <td>${_escHtml(local)}</td>
                        <td><span class="badge badge-generic">${_escHtml(status)}</span></td>
                        <td>${_escHtml(detailStr)}</td>
                        ${projCell}
                    </tr>`;
                });

                resultsHtml += '</tbody></table></div>';
            });
        }

        document.getElementById('rep-results-area').innerHTML = resultsHtml;
    };

    window._repPrint = function () {
        window._repGenerate();
        if (_lastFiltered.length === 0) {
            _showToast('Aviso', 'Não há registros para imprimir.', 'error');
            return;
        }

        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) {
            _showToast('Erro', 'O bloqueador de pop-ups impediu a impressão. Autorize pop-ups para este site.', 'error');
            return;
        }

        const isOS       = _currentTab === 'os';
        const isCrit     = _currentTab === 'criterio';
        let titleStr     = '';
        let periodText   = '';

        if (isCrit) {
            titleStr = `Relatório por Critério — ${_config.title}`;
            const type = document.getElementById('rep-criteria-type').value;
            const val = document.getElementById('rep-criteria-value').value;
            const critLabel = document.getElementById('rep-criteria-type').options[document.getElementById('rep-criteria-type').selectedIndex].text;
            periodText = `Busca por ${critLabel}: "${val}"`;
        } else {
            titleStr = isOS ? `Ordem de Serviço — ${_config.title}` : _config.title;
            const pType = document.getElementById('rep-period-type').value;
            const singleDate = document.getElementById('rep-date-single').value;
            const startDate  = document.getElementById('rep-date-start').value;
            const endDate    = document.getElementById('rep-date-end').value;

            if (pType === 'day') {
                periodText = `Dia: ${new Date(singleDate + 'T00:00:00').toLocaleDateString('pt-BR')}`;
            } else {
                periodText = `Período: ${new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR')}`;
            }
        }

        const todayStr = new Date().toLocaleDateString('pt-BR');
        const totalsContent = document.getElementById('rep-totals-area').innerHTML;
        const tableContent  = document.getElementById('rep-results-area').innerHTML;

        printWindow.document.write(`<!DOCTYPE html><html><head>
            <meta charset="utf-8">
            <title>${titleStr}</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; padding: 20px; }
                h1 { font-size: 24px; margin-bottom: 5px; color: #111; }
                .subtitle { font-size: 14px; color: #666; margin-bottom: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; }
                .rep-totals-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
                .rep-total-card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; text-align: center; background: #fafafa; }
                .rep-total-num { font-size: 18px; font-weight: bold; color: #6366f1; }
                .rep-total-label { font-size: 10px; text-transform: uppercase; color: #777; margin-top: 4px; font-weight: bold; }
                table.rep-results-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; margin-bottom: 20px; }
                table.rep-results-table th { text-align: left; padding: 10px; background: #f2f2f2; color: #555; font-weight: bold; border-bottom: 2px solid #ddd; text-transform: uppercase; font-size: 10px; }
                table.rep-results-table td { padding: 10px; border-bottom: 1px solid #eee; }
                .badge, .badge-generic { padding: 3px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; background: #eee; border: 1px solid #ccc; text-transform: uppercase; color: #333; text-decoration: none; }
                .rep-team-section { page-break-inside: avoid; margin-top: 25px; margin-bottom: 25px; }
                h5 { font-size: 14px; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; color: #6366f1; text-transform: uppercase; margin-top: 20px; }
            </style>
        </head><body>
            <h1>AMC — ${titleStr}</h1>
            <div class="subtitle">Gerado em: ${todayStr} | ${periodText}</div>
            <div class="rep-totals-grid">${totalsContent}</div>
            <div>${tableContent}</div>
            ${'<' + 'script' + '>'}
                window.onload = function() { window.print(); window.close(); };
            ${'<' + '/script' + '>'}
        </body></html>`);
        printWindow.document.close();
    };

    // ── Inicialização: injeta estilos e modal ao carregar a página ───────────
    document.addEventListener('DOMContentLoaded', function () {
        _injectStyles();
        _injectModal();
    });

})();
