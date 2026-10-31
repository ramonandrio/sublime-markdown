/**
 * HISTORY.JS — Buscar en el historial (Cmd/Ctrl+K).
 *
 * Busca en las conversaciones de Claude Code (~/.claude/projects) y en el
 * scrollback guardado de los terminales de CompassAI. Desde cada resultado:
 *   - Enter / "Ver": abre la conversación (o el log) en una pestaña de solo lectura.
 *   - Cmd/Ctrl+Enter / "Reanudar": abre un terminal en su carpeta con
 *     `claude --resume <id>`.
 * El índice vive en main.js (history-search / history-open).
 */
(function () {
    const api = window.api;
    if (!api?.historySearch) return;

    let overlay, input, list, status;
    let results = [];
    let selected = 0;
    let timer = null;
    let seq = 0;

    const ago = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        const days = Math.floor((Date.now() - d) / 86_400_000);
        if (days < 1) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        if (days < 7) return `hace ${days} d`;
        return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined });
    };
    const home = (p) => (p || '').replace(/^\/Users\/[^/]+/, '~');
    // Etiqueta de la cuenta (Ajustes > Cuentas) para la carpeta de config.
    let accounts = [];
    const refreshAccounts = async () => { accounts = parseClaudeAccounts(await loadSetting('claude_accounts')); };
    const accountLabel = (dir) => {
        if (!dir) return '';
        return accounts.find(a => sameClaudeDir(a.dir, dir))?.label || dir;
    };

    function build() {
        overlay = document.createElement('div');
        overlay.className = 'hist-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="hist-box" role="dialog" aria-label="Buscar en el historial">
                <div class="hist-search">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                    <input type="text" placeholder="Buscar en conversaciones de Claude y terminales…" spellcheck="false" autocomplete="off">
                    <kbd>Esc</kbd>
                </div>
                <div class="hist-status"></div>
                <ul class="hist-list" role="listbox"></ul>
                <div class="hist-foot"><span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>Enter</kbd> ver</span><span><kbd>⌘</kbd><kbd>Enter</kbd> reanudar</span></div>
            </div>`;
        document.body.appendChild(overlay);
        input = overlay.querySelector('input');
        list = overlay.querySelector('.hist-list');
        status = overlay.querySelector('.hist-status');

        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
        input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 180); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); select(selected + 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); select(selected - 1); }
            else if (e.key === 'Enter') {
                e.preventDefault();
                const r = results[selected];
                if (!r) return;
                if ((e.metaKey || e.ctrlKey) && r.kind === 'claude') resume(r); else view(r);
            } else if (e.key === 'Escape') { e.preventDefault(); close(); }
        });
        list.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-i]');
            if (!li) return;
            const r = results[Number(li.dataset.i)];
            if (e.target.closest('[data-act="resume"]')) resume(r); else view(r);
        });
    }

    function select(i) {
        if (!results.length) return;
        selected = (i + results.length) % results.length;
        list.querySelectorAll('li').forEach((li, k) => li.classList.toggle('active', k === selected));
        list.children[selected]?.scrollIntoView({ block: 'nearest' });
    }

    function snippetHtml(sn) {
        if (!sn) return '';
        const t = sn.text;
        return escapeHtml(t.slice(0, sn.at)) + '<mark>' + escapeHtml(t.slice(sn.at, sn.at + sn.len)) + '</mark>' + escapeHtml(t.slice(sn.at + sn.len));
    }

    async function search() {
        const q = input.value.trim();
        const mine = ++seq;
        status.textContent = q ? 'Buscando…' : 'Recientes';
        let res = [];
        try { res = await api.historySearch(q, { limit: 50 }); } catch { res = []; }
        if (mine !== seq) return; // llegó una búsqueda más nueva
        results = res;
        selected = 0;
        status.textContent = q
            ? (res.length ? `${res.length}${res.length >= 50 ? '+' : ''} resultado(s)` : 'Sin resultados')
            : 'Conversaciones y terminales recientes';
        list.innerHTML = res.map((r, i) => `
            <li data-i="${i}" class="${i === 0 ? 'active' : ''}" role="option">
                <div class="hist-row">
                    <span class="hist-kind" title="${r.kind === 'claude' ? 'Conversación de Claude' : 'Terminal'}">${r.kind === 'claude' ? '✦' : '⌨'}</span>
                    <span class="hist-title">${escapeHtml(r.title || 'Sin título')}</span>
                    <span class="hist-when">${escapeHtml(ago(r.last))}</span>
                </div>
                <div class="hist-meta">${r.kind === 'claude' && accounts.length > 1 ? `<span class="hist-account">${escapeHtml(accountLabel(r.configDir))}</span> ` : ''}${escapeHtml(home(r.cwd) || (r.kind === 'terminal' ? 'Log de terminal' : ''))}${r.prompts ? ` · ${r.prompts} mensaje(s) tuyos` : ''}</div>
                ${r.snippet ? `<div class="hist-snippet">${snippetHtml(r.snippet)}</div>` : ''}
                <div class="hist-actions">
                    <button type="button" class="rv-btn" data-act="view">Ver</button>
                    ${r.kind === 'claude' && r.cwd ? '<button type="button" class="rv-btn rv-primary" data-act="resume">Reanudar</button>' : ''}
                </div>
            </li>`).join('');
    }

    async function view(r) {
        if (!r) return;
        close();
        const data = await api.historyOpen(r.kind, r.id, r.configDir).catch(() => null);
        if (!data) { window.app.showToast('No se pudo abrir ese historial.', 'warning'); return; }
        const body = (window.marked && window.DOMPurify)
            ? DOMPurify.sanitize(marked.parse(data.markdown))
            : `<pre>${escapeHtml(data.markdown)}</pre>`;
        const resumeBtn = r.kind === 'claude' && r.cwd
            ? `<button class="rv-btn rv-primary" data-hist-resume="${escapeHtml(r.id)}" data-hist-cwd="${escapeHtml(r.cwd)}" data-hist-cfg="${escapeHtml(r.configDir || '')}" data-hist-title="${escapeHtml(r.title || '')}">Reanudar en un terminal</button>`
            : '';
        window.app.openVirtualTab({
            id: `history:${r.kind}:${r.id}`,
            name: `${r.kind === 'claude' ? '✦' : '⌨'} ${(r.title || 'Historial').slice(0, 40)}`,
            html: `<div class="history-view">${resumeBtn ? `<div class="history-actions">${resumeBtn}</div>` : ''}${body}</div>`,
        });
    }

    function resume(r) {
        if (!r || r.kind !== 'claude' || !r.cwd) return;
        if (!/^[0-9a-f-]{36}$/i.test(r.id)) return;
        close();
        // Misma cuenta que la conversación: --resume no ve las de otras cuentas.
        window.terminalCtrl?.createTab({
            profile: 'claude', resumeId: r.id, cwd: r.cwd, configDir: r.configDir || '~/.claude',
            fileName: (r.title || 'Claude').slice(0, 30),
        });
    }

    async function open() {
        await refreshAccounts();
        if (!overlay) build();
        overlay.hidden = false;
        input.value = '';
        input.focus();
        search();
    }
    function close() {
        if (overlay) overlay.hidden = true;
    }

    // Cmd/Ctrl+K desde cualquier sitio (también con el foco en un terminal).
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            e.stopPropagation();
            if (overlay && !overlay.hidden) close(); else open();
        }
    }, true);

    // Botón "Reanudar" dentro de una conversación abierta.
    document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-hist-resume]');
        if (!b) return;
        resume({ kind: 'claude', id: b.dataset.histResume, cwd: b.dataset.histCwd, configDir: b.dataset.histCfg, title: b.dataset.histTitle });
    });

    document.getElementById('historySearchBtn')?.addEventListener('click', open);

    window.historyCtrl = { open, close };
})();
