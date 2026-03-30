# Encoder & Verifier Panels — Comprehensive Audit & Improvement Plan

> **Date:** 2026-03-30  
> **Audited Files:** `encoder-panel.html/js/py`, `verifier-panel.html/js`  
> **Status:** Awaiting user approval before execution

---

## Executive Summary

After a full read of all 8 source files, here is the prioritized list of what is broken, missing, and improvable across both the Encoder and Verifier panels.

---

## 🔴 CRITICAL — Broken / Missing Functionality

### C1 · Verifier: `bulkAction('verified')` — Orphaned Button
| Item | Detail |
|------|--------|
| **File** | `verifier-panel.html` line 217 |
| **Problem** | The "Verify Selected" button calls `bulkAction('verified')` — but the function was **deleted** (see comment on line 338 of verifier-panel.js: _"Bulk Actions removed by user request"_). Clicking it throws a JS error. |
| **Also** | The pending table `<thead>` has no checkbox `<th>`, and `renderPendingTable()` has no per-row checkboxes. |
| **Decision needed** | **Option A:** Implement full checkbox + bulk-verify flow (same as MAO panel). **Option B:** Remove the orphaned button from HTML. |

---

### C2 · Encoder: Activity Feed Never Loaded
| Item | Detail |
|------|--------|
| **File** | `encoder-panel.js` — `DOMContentLoaded` |
| **Problem** | The startup only calls `loadStats()`, `loadSubmissions()`, `setupSearchAndFilters()`, `loadTrashCount()`. There is **no call to load the activity feed**. The "Recent Activity" card on the dashboard always shows a spinner forever. |
| **Backend** | `/encoder/api/activity-feed` is fully implemented and working (encoder-panel.py line 281). |
| **Fix** | Add `loadActivityFeed()` function and call it in `DOMContentLoaded`. |

---

### C3 · Verifier: Activity Feed Never Loaded
| Item | Detail |
|------|--------|
| **File** | `verifier-panel.js` — `DOMContentLoaded` |
| **Problem** | Same as C2. Verifier dashboard's "Recent Activity" block is always in loading state. |
| **Backend** | `/verifier/api/activity-feed` is fully implemented (verifier-panel.py line 542). |
| **Fix** | Add `loadActivityFeed()` function and call it in `DOMContentLoaded`. |

---

### C4 · Encoder: Status Filter Missing "Verified" Option
| Item | Detail |
|------|--------|
| **File** | `encoder-panel.html` lines 312–317 |
| **Problem** | The `#filterStatus` dropdown has: All / Pending / Approved / Rejected. Encoders **cannot filter by "Verified"** even though their submissions can be in that state (pending MAO approval). |
| **Fix** | Add `<option value="verified">Verified</option>` to the dropdown. |

---

## 🟡 IMPORTANT — Missing Features

### I1 · Pagination Missing on All 3 Tables
| Item | Detail |
|------|--------|
| **Tables** | Verifier Pending, Verifier Reviewed History, Encoder Submissions |
| **Problem** | All three tables render every record with no limit. In production with hundreds of records, the page becomes slow and unusably long. |
| **Backend note** | `verifier/api/submissions` has no `.limit()` — returns the entire dataset. |
| **Fix** | Apply the same client-side pagination system used in the MAO panel: pagination state variables, `buildPaginationHTML()`, page-slice rendering, rows-per-page selector. |

---

### I2 · Result Count Badges Missing on All 3 Tables
| Item | Detail |
|------|--------|
| **Problem** | None of the table card headers show "Showing X of Y" like the MAO panel does. |
| **Fix** | Add `<span class="result-count-badge">` to the `<h2>` of each card and update it from the render functions. |

---

### I3 · Column Sorting Missing on All 3 Tables
| Item | Detail |
|------|--------|
| **Problem** | No table in either panel has clickable sortable headers. |
| **Fix** | Add sortable `<th data-sort="...">` headers with `<i class="fas fa-sort sort-icon">` and implement sort state + `initSortHeaders()` for each table. The CSS classes (`th.sortable`, `.sort-icon`) are already in the shared stylesheet from the MAO panel. |

---

### I4 · Verifier: Reviewed History Table Has No Actions Column
| Item | Detail |
|------|--------|
| **File** | `verifier-panel.html` lines 276–282, `renderReviewedTable()` |
| **Problem** | The Reviewed History table shows: Name, Form Type, Encoder, Barangay, Status, Date — **no button to re-open a reviewed submission**. Verifiers sometimes need to re-read what they approved. |
| **Fix** | Add an Actions column with a View (eye) button that calls `viewSubmission(id)`. For already-reviewed records, the lock system will just not engage since the status is past `pending`. |

---

