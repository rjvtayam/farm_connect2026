// ID Card Scripts - Handles QR Code Generation and Layout Toggling

document.addEventListener('DOMContentLoaded', () => {
    // Generate QR Code immediately upon load
    generateQRCode();
});

/**
 * Generates the QR Code using the qrcode.js library.
 * It encodes exactly the RSBSA ID so the scanner logic matches perfectly.
 */
function generateQRCode() {
    const qrContainer = document.getElementById("qrcode");
    if (!qrContainer) return;
    
    // Clear any existing just in case
    qrContainer.innerHTML = '';
    
    // Check if the global variable rsbsaId is set (from HTML template)
    if (typeof rsbsaId !== 'undefined' && rsbsaId) {
        new QRCode(qrContainer, {
            text: rsbsaId,
            width: 128,  // Generates high res, CSS shrinks it
            height: 128,
            colorDark : "#1e293b", // Matches --fc-dark
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H // High error correction, great for print
        });
    } else {
        qrContainer.innerHTML = '<span style="font-size:0.5rem;color:red">No Data</span>';
    }
}

/**
 * Switches the layout structure between Vertical and Horizontal.
 * Used by the control buttons.
 * @param {string} layoutType - 'vertical' or 'horizontal'
 */
function switchLayout(layoutType) {
    // Update the body data attribute which controls all CSS rules
    document.body.setAttribute('data-layout', layoutType);
    
    // Update button active states
    document.getElementById('btn-vertical').classList.remove('active');
    document.getElementById('btn-horizontal').classList.remove('active');
    document.getElementById(`btn-${layoutType}`).classList.add('active');
}

// Initial state binding
document.getElementById('btn-vertical').classList.add('active');
