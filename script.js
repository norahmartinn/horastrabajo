const STORAGE_KEY = "horaspro-state-v2";

const DEFAULT_STATE = {
    profile: {
        salaryAmount: "",
        period: "monthly",
        currency: "EUR",
        dailyHours: 8,
        weeklyDays: 5,
        vacationDays: 22,
        monthlyGoal: 400,
        alertThreshold: 120
    },
    settings: {
        theme: "system",
        onboardingSeen: false,
        profileEditing: false
    },
    history: [],
    lastResult: null
};

let state = loadState();

document.addEventListener("DOMContentLoaded", () => {
    const elements = getElements();
    migrateLegacyState();
    applyTheme(state.settings.theme);
    hydrateForms();
    bindEvents(elements);
    renderAll(elements);
});

function getElements() {
    return {
        setupScreen: document.getElementById("setup-screen"),
        appShell: document.getElementById("app-shell"),
        profileForm: document.getElementById("profile-form"),
        calculatorForm: document.getElementById("calculator-form"),
        profileStatus: document.getElementById("profile-status"),
        heroHourlyRate: document.getElementById("hero-hourly-rate"),
        heroSchedule: document.getElementById("hero-schedule"),
        heroLastItem: document.getElementById("hero-last-item"),
        heroLastTime: document.getElementById("hero-last-time"),
        resultHeadline: document.getElementById("result-headline"),
        resultCopy: document.getElementById("result-copy"),
        resultHours: document.getElementById("result-hours"),
        resultDays: document.getElementById("result-days"),
        resultImpact: document.getElementById("result-impact"),
        resultSeverity: document.getElementById("result-severity"),
        metricHourly: document.getElementById("metric-hourly"),
        metricTimeMonth: document.getElementById("metric-time-month"),
        metricRecurring: document.getElementById("metric-recurring"),
        metricSavings: document.getElementById("metric-savings"),
        smartInsight: document.getElementById("smart-insight"),
        historyList: document.getElementById("history-list"),
        historySearch: document.getElementById("history-search"),
        historyFilter: document.getElementById("history-filter"),
        toastRegion: document.getElementById("toast-region"),
        themeToggle: document.getElementById("theme-toggle"),
        editProfile: document.getElementById("edit-profile"),
        resetProfile: document.getElementById("reset-profile"),
        exportJson: document.getElementById("export-json"),
        exportCsv: document.getElementById("export-csv"),
        clearResult: document.getElementById("clear-result")
    };
}

function bindEvents(elements) {
    elements.profileForm.addEventListener("submit", (event) => {
        event.preventDefault();
        saveProfile(elements);
    });

    elements.calculatorForm.addEventListener("submit", (event) => {
        event.preventDefault();
        calculateItem(elements);
    });

    elements.historySearch.addEventListener("input", () => renderHistory(elements));
    elements.historyFilter.addEventListener("change", () => renderHistory(elements));

    elements.historyList.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) {
            return;
        }

        const { action, id } = button.dataset;

        if (action === "delete") {
            state.history = state.history.filter((item) => item.id !== id);
            if (state.lastResult && state.lastResult.id === id) {
                state.lastResult = null;
            }
            persistState();
            renderAll(elements);
            showToast(elements, "Compra eliminada", "Tu historial se ha actualizado.");
        }

        if (action === "replay") {
            const item = state.history.find((entry) => entry.id === id);
            if (!item) {
                return;
            }
            state.lastResult = item;
            persistState();
            fillPurchaseForm(item);
            renderResult(elements, item);
            document.getElementById("calculator-panel").scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });

    elements.themeToggle.addEventListener("click", () => {
        const cycle = { system: "light", light: "dark", dark: "system" };
        state.settings.theme = cycle[state.settings.theme];
        persistState();
        applyTheme(state.settings.theme);
        showToast(elements, "Tema actualizado", `Modo ${themeLabel(state.settings.theme)} activado.`);
    });

    elements.editProfile.addEventListener("click", () => {
        state.settings.profileEditing = true;
        persistState();
        renderAppVisibility(elements);
        showToast(elements, "Perfil abierto", "Puedes actualizar tus datos y volver a entrar.");
    });

    elements.resetProfile.addEventListener("click", () => {
        state = cloneState(DEFAULT_STATE);
        persistState();
        hydrateForms();
        renderAll(elements);
        showToast(elements, "Perfil reiniciado", "La app vuelve a la pantalla inicial.");
    });

    elements.exportJson.addEventListener("click", () => exportState("json", elements));
    elements.exportCsv.addEventListener("click", () => exportState("csv", elements));

    elements.clearResult.addEventListener("click", () => {
        state.lastResult = null;
        persistState();
        renderResult(elements, null);
    });
}

