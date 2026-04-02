/**
 * Scanner Feature - Handles QR Code & NFC scanning, data fetching, and UI population
 */

let html5QrcodeScanner = null;
let nfcController = null;

// Ensure DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if the scanner button is present on the page
    const scanBtn = document.getElementById('scanNfcQrBtn');
    if (scanBtn) {
        scanBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openScannerModal();
        });
    }

    // Modal close handling
    const closeBtn = document.getElementById('scannerModalClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeScannerModal);
    }

    // Method switching logic
    const qrBtn = document.getElementById('btn-method-qr');
    const nfcBtn = document.getElementById('btn-method-nfc');

    if (qrBtn) {
        qrBtn.addEventListener('click', () => switchScannerMethod('qr'));
    }
    
    if (nfcBtn) {
        nfcBtn.addEventListener('click', () => switchScannerMethod('nfc'));
    }
    
    // Scan Again Button
    const scanAgainBtn = document.getElementById('btn-scan-again');
    if (scanAgainBtn) {
        scanAgainBtn.addEventListener('click', resetScanner);
    }
});

function openScannerModal() {
    const modal = document.getElementById('scannerModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        // Default to QR
        switchScannerMethod('qr');
    }
}

function closeScannerModal() {
    const modal = document.getElementById('scannerModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        stopQRScanner();
        stopNFCScanner();
        resetScannerUI();
    }
}

function switchScannerMethod(method) {
    // Update active tab buttons
    document.getElementById('btn-method-qr').classList.toggle('active', method === 'qr');
    document.getElementById('btn-method-nfc').classList.toggle('active', method === 'nfc');

    // Show hiding areas
    document.getElementById('qr-view-area').classList.toggle('active', method === 'qr');
    document.getElementById('nfc-view-area').classList.toggle('active', method === 'nfc');
    
    document.getElementById('scanner-result').classList.remove('active');

    if (method === 'qr') {
        stopNFCScanner();
        startQRScanner();
    } else {
        stopQRScanner();
        startNFCScanner();
    }
}

// ========================================
// QR Scanner Logic (html5-qrcode)
// ========================================
function startQRScanner() {
    // Check if library is loaded
    if (typeof Html5QrcodeScanner === 'undefined') {
        console.error('Html5QrcodeScanner not loaded.');
        return;
    }

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner(
            "qr-reader",
            { fps: 10, qrbox: {width: 250, height: 250}, aspectRatio: 1.0 },
            /* verbose= */ false
        );
    }
    
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

function stopQRScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(error => {
            console.error("Failed to clear html5QrcodeScanner. ", error);
        });
    }
}

function onScanSuccess(decodedText, decodedResult) {
    // Stop scanning once successful
    stopQRScanner();
    
    // Hide scanning areas and show loader
    document.getElementById('qr-view-area').classList.remove('active');
    fetchBeneficiaryData(decodedText);
}

function onScanFailure(error) {
    // handle scan failure, usually better to ignore and keep scanning
    // console.warn(`Code scan error = ${error}`);
}

// ========================================
// NFC Scanner Logic (Web NFC API)
// ========================================
async function startNFCScanner() {
    const statusText = document.getElementById('nfc-status-text');
    const subText = document.getElementById('nfc-sub-text');
    
    if (!('NDEFReader' in window)) {
        statusText.textContent = "NFC Not Supported";
        subText.textContent = "Your device or browser does not support Web NFC. Please use the QR code scanner.";
        statusText.style.color = "#dc2626";
        return;
    }

    try {
        nfcController = new AbortController();
        const ndef = new NDEFReader();
        
        statusText.textContent = "Scanning...";
        subText.textContent = "Bring NFC tag close to back of device";
        statusText.style.color = "#059669";
        
        await ndef.scan({ signal: nfcController.signal });

        ndef.onreadingerror = () => {
            statusText.textContent = "Read Error";
            subText.textContent = "Cannot read data from the NFC tag. Try again.";
            statusText.style.color = "#dc2626";
        };

        ndef.onreading = event => {
            stopNFCScanner();
            const message = event.message;
            let decodedText = "";
            for (const record of message.records) {
                if (record.recordType === "text") {
                    const textDecoder = new TextDecoder(record.encoding);
                    decodedText = textDecoder.decode(record.data);
                    break; // Just grab first text record
                }
            }
            
            if (decodedText) {
                document.getElementById('nfc-view-area').classList.remove('active');
                fetchBeneficiaryData(decodedText);
            } else {
                statusText.textContent = "Invalid Tag";
                subText.textContent = "Tag doesn't contain a valid Text record.";
                statusText.style.color = "#dc2626";
            }
        };

    } catch (error) {
        console.error("Error starting NFC scan: ", error);
        statusText.textContent = "NFC Error";
        subText.textContent = "Please ensure NFC is enabled in settings.";
        statusText.style.color = "#dc2626";
    }
}

