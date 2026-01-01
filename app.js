document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const billInput = document.getElementById('bill-amount');
    const fileUser = document.getElementById('file-user');
    const neighborInput = document.getElementById('neighbor-kwh'); // Changed from file input
    const labelUser = document.getElementById('name-user');
    const calcBtn = document.getElementById('calc-btn');
    const resultSection = document.getElementById('result-section');
    const copyBtn = document.getElementById('copy-btn');
    const messageText = document.getElementById('message-text');

    // State
    const state = {
        files: {
            user: null
        },
        neighborKwh: 0,
        billAmount: 0
    };

    // Event Listeners
    billInput.addEventListener('input', (e) => {
        state.billAmount = parseFloat(e.target.value) || 0;
        checkReady();
    });

    neighborInput.addEventListener('input', (e) => {
        state.neighborKwh = parseFloat(e.target.value) || 0;
        checkReady();
    });

    fileUser.addEventListener('change', (e) => handleFileUpload(e));
    calcBtn.addEventListener('click', calculateAndRender);

    copyBtn.addEventListener('click', () => {
        messageText.select();
        document.execCommand('copy');

        const originalText = copyBtn.innerText;
        copyBtn.innerText = 'Kopiert!';
        setTimeout(() => {
            copyBtn.innerText = originalText;
        }, 2000);
    });

    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        labelUser.innerText = file.name;

        const reader = new FileReader();
        reader.onload = function (e) {
            state.files.user = e.target.result;
            checkReady();
        };
        reader.readAsText(file);
    }

    function checkReady() {
        // Require User File and at least one other input (usually both, but let's be flexible-ish)
        // Actually, logic requires both parts to split.
        if (state.files.user && state.neighborKwh > 0 && state.billAmount > 0) {
            calcBtn.removeAttribute('disabled');
        } else {
            // Optional: strict check
            if (state.files.user && state.neighborKwh > 0) {
                calcBtn.removeAttribute('disabled');
            }
        }
    }

    function parseCSV(csvText) {
        // Simple manual parsing
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
            console.error("CSV Headers not found");
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
        const year = date.getFullYear();
        const q = Math.ceil(month / 3);
        return `${year} Q${q}`;
    }

    function calculateAndRender() {
        const dataUser = parseCSV(state.files.user);

        if (dataUser.length === 0) {
            alert('Fehler beim Lesen der CSV Datei. Bitte Format prüfen.');
            return;
        }

        // Determine most recent quarter from User Data
        const allDates = dataUser.map(d => d.date);
        allDates.sort((a, b) => b - a); // Descending

        if (allDates.length === 0) return;

        const latestDate = allDates[0];
        const latestQuarter = getQuarter(latestDate);

        // Filter User Data for that Quarter
        const filteredUser = dataUser.filter(d => getQuarter(d.date) === latestQuarter);

        // Sum User kWh
        const sumUser = filteredUser.reduce((acc, curr) => acc + curr.kwh, 0);

        // Neighbor kWh (Manual Input)
        const sumNeighbor = state.neighborKwh;

        const totalKwh = sumUser + sumNeighbor;

        // Calculate Cost
        const totalBill = state.billAmount;
        let costUser = 0;
        let costNeighbor = 0;
        let percentUser = 0;
        let percentNeighbor = 0;

        if (totalKwh > 0) {
            percentUser = (sumUser / totalKwh) * 100;
            percentNeighbor = (sumNeighbor / totalKwh) * 100;

            // Adjust costs to strictly sum to totalBill if needed, 
            // but simple proportion is usually fine. 
            // Better: CostUser + CostNeighbor should = TotalBill.
            // Let's calc neighbor first as he is the recipient of the bill part usually? 
            // Actually usually "I paid the bill, neighbor pays me back".
            costNeighbor = (sumNeighbor / totalKwh) * totalBill;
            costUser = totalBill - costNeighbor; // Ensure fit
        }

        // Render Results
        document.getElementById('quarter-display').innerText = latestQuarter;

        document.getElementById('total-kwh').innerText = totalKwh.toFixed(0);
        document.getElementById('total-cost').innerText = `CHF ${totalBill.toFixed(2)}`;

        document.getElementById('user-kwh').innerText = sumUser.toFixed(0);
        document.getElementById('user-percent').innerText = `${percentUser.toFixed(1)}%`;
        document.getElementById('user-cost').innerText = `CHF ${costUser.toFixed(2)}`;

        document.getElementById('neighbor-kwh').innerText = sumNeighbor.toFixed(0);
        document.getElementById('neighbor-percent').innerText = `${percentNeighbor.toFixed(1)}%`;
        document.getElementById('neighbor-cost').innerText = `CHF ${costNeighbor.toFixed(2)}`;

        // Generate Message
        const message = `Hoi Nachbar, hier die Stromabrechnung für ${latestQuarter}.
Dein Anteil für ${sumNeighbor.toFixed(0)} kWh (${percentNeighbor.toFixed(1)}%) beträgt CHF ${costNeighbor.toFixed(2)}.

Total Ladestationen: ${totalKwh.toFixed(0)} kWh
Total Rechnung: CHF ${totalBill.toFixed(2)}

Danke und Gruss!`;

        messageText.value = message;

        // Show Results
        resultSection.classList.remove('hidden');
        resultSection.scrollIntoView({ behavior: 'smooth' });
    }
});
