# Farm Connect 2026 — Enterprise Architecture & Scaling Plan

> **Author:** Antigravity AI Architecture Review  
> **Date:** April 13, 2026  
> **Project:** Farm Connect 2026

This document outlines the strategic infrastructure plan to evolve Farm Connect from a standard monolithic application into an **enterprise-grade, highly scalable system** capable of handling millions of records, sustained high traffic, and malicious network attacks (DDoS) over the next 5-10 years.

---

## 1. Network Security & Anti-DDoS Architecture

Protecting the application from malicious traffic and DDoS attacks requires moving defense away from the application server and onto the "Edge".

### Recommended Approach: Cloudflare Enterprise / AWS Shield
* **Layer 3/4/7 DDoS Mitigation:** Route all traffic through a reverse proxy like Cloudflare. It automatically absorbs volumetric attacks (UDP/SYN floods) and HTTP flood attacks before they ever reach your server. You do not need to install anti-DDoS software on your Python server; network-level is much stronger.
* **Web Application Firewall (WAF):** Block known malicious payloads, SQL injection attempts, and bad bots.
* **Geoblocking:** If Farm Connect is strictly for Philippine users (Mabitac, Laguna), block or aggressively challenge internet traffic originating out-of-country. This alone mitigates 90% of global botnet attacks.
* **Rate Limiting at Edge:** Strict limits on intensive endpoints (like login, SMS/OTP, ID Search) to prevent brute-forcing.

---

## 2. Database Scaling Strategy (PostgreSQL)

Over years, data like `Registrations` and `AuditLogs` will grow exponentially. We must split the database workload to prevent the UI from freezing during massive queries.

### A. Read-Write Splitting (Replication - "Cloning")
* **Primary Database (Master):** Handles ONLY writes (INSERT, UPDATE, DELETE). Example: Encoders submitting new farmer data.
* **Read Replicas (Slaves):** Real-time copies ("clones") of the Primary DB. Handles ONLY reads. 
* *Benefit:* When the MAO pulls a massive 50,000-row analytics report, it hits the Read Replica. It will **not** slow down an Encoder who is concurrently submitting a new registration.

### B. Connection Pooling (PgBouncer)
* As more users log in, database connections skyrocket. Flask opens a new connection per thread. PostgreSQL struggles with managing thousands of idle connections.
* **Implementation:** Deploy `PgBouncer` to pool connections. The App talks to PgBouncer, which multiplexes queries through a smaller pool of stable DB connections.

### C. Data Partitioning vs. Separation
* **Audit Logs & Notifications:** These tables grow massively but are rarely queried for old data. 
  * *Action:* Move `AuditLog` to a separate "Cold Storage" database, or use Postgres Table Partitioning (`PARTITION BY RANGE (timestamp)`). Drop partitions older than 5 years automatically.
* **JSONB Bloat:** Form data is stored in `JSONB`. If files (Base64 images) are placed inside here, the DB will crash.
  * *Action:* Ensure all images/documents are strictly offloaded to AWS S3 / Cloud Storage, and the DB only stores the URL link.

---

## 3. Application Layer & Asynchronous Processing

Right now, heavy tasks (like generating a PDF or uploading massive CSV files) happen synchronously. If it takes 15 seconds, the user's browser is frozen for 15 seconds, occupying a server thread. In a DDoS or high-traffic event, all threads lock up, killing the server.

### Message Broker + Worker Architecture (Celery + Redis)
Instead of processing heavy tasks immediately:
1. User clicks "Generate 1,000 PDFs" or "Export Analytics".
2. Flask immediately says "Task Queued" and returns a 200 OK (takes 50 milliseconds).
3. The job goes into a **Redis Queue**.
4. Background **Celery Worker Servers** pick up jobs one by one, generate the PDFs, and push a SocketIO notification to the user when finished.

*Benefit:* The main Web Server (Flask) is never blocked and can handle thousands of concurrent requests smoothly.

---

## 4. High-Availability Deployment Topology

To survive server failures, the application logic must be horizontally scalable (we can boot up 10 identical servers on demand).

### The "Shared Nothing" Architecture
1. **Docker / Kubernetes:** Farm Connect is packaged into a Docker container.
2. **Auto-Scaling Group (AWS/GCP):** If CPU hits 70%, the cloud automatically boots up 3 more Farm Connect servers.
3. **External Session Storage:** Because a user might talk to Server A on minute 1, and Server C on minute 2, their login session must be stored centrally in **Redis**, not in the server's local RAM.
4. **SocketIO Message Broker:** With 5 servers, if Server A pushes a "New Submission" websocket event, only users connected to Server A will see it. 
  * *Fix:* Use **Redis as a message broker** for SocketIO (`message_queue='redis://...'`). Redis broadcasts the event to all 5 servers, who then push it to their respective clients.

---

## Conclusion & Next Steps

This "Highest Approach" transitions the app from a simple web server to an enterprise distributed system. It separates concerns:
- **Cloudflare** handles Network Defense.
- **Nginx/Gunicorn** handles Web Routing.
- **Flask** handles Business Logic.
- **Celery** handles Heavy Processing.
- **Redis** handles Sessions and Caching.
- **PostgreSQL Read Replicas** handle complex Analytics Data.
- **PostgreSQL Master** handles Core Data Storage.
