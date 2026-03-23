// --- Global Helper Functions (for inline onclick handlers) ---

function openLocation() {
  // LSPU coordinates
  const lat = 14.413402;
  const lng = 121.447901;
  
  // Check if device is mobile
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      // Open in Google Maps app on mobile
      window.open(`geo:${lat},${lng}?q=${lat},${lng}(LSPU Siniloan Campus)`);
  } else {
      // Open in OpenStreetMap on desktop
      window.open(`https://www.openstreetmap.org/directions?from=&to=${lat}%2C${lng}`);
  }
}

function openEmailForm() {
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
      contactForm.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
          const nameInput = document.getElementById('name');
          if (nameInput) nameInput.focus();
      }, 800);
  }
}

function openCallOptions() {
  const modal = document.getElementById('callModal');
  if (modal) {
      modal.style.display = 'block';
      document.body.style.overflow = 'hidden';
  }
}

function closeCallModal() {
  const modal = document.getElementById('callModal');
  if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
  }
}

// --- Component Initializers ---

function initBannerSlider(sliderId, prevBtnId, nextBtnId) {
  const slider = document.getElementById(sliderId);
  if (!slider) return;

  const slides = slider.querySelectorAll(".banner-slide");
  const prevBtn = document.getElementById(prevBtnId);
  const nextBtn = document.getElementById(nextBtnId);

  let currentSlide = 0;
  let startX;
  let isDragging = false;

  function updateSlider() {
    slider.style.transform = `translateX(-${currentSlide * 100}%)`;
  }

  function nextSlide() {
    currentSlide = (currentSlide + 1) % slides.length;
    updateSlider();
  }

  function prevSlide() {
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    updateSlider();
  }

  if (prevBtn) prevBtn.addEventListener("click", prevSlide);
  if (nextBtn) nextBtn.addEventListener("click", nextSlide);

  // Touch events
  slider.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    isDragging = true;
  });

  slider.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    const x = e.touches[0].clientX;
    const walk = (x - startX) * 2;
    slider.style.transform = `translateX(calc(-${currentSlide * 100}% + ${walk}px))`;
  });

  slider.addEventListener("touchend", (e) => {
    isDragging = false;
    const x = e.changedTouches[0].clientX;
    const walk = x - startX;

    if (Math.abs(walk) > 100) {
      if (walk > 0) prevSlide();
      else nextSlide();
    } else {
      updateSlider();
    }
  });

  // Auto slide
  setInterval(nextSlide, 5000);
}

function initializeFeatures() {
  const featureItems = document.querySelectorAll(".feature-item");
  const mainImage = document.getElementById("mainFeatureImage");
  const mainTitle = document.getElementById("mainFeatureTitle");
  const mainDesc = document.getElementById("mainFeatureDesc");

  if (!featureItems.length || !mainImage) return;

  // Farm Connect Feature Data
  const featureData = {
    1: {
      image: "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=800&q=80",
      title: "Unified Registration Hub",
      description: "A single platform for managing RSBSA, FishR, BoatR, and NCFRS enrollments — eliminating paperwork and ensuring accurate, up-to-date beneficiary records for every barangay.",
    },
    2: {
      image: "https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?auto=format&fit=crop&w=800&q=80",
      title: "Offline-Ready Operations",
      description: "Field-ready system with NFC card authentication and offline queue management, ensuring continuous operation even in remote barangays with limited connectivity.",
    },
    3: {
      image: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=800&q=80",
      title: "Structured Approval Workflow",
      description: "Streamlined data validation pipeline from Encoder to Verifier to MAO-Admin, providing a complete digital audit trail and reducing fraudulent registrations.",
    },
    4: {
      image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
      title: "MAO Analytics Dashboard",
      description: "Real-time visual charts and reports for monitoring registration trends, beneficiary status distribution, and barangay-level program coverage.",
    },
    5: {
      image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=800&q=80",
      title: "Geospatial Farm Mapping",
      description: "Integration with GIS tools to visualize geo-tagged farm parcels and fishing zones, aiding in accurate land use planning and disaster risk assessment.",
    },
    6: {
      image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=800&q=80",
      title: "Multi-Factor Security",
      description: "Enterprise-grade security with multiple layers of protection including Email OTP, Google OAuth integration, and physical NFC card authentication.",
    },
    7: {
      image: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=800&q=80",
      title: "Document Management",
      description: "Secure digital repository for supporting documents (land titles, IDs, certifications), linked directly to beneficiary profiles for easy retrieval.",
    },
    8: {
      image: "https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=800&q=80",
      title: "Municipality Data Isolation",
      description: "Built-in privacy architecture ensuring each Local Government Unit (LGU) can only access and manage their own municipality's beneficiary data.",
    },
  };

  featureItems.forEach((item) => {
    item.addEventListener("click", function () {
      featureItems.forEach((i) => i.classList.remove("active"));
      this.classList.add("active");

      const featureId = this.dataset.feature;
      const feature = featureData[featureId];

      if (feature) {
          mainImage.style.opacity = "0";
          const overlay = document.querySelector(".feature-main-overlay");
          if(overlay) overlay.style.opacity = "0";
    
          setTimeout(() => {
            mainImage.src = feature.image;
            if(mainTitle) mainTitle.textContent = feature.title;
            if(mainDesc) mainDesc.textContent = feature.description;
    
            mainImage.style.opacity = "1";
            if(overlay) overlay.style.opacity = "1";
          }, 300);
      }
    });
  });
}

