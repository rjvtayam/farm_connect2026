# Farm Connect 2026 🌱

Farm Connect is a comprehensive, multi-tiered web application designed to digitalize and streamline the registration, verification, and approval process of the Registry System for Basic Sectors in Agriculture (RSBSA) and other agricultural programs.

## 👥 System Panels & Roles

The system is built on a strict Role-Based Access Control (RBAC) architecture, divided into four dedicated panels:

1. **Encoder Panel (Data Entry)**
   - Responsible for the initial intake of farmer data.
   - Core features: Digitizing paper forms, managing pending submissions, and tracking real-time data entry statistics.

2. **Verifier Panel (Validation)**
   - Responsible for cross-checking encoded data for accuracy.
   - Core features: Reviewing submitted documents, returning applications with remarks, and approving valid registrations.

3. **MAO Panel (Municipal Agriculture Office)**
   - The final approval authority for the municipality.
   - Core features: Final review of verified applications, generating official reports, and monitoring municipal-wide agricultural demographics.

4. **Admin Panel (System Management)**
   - Complete system oversight and configuration.
   - Core features: User management, global activity monitoring, system health metrics, and managing the global trash/recovery system.

## ✨ Key System Features

- **End-to-End RSBSA Processing:** Fully tracks a farmer's application from initial encoding to final municipal approval.
- **Smart Soft-Delete & Trash Bin:** A robust recovery system preventing accidental data loss. Deleted records are moved to a panel-specific Trash Bin, where they can be restored or permanently purged.
- **Real-Time Dashboards:** Utilizes WebSockets (`Socket.IO`) to provide instant, real-time updates to statistics and activity feeds without requiring page refreshes.
- **Automated PDF Generation:** Automatically generates perfectly formatted, multi-page official government PDF documents from the web form data.
- **Premium UI/UX:** Features a state-of-the-art interface with Glassmorphism elements, micro-animations, responsive design, and full Dark/Light theme support.
- **Enterprise Security:** Secure authentication, encrypted passwords, CSRF protection, and strict role-based routing.

## 🛠️ Technology Stack

- **Backend:** Python, Flask, SQLAlchemy, Socket.IO
- **Database:** PostgreSQL
- **Frontend:** Vanilla JavaScript, HTML5, Custom CSS3 (Premium Glassmorphism Design)
- **Real-Time:** Flask-SocketIO
- **PDF Processing:** PyPDF2 / Custom PDF generation algorithms

---
*Developed for the Farm Connect 2026 Initiative.*