function hydrateForms() {
    const { profile } = state;
    document.getElementById("salary-amount").value = profile.salaryAmount;
    document.getElementById("currency").value = profile.currency;
    document.getElementById("period").value = profile.period;
    document.getElementById("daily-hours").value = profile.dailyHours;
    document.getElementById("weekly-days").value = profile.weeklyDays;
    document.getElementById("vacation-days").value = profile.vacationDays;
    document.getElementById("monthly-goal").value = profile.monthlyGoal;
    document.getElementById("alert-threshold").value = profile.alertThreshold;

    if (state.lastResult) {
        fillPurchaseForm(state.lastResult);
    }
}

function saveProfile(elements) {
    const nextProfile = {
        salaryAmount: numberValue(document.getElementById("salary-amount").value),
        currency: document.getElementById("currency").value,
        period: document.getElementById("period").value,
        dailyHours: numberValue(document.getElementById("daily-hours").value),
        weeklyDays: numberValue(document.getElementById("weekly-days").value),
        vacationDays: numberValue(document.getElementById("vacation-days").value),
        monthlyGoal: numberValue(document.getElementById("monthly-goal").value),
        alertThreshold: numberValue(document.getElementById("alert-threshold").value)
    };

    if (!isValidProfile(nextProfile)) {
        showToast(elements, "Perfil incompleto", "Revisa salario, horas y días para continuar.");
        return;
    }

    state.profile = nextProfile;
    state.settings.onboardingSeen = true;
    state.settings.profileEditing = false;
    persistState();
    renderAll(elements);
    showToast(elements, "Perfil guardado", "Ya puedes usar la app solo para calcular compras.");
}

function calculateItem(elements) {
    if (!isValidProfile(state.profile)) {
        state.settings.profileEditing = true;
        persistState();
        renderAppVisibility(elements);
        showToast(elements, "Primero tu perfil", "Necesitamos tus datos base antes de calcular compras.");
        return;
    }

    const name = (document.getElementById("item-name").value || "Compra sin nombre").trim();
    const cost = numberValue(document.getElementById("item-cost").value);
    const category = normalizeCategory(document.getElementById("item-category").value);
    const frequency = document.getElementById("item-frequency").value;
    const notes = document.getElementById("item-notes").value.trim();

    if (!cost || cost <= 0) {
        showToast(elements, "Precio no válido", "Introduce un coste mayor que cero.");
        return;
    }

    const hourlyRate = getHourlyRate(state.profile);
    const monthlyEquivalent = getMonthlyEquivalent(cost, frequency);
    const workHours = cost / hourlyRate;
    const workDays = workHours / state.profile.dailyHours;
    const shareOfMonthlyIncome = monthlyEquivalent / getMonthlyIncome(state.profile);
    const severity = getSeverity(cost, workHours, state.profile.alertThreshold, state.profile.dailyHours);

    const result = {
        id: generateId(),
        name,
        cost,
        category,
        frequency,
        notes,
        workHours,
        workDays,
        monthlyEquivalent,
        shareOfMonthlyIncome,
        severity,
        createdAt: new Date().toISOString()
    };

    state.lastResult = result;
    state.history = [result, ...state.history].slice(0, 60);
    persistState();
    renderAll(elements);
    showToast(elements, `${name} calculado`, `${formatHours(workHours)} de trabajo real.`);
}

function renderAll(elements) {
    renderAppVisibility(elements);
    renderProfileStatus(elements);
    renderHero(elements);
    renderResult(elements, state.lastResult);
    renderMetrics(elements);
    renderInsight(elements);
    renderHistory(elements);
}