function initNewsletterForm() {
  const form = document.querySelector(".newsletter-form");
  if (!form) return;

  if (typeof emailjs !== 'undefined') {
      emailjs.init("dsXM4k8iyblu7LBZ4");
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const emailInput = form.querySelector('input[type="email"]');
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(emailInput.value)) {
      showNotification("Please enter a valid email address", "error");
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subscribing...';

      const response = await emailjs.send(
        "service_b1cu7sc",
        "template_k8dbeis",
        {
          to_email: emailInput.value,
          to_name: emailInput.value.split("@")[0],
        },
      );

      if (response.status === 200) {
        showNotification("Successfully subscribed! Check your email.", "success");
        form.reset();
      } else {
        throw new Error("Failed to subscribe");
      }
    } catch (error) {
      console.error("Newsletter subscription error:", error);
      showNotification("Failed to subscribe. Please try again.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  });
}

function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  // Initialize EmailJS if not already initialized
  if (typeof emailjs !== 'undefined') {
      // Re-init with same key just in case, or assume one key for both
      emailjs.init("dsXM4k8iyblu7LBZ4");
  }

  form.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const submitBtn = this.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

      const currentYear = new Date().getFullYear();
      const templateParams = {
          from_name: document.getElementById('name').value,
          from_email: document.getElementById('email').value,
          subject: document.getElementById('subject').value,
          message: document.getElementById('message').value,
          current_year: currentYear
      };

      emailjs.send("service_b1cu7sc", "ft307ah", templateParams)
          .then(function() {
              showNotification('Message sent successfully! We\'ll get back to you soon.', 'success');
              form.reset();
          })
          .catch(function(error) {
              showNotification('Failed to send message. Please try again.', 'error');
              console.error('EmailJS Error:', error);
          })
          .finally(function() {
              submitBtn.disabled = false;
              submitBtn.innerHTML = originalText;
          });
  });
}

function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement || typeof L === 'undefined') return;

    // LSPU coordinates
    const lat = 14.413402;
    const lng = 121.447901;
    
    // Create map
    const map = L.map('map').setView([lat, lng], 15);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Add marker
    const marker = L.marker([lat, lng]).addTo(map);
    
    const popupContent = `
        <div class="map-popup">
            <h3>LSPU Siniloan Campus</h3>
            <p><i class="fas fa-map-marker-alt"></i> L. de Leon St., Siniloan, Laguna</p>
            <p><i class="fas fa-phone"></i> (049) 813-0452</p>
            <p><i class="fas fa-envelope"></i> icts@lspusc.edu.ph</p>
        </div>
    `;
    
    marker.bindPopup(popupContent).openPopup();
}

function showNotification(message, type = "success") {
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
      ${message}
  `;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add("fade-out");
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// --- Initialization ---

document.addEventListener("DOMContentLoaded", function () {
  // Banner Sliders
  initBannerSlider("bannerSlider", "prevBtn", "nextBtn");
  initBannerSlider("resourceBannerSlider", "resourcePrevBtn", "resourceNextBtn");

  // Core Landing Page Features
  initializeFeatures();
  initNewsletterForm();
  initContactForm();
  
  // Map
  initMap();

  // ScrollSpy from base.js (must be available)
  if (typeof initializeScrollSpy === 'function') {
      initializeScrollSpy();
  }

  // Bind global event listeners for modal if elements exist
  // (Alternatively expose functions globally which we did at top)
  
  // Close modal when clicking outside
  window.addEventListener('click', function(event) {
      const modal = document.getElementById('callModal');
      if (modal && event.target === modal) {
          closeCallModal();
      }
  });

  const closeBtn = document.querySelector('.call-modal-close');
  if (closeBtn) {
      closeBtn.addEventListener('click', closeCallModal);
  }
});
