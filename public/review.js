/**
 * REVIEW.JS — Revisión de los cambios que hacen los agentes en los ficheros.
 *
 * main.js guarda, por cada fichero que edita una sesión de Claude, su contenido
 * antes del primer cambio sin revisar ("base"). Aquí se pinta el diff base →
 * disco en una pestaña virtual por sesión, y cada bloque (hunk) se puede
 * aceptar (la base avanza), revertir (se reescribe el fichero) o comentar (el
 * comentario se envía como prompt al pane de Claude que hizo el cambio).
 *
 * Depende de: window.api (preload), window.Diff (jsdiff), window.app
 * (pestañas virtuales, app.js) y window.terminalCtrl (chat.js).
 */
(function () {
    const api = window.api;
    if (!api?.reviewList || !window.Diff) return;

    const MAX_LINES_PER_FILE = 1500; // por encima, se resume (el fichero sigue revisable entero)
    let reviews = [];                // [{ path, paneId, isNew, since, updatedAt }]
    const cache = new Map();         // path → { base, current, isNew, patch }
    const openComment = { key: null }; // hunk con el formulario de comentario abierto

    const tabId = (paneId) => `review:${paneId}`;
    const byPane = (paneId) => reviews.filter(r => r.paneId === paneId);

    function paneName(paneId) {
        const ctrl = window.terminalCtrl;
        const pane = ctrl?.panes.get(paneId);
        return pane ? ctrl._notificationName(pane) : 'Sesión cerrada';
    }

    // Ruta legible: relativa a la carpeta de la sesión o a la abierta en el visor.
    function shortPath(file, paneId) {
        const roots = [window.terminalCtrl?.panes.get(paneId)?.agent?.cwd,
                       localStorage.getItem('pmos_last_folder')].filter(Boolean);
        for (const r of roots) if (file.startsWith(r + '/')) return file.slice(r.length + 1);
        return file.replace(/^\/Users\/[^/]+/, '~');
    }

    async function load(file) {
        const data = await api.reviewGet(file);
        if (!data) { cache.delete(file); return null; }
        const base = data.base ?? '';
        const current = data.current ?? '';
        const patch = Diff.structuredPatch(file, file, base, current, '', '', { context: 3 });
        const entry = { ...data, base, current, deleted: data.current === null, patch };
        cache.set(file, entry);
        return entry;
    }

    // Líneas cambiadas de un bloque, sin el contexto: "líneas 4–6" (versión nueva).
    function changedRange(h) {
        let n = h.newStart, first = null, last = null, delAt = null;
        for (const line of h.lines) {
            const k = line[0];
            if (k === '\\') continue;
            if (k === '+') { first ??= n; last = n; n++; }
            else if (k === '-') { delAt ??= n; }
            else n++;
        }
        if (first == null) return `línea ${delAt ?? h.newStart} (borrado)`;
        return first === last ? `línea ${first}` : `líneas ${first}–${last}`;
    }

    // ── Pintado ────────────────────────────────────────────────────────────
    function stats(patch) {
        let add = 0, del = 0;
        for (const h of patch.hunks) for (const l of h.lines) {
            if (l[0] === '+') add++; else if (l[0] === '-') del++;
        }
        return { add, del };
    }

    function hunkHtml(file, h, i) {
        let o = h.oldStart, n = h.newStart, rows = '';
        for (const line of h.lines) {
            const kind = line[0];
            if (kind === '\\') continue; // "\ No newline at end of file"
            const text = escapeHtml(line.slice(1)) || '&nbsp;';
            if (kind === '+') rows += `<tr class="rv-add"><td></td><td>${n++}</td><td class="rv-sign">+</td><td class="rv-code">${text}</td></tr>`;
            else if (kind === '-') rows += `<tr class="rv-del"><td>${o++}</td><td></td><td class="rv-sign">−</td><td class="rv-code">${text}</td></tr>`;
            else rows += `<tr><td>${o++}</td><td>${n++}</td><td class="rv-sign"></td><td class="rv-code">${text}</td></tr>`;
        }
        const key = `${file}#${i}`;
        const range = changedRange(h);
        const comment = openComment.key === key ? `
            <form class="rv-comment" data-rv-file="${escapeHtml(file)}" data-rv-hunk="${i}">
                <textarea placeholder="Qué quieres que cambie Claude en este bloque…" rows="2"></textarea>
                <div class="rv-comment-actions">
                    <button type="button" class="rv-btn" data-rv-action="comment-cancel">Cancelar</button>
                    <button type="submit" class="rv-btn rv-primary">Enviar a la sesión</button>
                </div>
            </form>` : '';
        return `
            <div class="rv-hunk">
                <div class="rv-hunk-head">
                    <span>@@ ${range}</span>
                    <span class="rv-actions">
                        <button class="rv-btn" data-rv-action="hunk-accept" data-rv-file="${escapeHtml(file)}" data-rv-hunk="${i}" title="Dar este bloque por bueno">Aceptar</button>
                        <button class="rv-btn" data-rv-action="hunk-revert" data-rv-file="${escapeHtml(file)}" data-rv-hunk="${i}" title="Deshacer este bloque en el fichero">Revertir</button>
                        <button class="rv-btn" data-rv-action="comment-open" data-rv-key="${escapeHtml(key)}" title="Pedir un cambio a la sesión de Claude">Comentar</button>
                    </span>
                </div>
                <table class="rv-lines">${rows}</table>
                ${comment}
            </div>`;
    }

    function fileHtml(entry, paneId) {
        const { add, del } = stats(entry.patch);
        const label = entry.deleted ? '<span class="rv-tag rv-tag-del">eliminado</span>'
            : entry.isNew ? '<span class="rv-tag rv-tag-new">nuevo</span>' : '';
        let lines = 0;
        const hunks = [];
        for (let i = 0; i < entry.patch.hunks.length; i++) {
            lines += entry.patch.hunks[i].lines.length;
            if (lines > MAX_LINES_PER_FILE) {
                hunks.push(`<p class="rv-note">El diff sigue (${entry.patch.hunks.length - i} bloques más). Usa "Aceptar fichero" o "Revertir fichero", o ábrelo.</p>`);
                break;
            }
            hunks.push(hunkHtml(entry.path, entry.patch.hunks[i], i));
        }
        const f = escapeHtml(entry.path);
        return `
            <section class="rv-file">
                <header class="rv-file-head">
                    <span class="rv-file-name" title="${f}">${escapeHtml(shortPath(entry.path, paneId))}</span>
                    ${label}
                    <span class="rv-stat"><span class="rv-plus">+${add}</span> <span class="rv-minus">−${del}</span></span>
                    <span class="rv-actions">
                        ${entry.deleted ? '' : `<button class="rv-btn" data-rv-action="file-open" data-rv-file="${f}">Abrir</button>`}
                        <button class="rv-btn" data-rv-action="file-revert" data-rv-file="${f}">Revertir fichero</button>
                        <button class="rv-btn rv-primary" data-rv-action="file-accept" data-rv-file="${f}">Aceptar fichero</button>
                    </span>
                </header>
                ${hunks.join('') || '<p class="rv-note">Sin diferencias de texto.</p>'}
            </section>`;
    }

    async function render(paneId) {
        const id = tabId(paneId);
        const files = byPane(paneId);
        const entries = (await Promise.all(files.map(r => load(r.path)))).filter(Boolean);
        const pane = window.terminalCtrl?.panes.get(paneId);
        const body = entries.length
            ? entries.map(e => fileHtml(e, paneId)).join('')
            : '<p class="rv-done">✓ No quedan cambios por revisar en esta sesión.</p>';
        const html = `
            <div class="review-view" data-rv-pane="${escapeHtml(paneId)}">
                <header class="rv-head">
                    <div>
                        <h1>Cambios de ${escapeHtml(paneName(paneId))}</h1>
                        <p>${entries.length} fichero(s) cambiado(s) por la sesión desde la última revisión.
                           Aceptar da el cambio por bueno; Revertir lo deshace en el fichero; Comentar se lo pide a Claude.</p>
                    </div>
                    <span class="rv-actions">
                        ${pane ? '<button class="rv-btn" data-rv-action="go-pane">Ir a la sesión</button>' : ''}
                        ${entries.length ? '<button class="rv-btn rv-primary" data-rv-action="all-accept">Aceptar todo</button>' : ''}
                    </span>
                </header>
                ${body}
            </div>`;
        if (!window.app.updateVirtualTab(id, html)) {
            window.app.openVirtualTab({ id, name: `Δ ${paneName(paneId)}`, html });
        }
    }

    // Repinta las pestañas de revisión abiertas (tras un cambio en la lista).
    function rerenderOpen() {
        const panes = new Set(reviews.map(r => r.paneId));
        document.querySelectorAll('.review-view[data-rv-pane]').forEach(el => panes.add(el.dataset.rvPane));
        for (const p of panes) if (window.app.hasTab(tabId(p))) render(p);
    }

    // ── Acciones ───────────────────────────────────────────────────────────
    async function apply(file, change) {
        const res = await api.reviewApply(file, change);
        if (res?.conflict) {
            window.app.showToast('El fichero ha cambiado mientras revisabas. Vuelve a mirarlo.', 'warning', 5000);
        } else if (!res?.ok) {
            window.app.showToast(`No se pudo aplicar: ${escapeHtml(res?.error || 'error desconocido')}`, 'warning', 5000);
        }
        return !!res?.ok;
    }

    async function onAction(btn) {
        const action = btn.dataset.rvAction;
        const view = btn.closest('.review-view');
        const paneId = view?.dataset.rvPane;
        const file = btn.dataset.rvFile;
        const e = file ? cache.get(file) : null;
        const hunk = e && btn.dataset.rvHunk != null ? e.patch.hunks[Number(btn.dataset.rvHunk)] : null;

        switch (action) {
            case 'go-pane':
                window.terminalCtrl?._focusPane(paneId);
                return;
            case 'file-open':
                window.app.openFile(file);
                return;
            case 'comment-open':
                openComment.key = btn.dataset.rvKey;
                await render(paneId);
                document.querySelector('.rv-comment textarea')?.focus();
                return;
            case 'comment-cancel':
                openComment.key = null;
                await render(paneId);
                return;
            case 'hunk-accept': {
                if (!hunk) return;
                const newBase = Diff.applyPatch(e.base, { hunks: [hunk] });
                if (newBase === false) return window.app.showToast('No se pudo aceptar el bloque; acepta el fichero entero.', 'warning');
                await apply(file, { newBase });
                break;
            }
            case 'hunk-revert': {
                if (!hunk) return;
                const reverted = Diff.applyPatch(e.current, Diff.reversePatch({ hunks: [hunk] }));
                if (reverted === false) return window.app.showToast('No se pudo revertir el bloque; el fichero ha cambiado.', 'warning');
                await apply(file, { expectedCurrent: e.deleted ? null : e.current, newCurrent: reverted });
                break;
            }
            case 'file-accept':
                if (!e) return;
                await apply(file, e.deleted ? { newBase: null } : { newBase: e.current });
                break;
            case 'file-revert': {
                if (!e) return;
                const what = e.isNew ? 'Se borrará el fichero, que creó la sesión.' : 'El fichero volverá a como estaba antes de los cambios.';
                const ok = await window.app.showConfirm(`¿Revertir ${shortPath(file, paneId)}? ${what}`, { okLabel: 'Revertir', danger: true });
                if (!ok) return;
                await apply(file, { expectedCurrent: e.deleted ? null : e.current, newCurrent: e.isNew ? null : e.base });
                break;
            }
            case 'all-accept':
                for (const r of byPane(paneId)) {
                    const x = cache.get(r.path) || await load(r.path);
                    if (x) await apply(r.path, x.deleted ? { newBase: null } : { newBase: x.current });
                }
                break;
        }
        // reviews-changed repinta; por si no llega (sin cambios en la lista), forzarlo.
        render(paneId);
    }

    function sendComment(form) {
        const view = form.closest('.review-view');
        const paneId = view?.dataset.rvPane;
        const e = cache.get(form.dataset.rvFile);
        const hunk = e?.patch.hunks[Number(form.dataset.rvHunk)];
        const text = form.querySelector('textarea').value.replace(/\s+/g, ' ').trim();
        if (!text || !hunk) return;
        const pane = window.terminalCtrl?.panes.get(paneId);
        // Solo a una sesión de Claude viva: si Claude ya salió, el pane es una
        // shell y el comentario se ejecutaría como un comando.
        if (!pane || pane._exited || !pane.agent?.hooksSeen) {
            window.app.showToast('Esa sesión de Claude ya no está activa: no se puede enviar el comentario.', 'warning', 5000);
            return;
        }
        const range = changedRange(hunk);
        const prompt = `Sobre tu cambio en ${shortPath(e.path, paneId)} (${range}): ${text}`;
        api.terminalInput(paneId, prompt);
        setTimeout(() => api.terminalInput(paneId, '\r'), 150);
        openComment.key = null;
        render(paneId);
        window.app.showToast('Comentario enviado a la sesión', 'success', 2500);
    }

    document.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.review-view [data-rv-action]');
        if (btn) { ev.preventDefault(); onAction(btn); }
    });
    document.addEventListener('submit', (ev) => {
        const form = ev.target.closest('.review-view .rv-comment');
        if (form) { ev.preventDefault(); sendComment(form); }
    });
    document.addEventListener('keydown', (ev) => {
        // Cmd/Ctrl+Enter envía el comentario
        if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && ev.target.closest?.('.rv-comment')) {
            ev.preventDefault();
            sendComment(ev.target.closest('.rv-comment'));
        }
    });

    function setList(list) {
        reviews = Array.isArray(list) ? list : [];
        window.terminalCtrl?._refreshDashboard?.();
        rerenderOpen();
    }
    api.onReviewsChanged?.(setList);
    api.reviewList().then(setList).catch(() => {});

    window.reviewCtrl = {
        byPane: (paneId) => byPane(paneId),
        openForPane: (paneId) => render(paneId),
    };
})();