function renderAppVisibility(elements) {
    const showSetup = !state.settings.onboardingSeen || !isValidProfile(state.profile) || state.settings.profileEditing;
    elements.setupScreen.hidden = !showSetup;
    elements.appShell.hidden = showSetup;
}

function renderProfileStatus(elements) {
    elements.profileStatus.textContent = isValidProfile(state.profile) ? "Perfil listo" : "Perfil incompleto";
}

function renderHero(elements) {
    if (!isValidProfile(state.profile)) {
        elements.heroHourlyRate.textContent = "--";
        elements.heroSchedule.textContent = "Completa tu perfil para activar el cálculo.";
    } else {
        const hourlyRate = getHourlyRate(state.profile);
        elements.heroHourlyRate.textContent = `${formatCurrency(hourlyRate, state.profile.currency)} / hora`;
        elements.heroSchedule.textContent = `${state.profile.dailyHours} h al día · ${state.profile.weeklyDays} días por semana · ${state.profile.vacationDays} días libres al año`;
    }

    if (!state.lastResult) {
        elements.heroLastItem.textContent = "Sin registrar";
        elements.heroLastTime.textContent = "Aún no has calculado ninguna compra.";
        return;
    }

    elements.heroLastItem.textContent = state.lastResult.name;
    elements.heroLastTime.textContent = `${formatHours(state.lastResult.workHours)} · ${formatCurrency(state.lastResult.cost, state.profile.currency)}`;
}

function renderResult(elements, result) {
    if (!result) {
        elements.resultHeadline.textContent = "Aquí verás cuánto trabajo real te pide cada compra.";
        elements.resultCopy.textContent = "Calcula una compra para ver horas, días e impacto sobre tu objetivo mensual.";
        elements.resultHours.textContent = "--";
        elements.resultDays.textContent = "--";
        elements.resultImpact.textContent = "--";
        elements.resultSeverity.textContent = "--";
        return;
    }

    const monthlyGoal = state.profile.monthlyGoal || 0;
    const goalCopy = monthlyGoal > 0
        ? `${formatCurrency(result.monthlyEquivalent, state.profile.currency)} al mes equivale al ${percentage(result.monthlyEquivalent / monthlyGoal)} de tu objetivo de ahorro.`
        : `${formatCurrency(result.monthlyEquivalent, state.profile.currency)} de impacto mensual equivalente.`;

    elements.resultHeadline.textContent = `${result.name} te cuesta ${formatHours(result.workHours)} de trabajo real.`;
    elements.resultCopy.textContent = goalCopy;
    elements.resultHours.textContent = formatHours(result.workHours);
    elements.resultDays.textContent = `${result.workDays.toFixed(2)} días`;
    elements.resultImpact.textContent = formatCurrency(result.monthlyEquivalent, state.profile.currency);
    elements.resultSeverity.textContent = severityLabel(result.severity);
}