### I5 · Verifier: Pending Table Has No Barangay Filter
| Item | Detail |
|------|--------|
| **Problem** | The MAO panel has a professional barangay dropdown filter using the official Mabitac barangay list. The Verifier Pending table only has a form type filter — no barangay filter. |
| **Fix** | Add barangay filter dropdown to the Pending section, reusing the same `populateBarangayDropdown()` logic from the MAO panel. |

---

### I6 · Encoder: View/Download Silently Fails for Non-RSBSA Forms
| Item | Detail |
|------|--------|
| **File** | `encoder-panel.js` lines 292–295 (viewSubmission), 358–360 (downloadSubmissionPdf) |
| **Problem** | Clicking the eye (View) or download button on a Fish, Boat, or NCFRS submission triggers a flash message "PDF view is currently only supported for RSBSA forms" and does nothing. The buttons appear broken to the user. |
| **Fix (short-term)** | Open a structured detail card modal showing: beneficiary name, form type, status, date submitted, and verifier remarks — no PDF needed. |
| **Fix (long-term)** | Implement PDF generators for all form types (larger scope, separate plan). |

---

### I7 · Verifier: 5-Second Polling Is Too Aggressive
| Item | Detail |
|------|--------|
| **File** | `verifier-panel.js` lines 37–41 |
| **Problem** | Three API endpoints are polled every 5 seconds = **36 requests/minute per verifier**. Real-time updates already work via SocketIO. The polling is just a fallback. MAO panel uses 15 seconds. |
| **Fix** | Change `5000` → `15000` to match the MAO and Encoder polling rate. |

---

### I8 · Encoder: Submissions Table Missing Barangay Column
| Item | Detail |
|------|--------|
| **Problem** | The submissions table only shows Name, Form Type, Status, Submitted, Actions. Encoders work across barangays and have no visibility of which barangay a submission belongs to. |
| **Backend** | `to_dict()` on `Registration` already includes the beneficiary's barangay. |
| **Fix** | Add a `Barangay` column between Form Type and Status, populate it from `s.beneficiary.barangay`. |

---

## 🟢 POLISH — UX & Logic Clean-ups

### P1 · Encoder: Edit Button Visible on Approved/Verified Submissions
- Editing an approved record is confusing and potentially data-corrupting.
- **Decision needed:** Hide Edit button for `approved` and `verified` rows (only show for `pending`/`rejected`)?

### P2 · Encoder: Rejection Remarks Not Visible in Submissions Table
- When a verifier rejects with a remark, the encoder only sees "Rejected" with no reason visible.
- **Fix:** Add a small warning icon 🔴 on rejected rows — hovering shows the rejection remark as a tooltip.

### P3 · Verifier Backend: `get_submissions()` Has No `.limit()` Clause
- `verifier-panel.py` line 135 returns every record with no cap.
- **Fix:** Add `.limit(200)` as a safety cap while pagination is client-side.

### P4 · Verifier: Reviewed History Uses 3 Parallel Fetch Calls
- `loadReviewedSubmissions()` fans out into 3 fetches (verified, approved, rejected).
- **Fix (optional):** Add `/verifier/api/submissions/history` endpoint returning all non-pending in one query.

---

## Files to be Modified

| File | Changes |
|------|---------|
| `encoder-panel.html` | Add "Verified" filter option, result count badge, Barangay `<th>`, sortable headers |
| `encoder-panel.js` | Add `loadActivityFeed()`, pagination, sort, barangay column in render, hide Edit for approved, remarks tooltip |
| `encoder-panel.py` | No critical changes — optional: add `remarks` to `to_dict()` response |
| `verifier-panel.html` | Checkbox `<th>` (if bulk kept), result count badges, barangay filter, Actions column on reviewed table, sortable headers |
| `verifier-panel.js` | Add `loadActivityFeed()`, change poll to 15s, pagination, sort, `bulkAction()` (or remove), view button in reviewed table |
| `verifier-panel.py` | Add `.limit(200)` to `get_submissions()` |

---

## Open Questions — Awaiting User Decision

> **Q1 — Verifier Bulk Verify Button:**
> The button exists but the function was intentionally removed. What do you want?
> - **A:** Implement the full bulk-verify flow (checkboxes + confirmation + API call)
> - **B:** Remove the orphaned button from the HTML

> **Q2 — Encoder Edit Button Restriction:**
> Should the ✏️ Edit button be hidden for `approved` and `verified` submissions?
> - **Yes (recommended):** Only show Edit for `pending` / `rejected`
> - **No:** Keep it visible for all statuses

> **Q3 — Non-RSBSA View Button:**
> Fish, Boat, NCFRS forms: View button currently shows an error.
> - **A:** Show a basic info card modal with the submitted field data
> - **B:** Just show a polite "Document preview coming soon" message

---

*Waiting for user approval before any code changes begin.*
