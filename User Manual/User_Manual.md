# Farm Connect — System User Manual

## Table of Contents
1. [Introduction](#introduction)
2. [User Roles & Permissions](#user-roles--permissions)
3. [Authentication & Security](#authentication--security)
    *   [Logging In](#logging-in)
    *   [Two-Factor Authentication (2FA)](#two-factor-authentication-2fa)
    *   [Trusted Devices ("Remember Me")](#trusted-devices-remember-me)
    *   [Account Lockout](#account-lockout)
4. [Community Member Portal](#community-member-portal)
    *   [Registration & Google OAuth](#registration--google-oauth)
    *   [Community Feed & Interactions](#community-feed--interactions)
5. [Registries & Application Forms](#registries--application-forms)
    *   [Digital PDF Downloads](#digital-pdf-downloads)
    *   [Interactive RSBSA Enrollment](#interactive-rsbsa-enrollment)
6. [Administrative & Staff Dashboards](#administrative--staff-dashboards)
    *   [Encoder Panel](#encoder-panel)
    *   [Verifier Panel](#verifier-panel)
    *   [MAO Panel](#mao-panel)
    *   [Admin Panel](#admin-panel)
7. [Troubleshooting & Support](#troubleshooting--support)

---

## 1. Introduction
Welcome to the **Farm Connect** system. Farm Connect is a comprehensive municipal agricultural registry platform. It allows farmers to register their crops, livestock, boats, and fishing gear digitally, while enabling local government staff (Encoders, Verifiers, and Municipal Agriculture Officers) to seamlessly process, map, and approve these registrations in real-time.

---

## 2. User Roles & Permissions
The system dynamically routes users based on their assigned roles. Each role has specific permissions:

*   **Community Member:** General public user. Can access the public community feed, comment on posts, and download/submit agricultural forms.
*   **Encoder:** Data entry staff. Responsible for encoding physical/digital farmer registrations into the system.
*   **Verifier:** Field staff. Responsible for reviewing encoded registrations, verifying farmer location coordinates via built-in GIS maps, and forwarding applications to the MAO.
*   **Municipal Agriculture Officer (MAO):** Department heads. The final authority responsible for officially approving or rejecting crop/livestock registrations.
*   **Admin:** IT/System Administrator. Responsible for creating staff accounts, managing global settings, resetting staff passwords, and monitoring overall system health.

*(Note: Encoders, Verifiers, and MAOs are strictly bound to their assigned **Municipality** and cannot view records from outside their jurisdiction.)*

---

## 3. Authentication & Security
Farm Connect is heavily secured to prevent unauthorized access to sensitive citizen data.

### Logging In
1.  Navigate to the login portal.
2.  Select your **Role** and your **Municipality** from the dropdown menus.
3.  Enter your assigned **Username** and **Password**.
4.  *(Optional)* Toggle the **Remember Me** switch if you are on a personal, secure device.

### Two-Factor Authentication (2FA)
If your account has an email address registered, you will be required to pass 2FA:
1.  After entering your password, the system will email a secure, 6-digit One-Time Password (OTP) to your registered email address.
2.  Enter the OTP into the verification screen before the timer expires.

### Trusted Devices ("Remember Me")
If you toggled **Remember Me** during login, the browser will securely memorize your specific account. 
*   **Same Browser:** Next time you log into your account on that exact browser, the system will **skip the 2FA step** for convenience.
*   **Shared Devices:** Multiple staff members (e.g., an Admin and a Verifier) can safely check "Remember Me" on the same computer without overriding each other's security settings.
*   **Different Devices:** Attempting to log in from a new phone, computer, or Incognito window will **always** trigger a new 2FA request.

### Account Lockout
*   **Warning:** Entering an incorrect password **5 consecutive times** will heavily restrict your account.
*   **Lockout Duration:** You will be locked out for exactly **15 minutes**. Even the Administrator cannot bypass this timeout limit.

---

## 4. Community Member Portal
Designed for the general public and local farmers.

### Registration & Google OAuth
*   Citizens can register manually using an email and password or click **Sign in with Google** for 1-click registration.
*   Upon registration, citizens must verify their email addresses via an emailed confirmation link before logging in.

### Community Feed & Interactions
*   Serves as a digital bulletin board.
*   Members can scroll through agricultural updates, **Like** posts (creating a dynamic color-fill animation), and open **Comment Threads** to interact with their fellow farmers and local government updates.

---

## 5. Registries & Application Forms
Farm Connect bridges the gap between physical and digital document handling.

### Digital PDF Downloads
Community members and staff can download official, printable Department of Agriculture forms dynamically mapped to the system:
*   Fish Registration Form
*   Non-Motorized/Motorized Boat Registration Form
*   NCFRS (National Cocoa/Coffee Farmer Registry System) Form

### Interactive RSBSA Enrollment
The core feature of the platform.
*   Farmers fill out a dynamic Web form for the **Registry System for Basic Sectors in Agriculture (RSBSA)**.
*   **Smart Validation:** The form will reject invalid phone numbers, dates, or ID structures before allowing submission.
*   **Conditional Logic:** The form physically changes based on answers (e.g., typing "Tenant" opens a new box asking for the Landlord's name).
*   **Digital Signatures:** Farmers can sign the document directly on their touchscreen or via mouse.

---

## 6. Administrative & Staff Dashboards
Once logged in, staff are greeted with highly responsive, real-time dashboards equipped with **DataTables** (for sorting/searching) and live-updating **Statistics Cards**.

### Encoder Panel
*   **Primary Duty:** Submit new applications on behalf of farmers.
*   **Queue:** Tracks the status of applications they have submitted (Pending Verification → Pending Approval → Approved/Rejected).

### Verifier Panel
*   **Primary Duty:** Review encoded submissions for accuracy.
*   **Map Integration:** Verifiers can click **View Farm Location** to open an interactive Map Modal, displaying the farmer's stated geolocation coordinates.
*   **Action Flow:** Verifiers review the submission and click **Forward to MAO** (if accurate) or **Reject** (if data is falsified or incorrect).

### MAO Panel
*   **Primary Duty:** Final executive approval.
*   **Action Flow:** MAOs review applications vetted by their Verifiers. They issue the final **Approve** or **Reject** status using secure SweetAlert confirmation popups.

### Admin Panel
*   **Primary Duty:** System oversight.
*   **User Management:** Create new staff members, assign municipalities, and delete terminated accounts.
*   **Live Monitoring:** Features an "Online Users" modal (with dynamic green dot indicators) to see exactly which staff members are currently logged into the system in real-time.
*   **Live Updates:** Because of built-in WebSockets (Socket.IO), as Verifiers and MAOs process applications, the Admin's statistical charts will update live on screen without requiring a page refresh.

---

## 7. Troubleshooting & Support

*   **"I am not receiving my 2FA Email."**
    *   Check your Spam/Junk folder. Ensure the IT admin inputted your email address correctly. Wait 60 seconds before requesting a new code.
*   **"My screen says 'Account Locked'."**
    *   Wait 15 minutes. Ensure Caps Lock is off before trying again.
*   **"I cannot see any records on my table."**
    *   Confirm with the Admin that your account is assigned to the correct Municipality.
*   **"The system says 'Maintenance Mode'."**
    *   The IT team is actively updating the server. Please try again in an hour.