function renderMetrics(elements) {
    if (!isValidProfile(state.profile)) {
        elements.metricHourly.textContent = "--";
        elements.metricTimeMonth.textContent = "--";
        elements.metricRecurring.textContent = "--";
        elements.metricSavings.textContent = "--";
        return;
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthItems = state.history.filter((item) => item.createdAt.startsWith(currentMonth));
    const timeThisMonth = monthItems.reduce((sum, item) => sum + item.workHours, 0);
    const recurringMonthly = state.history.reduce((sum, item) => sum + getMonthlyEquivalent(item.cost, item.frequency), 0);
    const remainingToGoal = Math.max(0, state.profile.monthlyGoal - recurringMonthly);

    elements.metricHourly.textContent = formatCurrency(getHourlyRate(state.profile), state.profile.currency);
    elements.metricTimeMonth.textContent = formatHours(timeThisMonth);
    elements.metricRecurring.textContent = formatCurrency(recurringMonthly, state.profile.currency);
    elements.metricSavings.textContent = formatCurrency(remainingToGoal, state.profile.currency);
}

function renderInsight(elements) {
    const title = elements.smartInsight.querySelector("h4");
    const copy = elements.smartInsight.querySelector("p:last-child");

    if (!state.history.length) {
        title.textContent = "Sin datos todavía";
        copy.textContent = "Tu historial empezará a darte contexto en cuanto guardes compras.";
        return;
    }

    const highSeverity = state.history.filter((item) => item.severity === "high");
    const recurringMonthly = state.history.filter((item) => item.frequency !== "one-time");

    if (highSeverity.length >= 3) {
        title.textContent = "Estás acumulando compras exigentes";
        copy.textContent = `${highSeverity.length} compras ya superan tu umbral importante. Esta categoría merece una pausa antes de decidir.`;
        return;
    }

    if (recurringMonthly.length >= 2) {
        const monthlySum = recurringMonthly.reduce((sum, item) => sum + getMonthlyEquivalent(item.cost, item.frequency), 0);
        title.textContent = "Tus gastos recurrentes pesan más de lo que parece";
        copy.textContent = `Entre hábitos y suscripciones ya comprometes ${formatCurrency(monthlySum, state.profile.currency)} al mes.`;
        return;
    }

    const latest = state.history[0];
    title.textContent = `Última compra: ${latest.name}`;
    copy.textContent = `Te pide ${formatHours(latest.workHours)} de trabajo. Puedes usar el historial para comparar si repites este patrón.`;
}

function renderHistory(elements) {
    const query = elements.historySearch.value.trim().toLowerCase();
    const filter = elements.historyFilter.value;
    const currency = state.profile.currency || "EUR";

    const filtered = state.history.filter((item) => {
        const matchesQuery = !query || `${item.name} ${item.notes}`.toLowerCase().includes(query);
        const matchesFilter =
            filter === "all" ||
            (filter === "high" && item.severity === "high") ||
            (filter === "monthly" && item.frequency === "monthly") ||
            (filter === "yearly" && item.frequency === "yearly");
        return matchesQuery && matchesFilter;
    });

    if (!filtered.length) {
        elements.historyList.innerHTML = '<div class="history-empty">Todavía no hay compras que mostrar con este filtro.</div>';
        return;
    }

    elements.historyList.innerHTML = filtered.map((item) => `
        <article class="history-item">
            <div class="history-top">
                <div>
                    <div class="history-title">${escapeHtml(item.name)}</div>
                    <div class="history-meta">
                        <span>${formatCurrency(item.cost, currency)}</span>
                        <span>${formatHours(item.workHours)}</span>
                        <span>${frequencyLabel(item.frequency)}</span>
                    </div>
                </div>
                <div class="history-actions">
                    <span class="history-tag">${escapeHtml(item.category)}</span>
                    <span class="severity-chip severity-${item.severity}">${severityLabel(item.severity)}</span>
                </div>
            </div>
            <div class="history-bottom">
                <div class="history-meta">
                    <span>${new Date(item.createdAt).toLocaleDateString("es-ES")}</span>
                    <span>${item.notes ? escapeHtml(item.notes) : "Sin notas"}</span>
                </div>
                <div class="history-actions">
                    <button class="history-button" type="button" data-action="replay" data-id="${item.id}">Reutilizar</button>
                    <button class="history-button" type="button" data-action="delete" data-id="${item.id}">Eliminar</button>
                </div>
            </div>
        </article>
    `).join("");
}

function exportState(type, elements) {
    if (!state.history.length) {
        showToast(elements, "Nada que exportar", "Guarda al menos una compra antes de exportar.");
        return;
    }

    if (type === "json") {
        downloadFile("horaspro-export.json", JSON.stringify(state, null, 2), "application/json");
        showToast(elements, "Exportación lista", "Se ha descargado un archivo JSON con tus datos.");
        return;
    }

    const rows = [
        ["fecha", "nombre", "categoria", "precio", "frecuencia", "horas", "dias", "impacto_mensual", "nivel", "notas"],
        ...state.history.map((item) => [
            item.createdAt,
            item.name,
            item.category,
            item.cost,
            item.frequency,
            item.workHours.toFixed(2),
            item.workDays.toFixed(2),
            item.monthlyEquivalent.toFixed(2),
            item.severity,
            item.notes
        ])
    ];

    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    downloadFile("horaspro-historial.csv", csv, "text/csv;charset=utf-8");
    showToast(elements, "CSV descargado", "Tu historial está listo para abrirlo fuera de la app.");
}

function applyTheme(theme) {
    const resolved = theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : theme;
    document.body.dataset.theme = resolved;
}

function migrateLegacyState() {
    const oldV1 = localStorage.getItem("horaspro-state-v1");
    const legacySalary = localStorage.getItem("salary");
    const legacyPeriod = localStorage.getItem("period");

    if (oldV1 && !state.profile.salaryAmount) {
        try {
            const parsed = JSON.parse(oldV1);
            state = mergeDeep(cloneState(DEFAULT_STATE), parsed);
        } catch {
            state = loadState();
        }
    }

    if (legacySalary && !state.profile.salaryAmount) {
        state.profile.salaryAmount = Number(legacySalary);
        state.profile.period = legacyPeriod === "yearly" ? "yearly" : "monthly";
    }

    persistState();
}

function fillPurchaseForm(item) {
    document.getElementById("item-name").value = item.name || "";
    document.getElementById("item-cost").value = item.cost || "";
    document.getElementById("item-category").value = normalizeCategory(item.category);
    document.getElementById("item-frequency").value = item.frequency || "one-time";
    document.getElementById("item-notes").value = item.notes || "";
}

function getHourlyRate(profile) {
    const annualIncome = profile.period === "monthly" ? profile.salaryAmount * 12 : profile.salaryAmount;
    return annualIncome / getAnnualWorkingHours(profile);
}

function getAnnualWorkingHours(profile) {
    const annualDays = Math.max(1, (profile.weeklyDays * 52) - profile.vacationDays);
    return annualDays * profile.dailyHours;
}

function getMonthlyIncome(profile) {
    return profile.period === "monthly" ? profile.salaryAmount : profile.salaryAmount / 12;
}

function getMonthlyEquivalent(cost, frequency) {
    if (frequency === "monthly") {
        return cost;
    }
    if (frequency === "yearly") {
        return cost / 12;
    }
    return cost;
}

function getSeverity(cost, hours, threshold, dailyHours) {
    if (cost >= threshold || hours >= dailyHours) {
        return "high";
    }
    if (cost >= threshold * 0.5 || hours >= dailyHours * 0.35) {
        return "medium";
    }
    return "low";
}

function isValidProfile(profile) {
    return profile.salaryAmount > 0 && profile.dailyHours > 0 && profile.weeklyDays > 0;
}

function normalizeCategory(category) {
    const labels = {
        Tecnologia: "Tecnología",
        Tecnología: "Tecnología",
        Formacion: "Formación",
        Formación: "Formación",
        Hogar: "Hogar",
        Ocio: "Ocio",
        Comida: "Comida",
        Transporte: "Transporte",
        Salud: "Salud",
        Otros: "Otros"
    };
    return labels[category] || "Otros";
}

function frequencyLabel(frequency) {
    return {
        "one-time": "Puntual",
        monthly: "Mensual",
        yearly: "Anual"
    }[frequency] || frequency;
}

function severityLabel(severity) {
    return {
        low: "Baja",
        medium: "Media",
        high: "Alta"
    }[severity] || severity;
}

function themeLabel(theme) {
    return {
        system: "sistema",
        light: "claro",
        dark: "oscuro"
    }[theme] || theme;
}

function formatCurrency(value, currencyCode) {
    return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: currencyCode || "EUR",
        maximumFractionDigits: 2
    }).format(value || 0);
}

function formatHours(hours) {
    if (hours < 1) {
        return `${Math.round(hours * 60)} min`;
    }
    return `${hours.toFixed(2)} h`;
}

function percentage(value) {
    return `${Math.round((value || 0) * 100)}%`;
}

function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function showToast(elements, title, body) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span>`;
    elements.toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3600);
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return cloneState(DEFAULT_STATE);
        }
        return mergeDeep(cloneState(DEFAULT_STATE), JSON.parse(raw));
    } catch {
        return cloneState(DEFAULT_STATE);
    }
}

function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function mergeDeep(target, source) {
    const output = { ...target };
    Object.keys(source || {}).forEach((key) => {
        if (isObject(source[key]) && isObject(target[key])) {
            output[key] = mergeDeep(target[key], source[key]);
        } else {
            output[key] = source[key];
        }
    });
    return output;
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneState(value) {
    return JSON.parse(JSON.stringify(value));
}

function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }
    return `hp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