function stopNFCScanner() {
    if (nfcController) {
        nfcController.abort();
        nfcController = null;
    }
}

// ========================================
// Data Fetching & UI Population
// ========================================
async function fetchBeneficiaryData(uuid) {
    const loader = document.getElementById('scanner-loader');
    loader.classList.add('active');
    
    try {
        const response = await fetch(`/api/scanner/beneficiary/${encodeURIComponent(uuid)}`);
        const data = await response.json();
        
        loader.classList.remove('active');
        
        if (data.success) {
            populateResultUI(data.beneficiary, data.registrations);
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Not Found',
                text: 'Beneficiary record not found. Please try scanning again.',
                confirmButtonColor: '#059669'
            }).then(() => resetScanner());
        }
    } catch (error) {
        loader.classList.remove('active');
        console.error("Fetch error:", error);
        Swal.fire({
            icon: 'error',
            title: 'Connection Error',
            text: 'Unable to reach the server. Check your connection.',
            confirmButtonColor: '#059669'
        }).then(() => resetScanner());
    }
}

function populateResultUI(ben, regs) {
    // Populate Headers
    const photoEl = document.getElementById('r-photo');
    if (ben.photo_path) {
        photoEl.innerHTML = `<img src="/uploads/${ben.photo_path}" alt="Profile Photo">`;
    } else {
        photoEl.innerHTML = '<i class="fas fa-user-circle"></i>';
    }
    
    document.getElementById('r-name').textContent = ben.full_name;
    document.getElementById('r-rsbsa').textContent = ben.rsbsa_id || 'Pending RSBSA';
    
    // Populate Grid Info
    document.getElementById('r-dob').textContent = ben.date_of_birth || 'N/A';
    document.getElementById('r-gender').textContent = ben.sex || 'N/A';
    document.getElementById('r-contact').textContent = ben.mobile_number || 'N/A';
    
    const address = `${ben.address.street || ''} ${ben.address.barangay || ''}, ${ben.address.municipality || ''}`.trim();
    document.getElementById('r-address').textContent = address || 'N/A';
    
    // Populate Registrations
    const regList = document.getElementById('r-registrations-list');
    regList.innerHTML = '';
    
    if (regs && regs.length > 0) {
        regs.forEach(reg => {
            const dateStr = new Date(reg.submission_date).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric'
            });
            
            let statusClass = 'status-pending';
            if(reg.status === 'approved') statusClass = 'status-approved';
            if(reg.status === 'rejected') statusClass = 'status-rejected';
            
            const card = document.createElement('div');
            card.className = 'reg-card';
            card.innerHTML = `
                <div class="reg-info">
                    <span class="reg-type">${reg.form_type} FORM</span>
                    <span class="reg-date">Submitted: ${dateStr}</span>
                </div>
                <span class="reg-status ${statusClass}">${reg.status}</span>
            `;
            regList.appendChild(card);
        });
    } else {
        regList.innerHTML = '<p style="color: #64748b; font-size: 0.9rem;">No active registrations found.</p>';
    }
    
    // Show Result View
    document.getElementById('scanner-result').classList.add('active');
}

function resetScanner() {
    resetScannerUI();
    // Restart currently active method
    const btnQR = document.getElementById('btn-method-qr');
    switchScannerMethod(btnQR.classList.contains('active') ? 'qr' : 'nfc');
}

function resetScannerUI() {
    document.getElementById('scanner-result').classList.remove('active');
    document.getElementById('scanner-loader').classList.remove('active');
}
