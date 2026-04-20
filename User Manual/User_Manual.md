# Farm Connect 2026 — System User Manual

> **Version:** 2.0 (Production Release)  
> **Last Updated:** April 25, 2026  
> **Scope:** Municipality of Mabitac, Laguna  
> **System:** Farm Connect 2026 — Registry System for Basic Sectors in Agriculture

---

## Table of Contents
1. [Introduction](#1-introduction)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Authentication & Security](#3-authentication--security)
    * [Staff Login Portal](#staff-login-portal)
    * [Two-Factor Authentication (2FA)](#two-factor-authentication-2fa)
    * [Trusted Devices ("Remember Me")](#trusted-devices-remember-me)
    * [Account Lockout](#account-lockout)
    * [Password Reset](#password-reset)
4. [Community Member Portal](#4-community-member-portal)
    * [Registration & Google OAuth](#registration--google-oauth)
    * [Community Feed & Interactions](#community-feed--interactions)
5. [Registries & Application Forms](#5-registries--application-forms)
    * [Digital PDF Downloads](#digital-pdf-downloads)
    * [Interactive RSBSA Enrollment Form](#interactive-rsbsa-enrollment-form)
    * [Fish Registration Form](#fish-registration-form)
    * [Boat Registration Form (Motorized / Non-Motorized)](#boat-registration-form)
    * [NCFRS Form (National Coffee/Cocoa Farmer Registry System)](#ncfrs-form)
6. [Encoder Panel](#6-encoder-panel)
    * [Dashboard & Statistics Cards](#encoder-dashboard)
    * [Submission Management Table](#encoder-submissions)
    * [Submitting a New Registration](#submitting-a-new-registration)
    * [Editing a Rejected Submission](#editing-a-rejected-submission)
    * [Analytics Tab](#encoder-analytics)
    * [Reports & CSV Export](#encoder-reports)
    * [Activity Feed](#encoder-activity-feed)
    * [Trash Bin (Soft-Delete)](#encoder-trash-bin)
    * [Notifications](#encoder-notifications)
7. [Verifier Panel](#7-verifier-panel)
    * [Dashboard & Statistics Cards](#verifier-dashboard)
    * [Submission Review Table](#verifier-submissions)
    * [Reviewing a Submission (Verify / Reject)](#verifier-review)
    * [GIS Map Integration](#verifier-gis-map)
    * [Record Locking (Concurrency Control)](#verifier-record-locking)
    * [Bulk Review](#verifier-bulk-review)
    * [Analytics Tab](#verifier-analytics)
    * [Reports & CSV Export](#verifier-reports)
    * [Global GIS Map](#verifier-global-gis)
    * [Trash Bin](#verifier-trash-bin)
    * [Notifications](#verifier-notifications)
8. [MAO Panel (Municipal Agriculture Office)](#8-mao-panel)
    * [Dashboard & Statistics Cards](#mao-dashboard)
    * [Registrations Table](#mao-registrations)
    * [Final Approval / Rejection](#mao-approval)
    * [RSBSA ID Auto-Generation](#rsbsa-id-generation)
    * [Bulk Approval](#mao-bulk-approval)
    * [Approved Beneficiaries List](#mao-beneficiaries)
    * [Digital ID Card Generation & Printing](#mao-id-card)
    * [Analytics Tab](#mao-analytics)
    * [Reports & CSV Export](#mao-reports)
    * [Trash Bin](#mao-trash-bin)
    * [Notifications](#mao-notifications)
9. [Admin Panel](#9-admin-panel)
    * [Dashboard & Statistics Cards](#admin-dashboard)
    * [Staff User Management (CRUD)](#admin-user-management)
    * [Community Member Management](#admin-community-management)
    * [Online Users Monitor](#admin-online-users)
    * [Activity Feed (Audit Log)](#admin-activity-feed)
    * [GIS Command Center Map](#admin-gis-map)
    * [Global Trash Bin](#admin-trash-bin)
    * [System Health Dashboard](#admin-system-health)
    * [Admin Controls](#admin-controls)
    * [Notifications](#admin-notifications)
10. [Shared Panel Features](#10-shared-panel-features)
    * [Settings Dashboard](#settings-dashboard)
    * [Dark / Light Theme Toggle](#dark-light-theme)
    * [Real-Time WebSocket Updates](#real-time-updates)
    * [Notification Bell](#notification-bell)
11. [Troubleshooting & FAQ](#11-troubleshooting--faq)

---

## 1. Introduction

Welcome to **Farm Connect 2026**. Farm Connect is a comprehensive, multi-tiered web application developed for the Municipality of Mabitac, Laguna. It digitalizes and streamlines the registration, verification, and approval process of the Registry System for Basic Sectors in Agriculture (RSBSA) and other Department of Agriculture programs (Fish, Boat, NCFRS).

The system is built on a strict **Role-Based Access Control (RBAC)** architecture and features real-time data updates via WebSockets, interactive GIS mapping, automated PDF and ID card generation, a community engagement portal, and a fully premium glassmorphism-styled UI with dark/light theme support.

**Technology Stack:**
- **Backend:** Python, Flask, SQLAlchemy, Flask-SocketIO
- **Database:** PostgreSQL
- **Frontend:** Vanilla JavaScript, HTML5, Custom CSS3 (Glassmorphism Design System)
- **Real-Time:** WebSockets via Socket.IO
- **PDF:** Custom server-side PDF generation engine (PyPDF2)
- **GIS:** Leaflet.js with satellite tile layers and drawing controls

---

## 2. User Roles & Permissions

The system dynamically routes users to their role-specific dashboard upon login. Each role has strictly enforced permissions:

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| **Community Member** | General public / Farmer | Access the public community feed; post, react, and comment on updates; download and submit agricultural forms. |
| **Encoder** | Data Entry Staff | Encode farmer registrations (RSBSA, Fish, Boat, NCFRS); view personal submission queue; edit rejected submissions; export own data to CSV. |
| **Verifier** | Field Verification Staff | Review pending submissions; verify or reject with remarks; draw farm parcel boundaries on the GIS map; lock records for exclusive review; bulk verify/reject. |
| **MAO** | Municipal Agriculture Officer | Final approval/rejection authority; auto-generate RSBSA IDs upon approval; bulk approve; view approved beneficiaries; generate and print digital ID cards; export reports. |
| **Admin** | IT / System Administrator | Full system oversight; create/edit/delete staff accounts; monitor online users; view system health (CPU, RAM, DB latency); toggle maintenance mode; broadcast alerts; force logout all users; manage global trash bin. |

> **Important:** Encoders, Verifiers, and MAOs are strictly bound to their assigned **Municipality** and cannot view or modify records from other jurisdictions.

---

## 3. Authentication & Security

Farm Connect is secured with multi-layer authentication to protect sensitive citizen data.

### Staff Login Portal
1. Navigate to the login page (the system landing page).
2. Select your **Role** from the dropdown menu (Encoder, Verifier, MAO, or Admin).
3. Select your **Municipality** from the dropdown menu.
4. Enter your assigned **Username** and **Password**.
5. *(Optional)* Toggle the **Remember Me** switch if you are on a trusted, personal device.
6. Click **Sign In**.

### Two-Factor Authentication (2FA)
If your account has an email address registered, you will be required to pass 2FA after entering your password:
1. The system sends a secure, **6-digit One-Time Password (OTP)** to your registered email address.
2. Enter the OTP into the verification screen before the timer expires.
3. If you do not receive the code, check your Spam/Junk folder. You may request a new code after the timer expires.

### Trusted Devices ("Remember Me")
If you toggled **Remember Me** during login:
- **Same Browser:** The system will **skip the 2FA step** on subsequent logins from that specific browser.
- **Multi-Account Support:** Multiple staff members (e.g., an Admin and a Verifier) can each have their own "Remember Me" active on the same computer without overriding each other. The system uses per-user device cookies (`trusted_device_{user_id}`).
- **New Devices:** Logging in from a new phone, computer, or Incognito window will **always** trigger a fresh 2FA verification.

### Account Lockout
- **Warning:** Entering an incorrect password **5 consecutive times** will lock your account.
- **Lockout Duration:** Exactly **15 minutes**. Even the Administrator cannot bypass this timer.
- After 15 minutes, the lockout resets automatically. Ensure Caps Lock is off before trying again.

### Password Reset
1. Click the **"Forgot Password?"** link on the login page.
2. Enter your registered email address.
3. A secure password reset link will be sent to your email.
4. Click the link and enter your new password.
5. The system will validate password strength before allowing the reset.

---

## 4. Community Member Portal

The Community Portal is the public-facing module designed for farmers and citizens.

### Registration & Google OAuth
- Citizens can register using a standard **email and password** form.
- Alternatively, click **"Sign in with Google"** for instant 1-click registration via Google OAuth 2.0.
- Upon manual registration, citizens must **verify their email** via an emailed confirmation link before accessing the system.

### Community Feed & Interactions
The Community Feed serves as a digital bulletin board for agricultural updates:
- **Scrolling Timeline:** Browse posts from the Municipal Agriculture Office, staff, and fellow farmers.
- **Topic Filtering:** Filter posts by topic (Crops, Livestock, Fishery, Market, Tips, Events, General).
- **Search:** Full-text search across all post content.
- **Create Posts:** Authenticated members can write text posts with optional image attachments and topic tags.
- **Reactions:** React to posts with animated color-fill icons (Like, Love, Haha, Wow, Sad, Angry). Clicking the same reaction again removes it.
- **Comment Threads:** Open collapsible comment threads to discuss specific posts. Comments are displayed in chronological order.
- **Post Deletion:** Users can delete their own posts. Admins can delete any post.
- **Activity Stats:** View your personal engagement metrics (My Posts, My Reactions, My Comments) alongside community-wide totals.
- **Pagination:** Posts load in pages of 15, with infinite-scroll or "Load More" behavior.

---

## 5. Registries & Application Forms

Farm Connect bridges physical and digital document handling for the Department of Agriculture.

### Digital PDF Downloads
Staff and community members can download official, printable, pre-formatted PDF forms:
- **Fish Registration Form** — For registering fisherfolk and their fishing activities.
- **Boat Registration Form** — For registering motorized and non-motorized fishing vessels.
- **NCFRS Form** — National Coffee/Cocoa Farmer Registry System form.

These PDFs are dynamically mapped from the web form submissions into the correct government template fields using the server-side PDF generation engine.

### Interactive RSBSA Enrollment Form
The flagship form of the platform:
- **Multi-Step Wizard:** The form is broken into logical sections: Personal Information, Address, Farm Profile, Parcel Details, Crop/Livestock Data, and Digital Signature.
- **Smart Validation:** Real-time validation rejects invalid phone numbers, dates, and government ID formats before submission.
- **Conditional Logic:** The form dynamically adapts based on user answers. For example, selecting "Tenant" as farming activity type opens a follow-up field for the landowner's name.
- **Digital Signatures:** Farmers can sign the form directly on their touchscreen device or with a mouse/trackpad.
- **Profile Image Upload:** Capture or upload a profile photo for the beneficiary's record.
- **Parcel Coordinates:** Enter latitude/longitude of farm parcels (can also be drawn on the map by Verifiers later).

### Fish Registration Form
- Captures personal information, emergency contacts, fishing gear details, and vessel associations.
- Nested data structure with sections for `personalInfo`, `address`, `emergencyContact`, and `fishingDetails`.

### Boat Registration Form
- Captures vessel owner information, boat specifications (hull material, engine type, tonnage), and registration details.
- Data structured under `owner` and `vessel` sections.

### NCFRS Form
- Captures coffee/cocoa farmer details including personal information, farm location, plantation size, and crop variety data.
- Structured with `personalInfo` and `address` nested sections.

---

## 6. Encoder Panel

The Encoder Panel is the data entry workstation for staff responsible for digitizing farmer registrations.

### Dashboard & Statistics Cards {#encoder-dashboard}
Upon login, Encoders see a real-time dashboard with stat cards showing:
- **Total Submitted** — Count of all their personal submissions (excluding deleted).
- **Approved** — Submissions that passed final MAO approval.
- **Verified** — Submissions that passed Verifier review (awaiting MAO decision).
- **Pending** — Submissions awaiting Verifier review.
- **Rejected** — Submissions returned for correction.

Each card displays a **trend indicator** (percentage change vs. 30 days ago) with up/down arrows.

### Submission Management Table {#encoder-submissions}
- A paginated, sortable **DataTable** displaying all submissions by the logged-in Encoder.
- Columns: ID, Beneficiary Name, Form Type, Barangay, Status, Date Submitted.
- **Color-Coded Badges:** Each form type (RSBSA, Fish, Boat, NCFRS) has a unique color badge.
- **Status Badges:** Visual indicators for Pending (yellow), Verified (blue), Approved (green), Rejected (red).
- **Search:** Filter records by beneficiary name, barangay, or form type.
- **Filters:** Dropdown filters for Status and Form Type.

### Submitting a New Registration
1. Click the **"New Submission"** button.
2. Select the form type (RSBSA, Fish, Boat, or NCFRS).
3. Fill in the beneficiary's information. Required fields are marked with asterisks.
4. For RSBSA: Complete all wizard steps, upload a photo, draw signature, and specify farm parcels.
5. Click **Submit**. The system will:
   - Create a new Beneficiary record.
   - Create a new Registration record with status `pending`.
   - Invalidate dashboard caches for the Encoder, Verifiers, and MAOs in the same municipality.
   - Send real-time Socket.IO notifications to all Verifiers and MAOs alerting them of the new submission.
   - Create in-app Notification records for each Verifier and MAO.

### Editing a Rejected Submission
1. Locate the rejected submission in your table (it will have a red "Rejected" badge).
2. Click the **Edit** action button.
3. The system opens the form pre-filled with the existing data.
4. Make the necessary corrections.
5. Click **Update**. The status automatically resets from `rejected` to `pending`, re-entering the review queue.

### Analytics Tab {#encoder-analytics}
A dedicated analytics dashboard (Chart.js) showing:
- **Form Type Breakdown** — Doughnut chart of submissions by form type.
- **Status Distribution** — Doughnut chart of all submission statuses.
- **Top Barangays** — Horizontal bar chart of the top 10 barangays by submission count.
- **Monthly Growth** — Line chart comparing current year vs. previous year, month-by-month.
- **KPI Chips** — Summary metrics: Total, Approved, Pending, Rejected, Verified, Approval Rate %.
- **Demographics** — Sex distribution (Male/Female), plus counts of PWD, 4Ps, and Indigenous People beneficiaries.

### Reports & CSV Export {#encoder-reports}
- Click the **Reports** tab to access export functionality.
- **Export to CSV:** Downloads a filtered CSV file of all submissions.
- Filters are applied before export: Status, Form Type, Search query, and Barangay.
- The CSV includes columns: ID, Beneficiary, Form Type, Barangay, Status, Date Submitted.
- Filename format: `submissions_{municipality}_{date}.csv`

### Activity Feed {#encoder-activity-feed}
A scrollable feed showing the 10 most recent submission status changes, with color-coded indicators:
- 🟢 Green: Approved submissions.
- 🟡 Yellow/Warning: Pending submissions.
- 🔴 Red/Danger: Rejected submissions.

### Trash Bin (Soft-Delete) {#encoder-trash-bin}
- **Moving to Trash:** Click the delete button on a submission to soft-delete it. The record is hidden from the main table but **not permanently destroyed**.
- **Viewing Trash:** Navigate to the Trash Bin tab to see all soft-deleted items, sorted by deletion date.
- **Restoring:** Click **Restore** on any trashed item to return it to the main submissions list.
- **Permanent Deletion:** Click **Delete Permanently** to irreversibly remove the record. If no other registrations reference the same beneficiary, the beneficiary record is also deleted.
- **Trash Counter:** A badge on the Trash tab shows the current count of items in the trash.

### Notifications {#encoder-notifications}
- A bell icon in the header displays the **unread notification count**.
- Notifications are generated when:
  - A submission is rejected by a Verifier (with feedback remarks).
  - A submission receives final approval or rejection from the MAO.
- Click a notification to mark it as read. Use "Mark All Read" to clear all.
- Notifications update in real-time via WebSocket — no page refresh needed.

---

## 7. Verifier Panel

The Verifier Panel is the data validation and geospatial verification workstation.

### Dashboard & Statistics Cards {#verifier-dashboard}
Real-time stats for the Verifier's municipality:
- **Pending** — Submissions awaiting review.
- **Verified** — Submissions the Verifier has forwarded to the MAO.
- **Reviewed Today** — Count of submissions this Verifier reviewed today.
- **Approved** — Total approved submissions in the municipality.
- **Rejected** — Total rejected submissions in the municipality.

Each card has a 30-day trend indicator.

### Submission Review Table {#verifier-submissions}
- A paginated DataTable showing submissions filtered by the Verifier's municipality.
- Supports filtering by Status: Pending, Verified, Approved, Rejected, or All.
- Supports filtering by Form Type.
- Search by beneficiary name or barangay.
- Submissions are listed in descending chronological order.
- Up to 200 records loaded per query.

### Reviewing a Submission (Verify / Reject) {#verifier-review}
1. Click a submission row to open the **Review Modal**.
2. The modal displays all beneficiary details and the original form data.
3. **If data is accurate:**
   - Optionally add/edit beneficiary details (name corrections, barangay, phone number).
   - Optionally add GIS parcel data (draw boundaries on the map).
   - Click **"Forward to MAO"** → Sets status to `verified`.
4. **If data is incorrect:**
   - Enter specific **Remarks** explaining what needs correction.
   - Click **"Reject"** → Sets status to `rejected`.
5. Upon review:
   - Caches are invalidated for Verifier, MAO, and Encoder dashboards.
   - If **verified**: Notifications are sent to all MAOs in the municipality.
   - If **rejected**: A notification is sent to the original Encoder.
   - The record is auto-unlocked.
   - Real-time Socket.IO events update all connected dashboards instantly.

### GIS Map Integration {#verifier-gis-map}
- When reviewing an RSBSA submission, the Verifier can open the **Map Modal**.
- **Satellite View:** Uses high-resolution satellite tile imagery for land boundary verification.
- **Drawing Tools:** Leaflet.Draw controls allow Verifiers to draw polygon/polyline boundaries for farm parcels.
- **GPX/GeoJSON/KML Import:** Verifiers can import existing boundary files.
- The drawn GIS data is saved into the submission's JSON payload under the `gis` key.
- GIS coordinates are used for Command Center maps in the Admin panel.

### Record Locking (Concurrency Control) {#verifier-record-locking}
- When a Verifier opens a submission for review, the system **locks** that record for 15 minutes.
- Other Verifiers who attempt to open the same record will see a message: *"Record is currently locked by [Name]"*.
- This prevents two Verifiers from reviewing the same submission simultaneously.
- Locks automatically expire after 15 minutes or are released when the review is completed.
- Lock/unlock events are broadcast via Socket.IO so other Verifiers see the status update in real-time.

### Bulk Review {#verifier-bulk-review}
- Select multiple submissions using the multi-select checkboxes.
- Click **"Bulk Verify"** or **"Bulk Reject"** and enter optional remarks.
- All selected submissions are updated in a single database transaction.
- Notifications are sent to each affected Encoder and/or MAO.

### Analytics Tab {#verifier-analytics}
- **Pipeline Status Distribution** — Doughnut chart of all statuses (municipality-wide).
- **Pending by Form Type** — Bar chart showing the review backlog broken down by form type.
- **Pending by Barangay** — Horizontal bar chart showing which barangays have the most pending submissions.
- **Monthly Reviews** — Line chart comparing the Verifier's personal review output (current year vs. last year).
- **KPI Chips** — Pending, Verified, Approved, Rejected, My Total Reviewed, Today's Reviews, Total Municipal.
- **Demographics** — Sex distribution, PWD, 4Ps, and IP counts for approved beneficiaries.

### Reports & CSV Export {#verifier-reports}
- Export municipality-wide submissions to CSV with active filters applied.
- CSV columns: ID, Beneficiary, Form Type, Encoder, Barangay, Status, Date Submitted.
- Filename format: `verifier_export_{municipality}_{date}.csv`

### Global GIS Map {#verifier-global-gis}
- A dedicated map tab showing all verified and approved submissions with geo-data plotted on the municipality map.
- GeoJSON parcel boundaries rendered on Leaflet with beneficiary name, form type, and status labels.

### Trash Bin {#verifier-trash-bin}
- Same soft-delete, restore, and permanent delete functionality as the Encoder panel, scoped to the Verifier's municipality.

### Notifications {#verifier-notifications}
- Bell icon with unread count.
- Notifications for new encoder submissions needing review.
- Real-time badge refreshes via Socket.IO.

---

## 8. MAO Panel (Municipal Agriculture Office)

The MAO Panel is the executive decision-making interface for the Municipal Agriculture Officer.

### Dashboard & Statistics Cards {#mao-dashboard}
Municipal-level statistics:
- **Total Registrations** — All submissions in the municipality (excluding deleted).
- **Approved** — Total approved registrations.
- **Pending Approval** — Submissions verified by Verifiers, awaiting MAO decision.
- **Pending Verification** — Submissions from Encoders, awaiting Verifier review.
- **Rejected** — Total rejections.
- **Registered Beneficiaries** — Count of unique beneficiaries with at least one approved registration.

Each card has a 30-day trend percentage.

### Registrations Table {#mao-registrations}
- DataTable showing the most recent 50 registrations for the municipality.
- Columns: ID, RSBSA ID, Beneficiary Name, Form Type, Barangay, Status, Date.
- Filterable by status, form type, and search query.
- Supports all status views: Pending, Verified, Approved, Rejected.

### Final Approval / Rejection {#mao-approval}
1. Click a registration row to open the detailed **Review Modal**.
2. The modal shows all beneficiary details, form data, encoder/verifier info, and the map (if GIS data exists).
3. **To Approve:**
   - Click **"Approve"** → A SweetAlert confirmation popup appears.
   - Confirm → Status is set to `approved`.
   - If the beneficiary does not yet have an RSBSA ID, one is **auto-generated**.
4. **To Reject:**
   - Enter rejection remarks.
   - Click **"Reject"** → Status is set to `rejected`.
5. Upon decision:
   - Notifications are sent to the original Encoder and the Verifier who forwarded the submission.
   - All dashboard caches (MAO, Verifier, Encoder) are invalidated.
   - Real-time Socket.IO events update all connected panels.

### RSBSA ID Auto-Generation {#rsbsa-id-generation}
When a registration is approved, the system automatically generates a unique RSBSA ID for the beneficiary:
- **Format:** `RS-{YEAR}-{MUNICIPALITY_PREFIX}-{RANDOM_4_DIGITS}`
- **Example:** `RS-2026-MAB-7234`
- The system checks for uniqueness to prevent duplicates.
- The ID is only generated once per beneficiary — subsequent approvals for the same person do not overwrite it.

### Bulk Approval {#mao-bulk-approval}
- Select multiple registrations using checkboxes.
- Click **"Bulk Approve"** or **"Bulk Reject"**.
- Enter optional remarks that apply to all selected items.
- RSBSA IDs are generated for each approved beneficiary without an existing ID.
- Notifications are sent to each affected Encoder and Verifier.

### Approved Beneficiaries List {#mao-beneficiaries}
- A dedicated tab listing all beneficiaries with at least one approved registration.
- Cached for 2 minutes for performance.
- Used as the basis for ID card generation.

### Digital ID Card Generation & Printing {#mao-id-card}
- For any approved beneficiary, the MAO can click **"Generate ID Card"**.
- The system renders a print-ready HTML/CSS ID card page featuring:
  - Beneficiary photo, full name, RSBSA ID, barangay, municipality.
  - Supports both **vertical** and **horizontal** card layouts.
  - QR code encoding the beneficiary's RSBSA ID for quick scanning.
- The page is optimized for **CSS print media** to produce high-quality physical ID cards.

### Analytics Tab {#mao-analytics}
Municipal-level analytics with Chart.js:
- **Registration by Type** — Doughnut chart.
- **Status Distribution** — Doughnut chart.
- **Top Barangays** — Horizontal bar chart (top 10).
- **Monthly Growth** — Line chart comparing current year vs. prior year.
- **Demographics** — Gender breakdown, PWD, 4Ps, and Indigenous People counts (from approved registrations only).

### Reports & CSV Export {#mao-reports}
- Export full municipal registration data to CSV.
- Filters: Status, Form Type, Search query.
- CSV columns: ID, Beneficiary, Form Type, Barangay, Status, Date Submitted.
- Filename format: `mao_export_{municipality}_{date}.csv`

### Trash Bin {#mao-trash-bin}
- Same soft-delete, restore, and permanent delete workflow, scoped to the MAO's municipality.
- Trash count badge on the tab.

### Notifications {#mao-notifications}
- Bell icon with unread badge.
- Notified when Verifiers forward verified submissions for approval.
- Real-time updates via Socket.IO.

---

## 9. Admin Panel

The Admin Panel provides complete system oversight and configuration controls.

### Dashboard & Statistics Cards {#admin-dashboard}
- **Total Staff Users** — Count of all non-admin users in the municipality.
- **MAO Count** — Number of MAO accounts.
- **Encoder Count** — Number of Encoder accounts.
- **Verifier Count** — Number of Verifier accounts.

Each card shows a 30-day trend indicator.

### Staff User Management (CRUD) {#admin-user-management}
Full lifecycle management of staff accounts:
- **Create User:** Fill in username, password, full name, role (Encoder/Verifier/MAO), email, contact number, and optional profile image. The new user is automatically assigned to the Admin's municipality.
- **Edit User:** Update name, email, contact, active status, password, and profile image. Old avatars are automatically cleaned up from the server when replaced.
- **Delete User:** Permanently remove a staff account. Admins cannot delete themselves or other admin accounts.
- **Activate/Deactivate:** Toggle user active status without deleting the account.

All user management actions are logged in the Audit Log and broadcast via Socket.IO.

### Community Member Management {#admin-community-management}
- View all registered community members (public users) in the municipality.
- See their auth provider (local or Google OAuth), last login, online status, and account creation date.
- **Toggle Account Status:** Enable or disable community member accounts to restrict access.

### Online Users Monitor {#admin-online-users}
- An interactive **"Online Users" modal** displays all staff and community members currently active (within the last 5 minutes).
- Each user shows a dynamic green dot, their name, role, and avatar.
- Separated into **Staff** and **Community** sections.

### Activity Feed (Audit Log) {#admin-activity-feed}
- A scrollable feed showing the 15 most recent audit log entries for the municipality.
- Entries are color-coded: green for login/approval events, blue for general activity.
- Each entry shows: User Name, Action, Details, Timestamp.
- The feed is cached for 2 minutes and refreshes automatically via Socket.IO when new activity is logged.

### GIS Command Center Map {#admin-gis-map}
A full-screen interactive map in the Admin panel:
- **Submission Markers:** All registrations are plotted on the map with coordinate data extracted from:
  1. Verifier-added GIS data (drawn polygon boundaries).
  2. Encoder-added parcel coordinates (latitude/longitude).
  3. Barangay center fallback (pre-defined coordinates for all Mabitac barangays: Amuyong, Antonio, Bayanihan, Nanguma, Paagahan, Pag-asa, Libis ng Nayon, Sinagtala, Matalatala).
- **Color-Coded Markers:** Different colors for Pending, Verified, Approved, and Rejected.
- **Popup Info:** Click a marker to see Beneficiary Name, Form Type, Barangay, Encoder, Verifier, and Status.
- **GeoJSON Parcel Rendering:** Verified farm boundary polygons are drawn on the map.
- **Staff Activity Overlay:** Shows where each active staff member was last working (based on their most recent submission's barangay).
- **Heatmap Layer:** Activity intensity heatmap across barangays.
- **Satellite View:** Toggle to satellite imagery for land boundary verification.

### Global Trash Bin {#admin-trash-bin}
- Shows **all** soft-deleted records across the entire municipality (not just the Admin's own).
- Includes the **Deleted By** field showing which staff member deleted each record.
- Restore or permanently delete any item.

### System Health Dashboard {#admin-system-health}
A real-time system monitoring panel accessible from the Admin dashboard:
- **Server Status:** OK / Degraded indicator.
- **Uptime:** How long the server has been running (hours, minutes, seconds).
- **Database Health:**
  - Connection status (Connected / Error).
  - Query latency in milliseconds.
- **Cache Status:**
  - Whether caching is enabled.
  - Whether the cache is operational.
- **System Resources:**
  - **CPU Usage:** Real-time percentage (via psutil).
  - **RAM Usage:** Percentage and GB used / total.
- **Active Sessions:**
  - Staff currently online (per role: Encoder, Verifier, MAO).
  - Community members currently online.
  - Total online count.
- **Errors (24h):** Count of error-related audit log entries in the last 24 hours.
- **Maintenance Mode Status:** Current ON/OFF toggle state.

### Admin Controls {#admin-controls}
Administrative actions accessible from the System Health panel:
- **Toggle Maintenance Mode:** Puts the entire system into maintenance mode. All non-admin users see a maintenance page. Admin panel remains fully accessible. Toggle broadcasts a real-time SocketIO event to all connected clients.
- **Clear Server Cache:** Flushes all server-side caches (stats, analytics, activity feeds) to force fresh data loads.
- **Broadcast System Alert:** Send a real-time alert message (info, warning, or danger) to ALL connected panel users via SocketIO. Used for maintenance notices or outage alerts.
- **Force Logout All Users:** Resets all non-admin user sessions by invalidating their last_activity timestamps. Forces all staff to re-authenticate.
- **Error Log Viewer:** View the last 50 error/failure/access-denied entries from the audit log.

### Notifications {#admin-notifications}
- Bell icon with unread count.
- Admin receives system-wide activity notifications.

---

## 10. Shared Panel Features

These features are available across all staff dashboard panels (Encoder, Verifier, MAO, Admin).

### Settings Dashboard {#settings-dashboard}
Accessible from the sidebar, the Settings page is a sophisticated left-sidebar driven dashboard with three sections:
- **General Profile:** View and update your full name, email, contact number, and profile avatar.
- **Security & Authentication:** View 2FA status, manage trusted devices, and update password.
- **Danger Zone:** Account deactivation options.

### Dark / Light Theme Toggle {#dark-light-theme}
- A toggle switch in the dashboard header allows instant switching between Dark Mode and Light Mode.
- Dark mode uses a corporate navy/dark aesthetic with adaptive gradients on all headers, banners, and cards.
- Light mode uses clean whites and subtle grays with vibrant accent colors.
- Theme preference is stored in the browser and persists across sessions.

### Real-Time WebSocket Updates {#real-time-updates}
All dashboards are connected to the server via **Socket.IO** WebSockets:
- **Stat cards** refresh automatically when submissions change status.
- **Activity feeds** update in real-time as new events occur.
- **Notification badges** increment instantly when new notifications arrive.
- **Submission tables** refresh when new data is submitted or status changes.
- **Record locks** are broadcast across Verifier sessions.
- **System alerts** from the Admin are pushed to all connected clients.
- **Maintenance mode** toggles are pushed instantly.
- No page refresh is ever required for data updates.

### Notification Bell {#notification-bell}
- Located in the top header bar of every dashboard.
- Displays a red badge with the count of unread notifications.
- Click to expand the notification panel showing recent messages.
- Each notification can be individually marked as read.
- "Mark All Read" button clears all unread status.
- New notifications trigger an instant Socket.IO event for real-time badge updates.

---

## 11. Troubleshooting & FAQ

### Authentication Issues

| Issue | Solution |
|-------|----------|
| **"I am not receiving my 2FA Email."** | Check your Spam/Junk folder. Confirm with the Admin that your email address is entered correctly. Wait 60 seconds before requesting a new code. |
| **"My screen says 'Account Locked'."** | Wait exactly 15 minutes. Ensure Caps Lock is off before trying again. The lock cannot be bypassed. |
| **"I forgot my password."** | Click "Forgot Password?" on the login page and follow the emailed instructions. If you do not have an email registered, contact your Admin to reset your password. |

### Dashboard & Data Issues

| Issue | Solution |
|-------|----------|
| **"I cannot see any records on my table."** | Confirm with the Admin that your account is assigned to the correct Municipality. Records are strictly filtered by municipality. |
| **"My statistics cards show 0 even though I submitted data."** | Statistics are cached for up to 5 minutes. Wait a moment or ask the Admin to clear the server cache. |
| **"Charts are not loading on the Analytics tab."** | Ensure you are on the Analytics tab before it renders. If charts disappear, switch tabs and return — the system re-renders on tab activation. |
| **"My submission disappeared from the table."** | Check the Trash Bin tab — it may have been soft-deleted. Contact an Admin if it was permanently deleted by mistake. |

### GIS / Map Issues

| Issue | Solution |
|-------|----------|
| **"The map tiles are not loading."** | Ensure you have an internet connection. The maps load tile images from OpenStreetMap and satellite providers. |
| **"I drew a boundary but it did not save."** | Confirm you clicked "Save" or "Forward to MAO" after drawing. GIS data is only saved when the review is submitted. |

### System Issues

| Issue | Solution |
|-------|----------|
| **"The system says 'Maintenance Mode'."** | The IT Admin has activated maintenance mode for system updates. Please wait and try again later. Admins can still access the system during maintenance. |
| **"I see a 'System Alert' banner."** | This is a broadcast message from the Admin. Read the alert message for instructions. |
| **"I was logged out unexpectedly."** | The Admin may have triggered a "Force Logout" for security reasons. Log in again normally. |

### Contact Support
For persistent issues not resolved above, contact the IT Administrator directly or reach out to the system development team.

---

*Farm Connect 2026 — Developed for the Municipal Agriculture Office of Mabitac, Laguna.*
