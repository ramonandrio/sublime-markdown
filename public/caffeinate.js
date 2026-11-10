/**
 * CAFFEINATE.JS — Evitar que el Mac entre en reposo (botón ☕ de la barra lateral).
 *
 * Opciones de `caffeinate` (macOS): -i el Mac no duerme por inactividad,
 * -d la pantalla sigue encendida, -m los discos no se paran, -s el sistema no
 * duerme (solo con corriente). Duración: hasta desactivarlo, unos minutos, o
 * "mientras Claude trabaja": se enciende cuando alguna sesión trabaja y se
 * apaga sola AUTO_GRACE_MS después de que todas terminen.
 *
 * El proceso lo gestiona main.js (caffeinate-start/stop); va atado al pid de
 * la app con -w, así que al cerrar CompassAI el Mac vuelve a poder dormir.
 */
(function () {
    const api = window.api;
    const btn = document.getElementById('caffeinateBtn');
    if (!api?.caffeinateStart || !btn) return;

    const PREFS_KEY = 'compass_caffeinate_prefs';
    const AUTO_CHECK_MS = 15_000;
    const AUTO_GRACE_MS = 5 * 60_000;
    const FLAGS = [
        { id: 'i', label: 'El Mac', hint: 'No entra en reposo por inactividad. Lo normal.' },
        { id: 'd', label: 'La pantalla', hint: 'Sigue encendida (útil para ver cómo avanza).' },
        { id: 'm', label: 'Los discos', hint: 'No se paran por inactividad.' },
        { id: 's', label: 'Nunca dormir con corriente', hint: 'Ni siquiera en reposo del sistema; solo si está enchufado.' },
    ];
    const DURATIONS = [
        { id: 'forever', label: 'Hasta que lo desactive' },
        { id: '30', label: '30 min' },
        { id: '60', label: '1 h' },
        { id: '120', label: '2 h' },
        { id: '240', label: '4 h' },
        { id: 'custom', label: 'Otro' },
        { id: 'auto', label: 'Mientras Claude trabaja' },
    ];

    let status = { active: false };
    let autoArmed = false;   // modo "mientras Claude trabaja" encendido por el usuario
    let lastBusyAt = 0;
    let autoTimer = null;
    let pop = null;

    const loadPrefs = () => {
        try { return { flags: ['i'], duration: 'forever', custom: 90, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; }
        catch { return { flags: ['i'], duration: 'forever', custom: 90 }; }
    };
    const savePrefs = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* sin storage */ } };

    const fmtLeft = (until) => {
        const m = Math.max(0, Math.round((until - Date.now()) / 60_000));
        return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
    };

    function describe() {
        if (autoArmed && !status.active) return 'Esperando a que una sesión de Claude trabaje';
        if (!status.active) return 'El Mac puede entrar en reposo con normalidad';
        const what = FLAGS.filter(f => status.flags?.includes(f.id)).map(f => f.label.toLowerCase()).join(', ');
        if (status.mode === 'auto') return `Despierto mientras Claude trabaja (${what})`;
        if (status.until) return `Despierto ${fmtLeft(status.until)} más (${what})`;
        return `Despierto hasta que lo desactives (${what})`;
    }

    function paintButton() {
        btn.classList.toggle('caffeinate-on', !!status.active);
        btn.classList.toggle('caffeinate-armed', autoArmed && !status.active);
        btn.title = `Evitar reposo — ${describe()}`;
        btn.setAttribute('aria-pressed', status.active || autoArmed ? 'true' : 'false');
        if (pop && !pop.hidden) paintPopStatus();
    }

    // ── "Mientras Claude trabaja" ──────────────────────────────────────────
    function claudeBusy() {
        const ctrl = window.terminalCtrl;
        if (!ctrl) return false;
        for (const pane of ctrl.panes.values()) {
            // Solo sesiones de agentes: Claude con hooks (estado exacto) o un
            // perfil de IA (Gemini, Aider…). Una shell normal no cuenta.
            const isAgent = pane.agent?.hooksSeen || (pane._profileId && pane._profileId !== 'terminal');
            if (!isAgent) continue;
            const st = ctrl._paneStatus(pane).state;
            if (st === 'working' || st === 'waiting') return true;
        }
        return false;
    }

    async function autoTick() {
        if (!autoArmed) return;
        const prefs = loadPrefs();
        if (claudeBusy()) {
            lastBusyAt = Date.now();
            if (!status.active) status = await api.caffeinateStart({ flags: prefs.flags, mode: 'auto' });
        } else if (status.active && status.mode === 'auto' && Date.now() - lastBusyAt > AUTO_GRACE_MS) {
            status = await api.caffeinateStop();
        }
        paintButton();
    }

    function setAuto(on) {
        autoArmed = on;
        clearInterval(autoTimer);
        if (on) {
            lastBusyAt = 0;
            autoTimer = setInterval(autoTick, AUTO_CHECK_MS);
            autoTick();
        }
        paintButton();
    }

    // ── Panel de opciones ──────────────────────────────────────────────────
    function build() {
        pop = document.createElement('div');
        pop.className = 'caff-pop';
        pop.hidden = true;
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', 'Evitar que el Mac entre en reposo');
        pop.innerHTML = `
            <div class="caff-title">☕ Evitar reposo</div>
            <div class="caff-status"></div>
            <fieldset>
                <legend>Mantener despierto</legend>
                ${FLAGS.map(f => `
                    <label class="caff-opt" title="${escapeHtml(f.hint)}">
                        <input type="checkbox" name="caff-flag" value="${f.id}">
                        <span>${escapeHtml(f.label)} <small>${escapeHtml(f.hint)}</small></span>
                    </label>`).join('')}
            </fieldset>
            <fieldset>
                <legend>Durante</legend>
                <div class="caff-durations">
                    ${DURATIONS.map(d => `
                        <label class="caff-chip${d.id === 'auto' ? ' caff-chip-wide' : ''}">
                            <input type="radio" name="caff-dur" value="${d.id}"><span>${escapeHtml(d.label)}</span>
                        </label>`).join('')}
                </div>
                <label class="caff-custom" hidden>
                    <input type="number" min="5" max="1440" step="5" class="caff-minutes"> minutos
                </label>
                <p class="caff-note caff-auto-note" hidden>Se activa cuando alguna sesión de Claude está trabajando y se desactiva sola 5 min después de que todas terminen.</p>
            </fieldset>
            <p class="caff-note">Cerrar la tapa del portátil lo duerme igualmente (salvo con pantalla externa y corriente). Al cerrar CompassAI, el Mac vuelve a poder dormir.</p>
            <div class="caff-actions">
                <button type="button" class="rv-btn caff-stop">Desactivar</button>
                <button type="button" class="rv-btn rv-primary caff-start">Activar</button>
            </div>`;
        document.body.appendChild(pop);

        const sync = () => {
            const dur = pop.querySelector('input[name="caff-dur"]:checked')?.value;
            pop.querySelector('.caff-custom').hidden = dur !== 'custom';
            pop.querySelector('.caff-auto-note').hidden = dur !== 'auto';
        };
        pop.addEventListener('change', sync);
        pop.querySelector('.caff-start').addEventListener('click', start);
        pop.querySelector('.caff-stop').addEventListener('click', stop);
        pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); btn.focus(); } });
        document.addEventListener('mousedown', (e) => {
            if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) close();
        });
        pop._sync = sync;
    }

    function paintPopStatus() {
        const el = pop.querySelector('.caff-status');
        el.textContent = describe();
        el.classList.toggle('on', !!status.active || autoArmed);
        pop.querySelector('.caff-stop').hidden = !(status.active || autoArmed);
        pop.querySelector('.caff-start').textContent = (status.active || autoArmed) ? 'Aplicar' : 'Activar';
    }

    function open() {
        if (!pop) build();
        const prefs = loadPrefs();
        pop.querySelectorAll('input[name="caff-flag"]').forEach(i => { i.checked = prefs.flags.includes(i.value); });
        const dur = pop.querySelector(`input[name="caff-dur"][value="${prefs.duration}"]`) || pop.querySelector('input[name="caff-dur"]');
        dur.checked = true;
        pop.querySelector('.caff-minutes').value = prefs.custom;
        pop._sync();
        const r = btn.getBoundingClientRect();
        pop.style.top = `${r.bottom + 6}px`;
        pop.style.left = `${Math.max(8, Math.min(r.left - 120, window.innerWidth - 340))}px`;
        pop.hidden = false;
        paintPopStatus();
        pop.querySelector('input[name="caff-flag"]').focus();
    }
    function close() { if (pop) pop.hidden = true; }

    async function start() {
        const flags = [...pop.querySelectorAll('input[name="caff-flag"]:checked')].map(i => i.value);
        if (!flags.length) { window.app?.showToast('Elige al menos qué mantener despierto.', 'warning'); return; }
        const duration = pop.querySelector('input[name="caff-dur"]:checked')?.value || 'forever';
        const custom = Math.max(5, Math.min(1440, Number(pop.querySelector('.caff-minutes').value) || 90));
        savePrefs({ flags, duration, custom });

        if (duration === 'auto') {
            if (status.active && status.mode !== 'auto') status = await api.caffeinateStop();
            setAuto(true);
        } else {
            setAuto(false);
            const minutes = duration === 'forever' ? null : duration === 'custom' ? custom : Number(duration);
            status = await api.caffeinateStart({ flags, minutes, mode: 'manual' });
            if (status.error) window.app?.showToast(escapeHtml(status.error), 'warning');
        }
        paintButton();
        close();
    }

    async function stop() {
        setAuto(false);
        status = await api.caffeinateStop();
        paintButton();
        close();
    }

    btn.addEventListener('click', () => { if (pop && !pop.hidden) close(); else open(); });
    api.onCaffeinateChanged?.((st) => { status = st || { active: false }; paintButton(); });
    api.caffeinateStatus().then((st) => { status = st || { active: false }; paintButton(); }).catch(() => {});
    // El tiempo restante del tooltip/estado se refresca solo.
    setInterval(() => { if (status.until) paintButton(); }, 30_000);

    window.caffeinateCtrl = { open, close, setAuto, status: () => ({ ...status, autoArmed }) };
})();
