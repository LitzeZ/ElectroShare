document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const billInput = document.getElementById('bill-amount');
    const fileUser = document.getElementById('file-user');
    const neighborInput = document.getElementById('neighbor-kwh');
    const labelUser = document.getElementById('name-user');
    const calcBtn = document.getElementById('calc-btn');
    const resultSection = document.getElementById('result-section');
    const copyImageBtn = document.getElementById('copy-image-btn');
    const captureTarget = document.getElementById('capture-target');
    const selectYear = document.getElementById('select-year');
    const selectQuarter = document.getElementById('select-quarter');

    // Init Date Selectors
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 3; i++) {
        const option = document.createElement('option');
        option.value = currentYear - i;
        option.textContent = currentYear - i;
        selectYear.appendChild(option);
    }

    // Detect export capability and set button label accordingly
    if (navigator.canShare && navigator.canShare({ files: [new File([], 'test.png', { type: 'image/png' })] })) {
        copyImageBtn.textContent = 'Tabelle teilen 📤';
    } else if (navigator.clipboard && navigator.clipboard.write) {
        copyImageBtn.textContent = 'Tabelle kopieren 📋';
    } else {
        copyImageBtn.textContent = 'Tabelle speichern ⬇️';
    }

    // LocalStorage helpers
    const STORAGE_KEY = 'electroshare_data';

    function saveState() {
        const data = {
            billAmount: state.billAmount,
            neighborKwh: state.neighborKwh,
            csvText: state.csvText || null,
            csvFileName: state.csvFileName || null,
            selectedYear: selectYear.value,
            selectedQuarter: selectQuarter.value
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Could not save to localStorage', e);
        }
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.warn('Could not load from localStorage', e);
        }
        return null;
    }

    // State
    const state = {
        hasFile: false,
        parsedUser: [],   // parsed once on file load
        csvText: null,    // raw CSV text for localStorage persistence
        csvFileName: null,
        neighborKwh: 0,
        billAmount: 0
    };

    // Event Listeners
    billInput.addEventListener('input', (e) => {
        state.billAmount = parseFloat(e.target.value) || 0;
        saveState();
        checkReady();
    });

    neighborInput.addEventListener('input', (e) => {
        state.neighborKwh = parseFloat(e.target.value) || 0;
        saveState();
        checkReady();
    });

    selectYear.addEventListener('change', () => {
        saveState();
        if (state.hasFile) calculateAndRender();
    });
    selectQuarter.addEventListener('change', () => {
        saveState();
        if (state.hasFile) calculateAndRender();
    });

    fileUser.addEventListener('change', handleFileUpload);
    calcBtn.addEventListener('click', calculateAndRender);

    copyImageBtn.addEventListener('click', async () => {
        const originalText = copyImageBtn.textContent;
        copyImageBtn.textContent = 'Wird erstellt...';

        try {
            const canvas = await html2canvas(captureTarget, {
                scale: window.devicePixelRatio || 2,
                backgroundColor: null,
                useCORS: true
            });

            canvas.toBlob(async (blob) => {
                if (!blob) {
                    alert('Canvas Leer Fehler');
                    copyImageBtn.textContent = originalText;
                    return;
                }

                // Strategy 1: Native Share (Best for Mobile)
                const file = new File([blob], 'stromabrechnung.png', { type: 'image/png' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: 'Stromabrechnung',
                            text: 'Hier ist die Abrechnung.'
                        });
                        copyImageBtn.textContent = 'Geteilt! ✅';
                        setTimeout(() => copyImageBtn.textContent = originalText, 2000);
                        return;
                    } catch (err) {
                        if (err.name === 'AbortError') {
                            copyImageBtn.textContent = originalText;
                            return;
                        }
                        // Non-abort error: fall through to clipboard
                        console.warn('Share failed, trying clipboard', err);
                    }
                }

                // Strategy 2: Clipboard
                try {
                    const item = new ClipboardItem({ 'image/png': blob });
                    await navigator.clipboard.write([item]);
                    copyImageBtn.textContent = 'Kopiert! ✅';
                    setTimeout(() => copyImageBtn.textContent = originalText, 2000);
                    return;
                } catch (err) {
                    console.warn('Clipboard failed', err);
                }

                // Strategy 3: Download Fallback
                try {
                    const link = document.createElement('a');
                    link.download = 'stromabrechnung.png';
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                    copyImageBtn.textContent = 'Gespeichert! ⬇️';
                    setTimeout(() => copyImageBtn.textContent = originalText, 2000);
                } catch (errDownload) {
                    console.error('Download failed', errDownload);
                    alert('Bild konnte leider nicht automatisch exportiert werden. Bitte Screenshot machen.');
                    copyImageBtn.textContent = originalText;
                }
            });

        } catch (err) {
            console.error(err);
            copyImageBtn.textContent = originalText;
            alert('Fehler beim Erstellen des Bildes: ' + err.message);
        }
    });

    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        labelUser.textContent = file.name;
        state.csvFileName = file.name;

        const reader = new FileReader();
        reader.onload = function (e) {
            state.csvText = e.target.result;
            state.parsedUser = parseCSV(e.target.result);
            state.hasFile = true;
            saveState();
            checkReady();
        };
        reader.readAsText(file);
    }

    function checkReady() {
        const ready = state.hasFile && state.neighborKwh > 0 && state.billAmount > 0;
        calcBtn.toggleAttribute('disabled', !ready);
    }

    function parseCSV(csvText) {
        const lines = csvText.split('\n');
        const data = [];

        let headerIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('Charging Start Time') && lines[i].includes('Energy Delivered (kWh)')) {
                headerIndex = i;
                break;
            }
        }

        if (headerIndex === -1) {
            console.error('CSV Headers not found');
            return [];
        }

        const headers = lines[headerIndex].split(',').map(h => h.trim());
        const idxTime = headers.indexOf('Charging Start Time');
        const idxEnergy = headers.indexOf('Energy Delivered (kWh)');

        for (let i = headerIndex + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(',');
            if (parts.length < headers.length) continue;

            const timeStr = parts[idxTime];
            const energyStr = parts[idxEnergy];

            if (timeStr && energyStr) {
                const date = new Date(timeStr);
                const kwh = parseFloat(energyStr);
                if (!isNaN(date.getTime()) && !isNaN(kwh)) {
                    data.push({ date, kwh });
                }
            }
        }
        return data;
    }

    function getQuarter(date) {
        const month = date.getMonth() + 1;
        const q = Math.ceil(month / 3);
        return `${date.getFullYear()} Q${q}`;
    }

    function calculateAndRender() {
        const dataUser = state.parsedUser;

        if (dataUser.length === 0) {
            alert('Fehler beim Lesen der CSV Datei. Bitte Format prüfen.');
            return;
        }

        const selectedYear = selectYear.value;
        const selectedQuarter = selectQuarter.value;
        const targetToken = `${selectedYear} ${selectedQuarter}`;

        // Filter for selected quarter
        const filteredUser = dataUser.filter(d => getQuarter(d.date) === targetToken);

        // Warn if no sessions found for this quarter
        if (filteredUser.length === 0) {
            alert(`Keine Ladesitzungen für ${targetToken} gefunden. Bitte Quartal oder Datei prüfen.`);
            return;
        }

        const sumUser = filteredUser.reduce((acc, curr) => acc + curr.kwh, 0);
        const sumNeighbor = state.neighborKwh;
        const totalKwh = sumUser + sumNeighbor;

        const totalBill = state.billAmount;
        let costUser = 0;
        let costNeighbor = 0;
        let percentUser = 0;
        let percentNeighbor = 0;

        if (totalKwh > 0) {
            percentUser = (sumUser / totalKwh) * 100;
            percentNeighbor = (sumNeighbor / totalKwh) * 100;
            costNeighbor = (sumNeighbor / totalKwh) * totalBill;
            costUser = totalBill - costNeighbor;
        }

        // Render Results – textContent (no layout reflow)
        document.getElementById('quarter-display').textContent = targetToken;
        document.getElementById('total-kwh-result').textContent = totalKwh.toFixed(1);
        document.getElementById('total-cost').textContent = `CHF ${totalBill.toFixed(2)}`;
        document.getElementById('user-kwh-result').textContent = sumUser.toFixed(1);
        document.getElementById('user-percent').textContent = `${percentUser.toFixed(1)}%`;
        document.getElementById('user-cost').textContent = `CHF ${costUser.toFixed(2)}`;
        document.getElementById('neighbor-kwh-result').textContent = sumNeighbor.toFixed(1);
        document.getElementById('neighbor-percent').textContent = `${percentNeighbor.toFixed(1)}%`;
        document.getElementById('neighbor-cost').textContent = `CHF ${costNeighbor.toFixed(2)}`;

        // Only scroll into view on first reveal; subsequent recalcs stay in place
        if (resultSection.classList.contains('hidden')) {
            resultSection.classList.remove('hidden');
            resultSection.scrollIntoView({ behavior: 'smooth' });
        }
    }

    // Restore saved state on load
    const saved = loadState();
    if (saved) {
        if (saved.billAmount) {
            state.billAmount = saved.billAmount;
            billInput.value = saved.billAmount;
        }
        if (saved.neighborKwh) {
            state.neighborKwh = saved.neighborKwh;
            neighborInput.value = saved.neighborKwh;
        }
        if (saved.selectedYear) selectYear.value = saved.selectedYear;
        if (saved.selectedQuarter) selectQuarter.value = saved.selectedQuarter;
        if (saved.csvText) {
            state.csvText = saved.csvText;
            state.parsedUser = parseCSV(saved.csvText);
            state.csvFileName = saved.csvFileName;
            state.hasFile = true;
            labelUser.textContent = saved.csvFileName || 'Gespeicherte Datei';
        }
        checkReady();
    }
});
