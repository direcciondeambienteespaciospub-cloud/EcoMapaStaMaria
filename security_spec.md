# Security Specification & Dirty Dozen Audit — EcoMapa

## 1. Data Invariants
1. **Authenticated & Verified Gate**: All Firestore reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
2. **PII Isolation**: `dni`, `phone`, `birthDate`, and `pin` reside strictly under `/employees/{employeeId}/private/info` and can only be read or modified by the owning employee (`employeeId == request.auth.uid`) or a verified Admin.
3. **Identity Integrity**: Employees cannot create or update sessions, containers, or profiles under another user's `uid` unless they are a verified Admin.
4. **Terminal State Locking**: Once a `sweeperSession` reaches `active == false` with `endedAt`, non-admin users cannot reactivate or mutate the finalized route.
5. **Strict Server Timestamps**: Creation and update timestamps (`createdAt`, `startedAt`, `lastUpdatedAt`, `endedAt`) must match `request.time`.
6. **Bounded Payloads**: Strings, arrays (`points.size() <= 500`), and compressed photos (`photoDataUrl.size() <= 350000`) are strictly bounded.

## 2. Dirty Dozen Attack Payloads (All Must Return PERMISSION_DENIED)
1. Unauthenticated read on `/employees/emp-1/private/info`
2. Unverified email token (`email_verified: false`) trying to spoof admin email `linageocancinos@gmail.com`
3. Non-owner reading another employee's PII at `/employees/other-uid/private/info`
4. Shadow field injection (`isAdmin: true`) on `/employees/{uid}` create
5. Creating a `sweeperSession` with `employeeId` set to another user's UID by a non-admin
6. Client-forged `createdAt` timestamp (`"2020-01-01T00:00:00Z"`) on `/containers/{id}`
7. Mutating a finalized `sweeperSession` (`active: false`) back to `active: true` by non-admin
8. Oversized document ID (>128 chars or invalid characters like `../evil`)
9. Modifying `employeeId` or `startedAt` during a `sweeperSession` update
10. Storing an unbounded `points` array (>500 entries) or invalid point map
11. Reading `/settings/adminProfile` as a regular non-admin employee
12. Creating a `/containers/{id}` with an invalid status enum (`status: "hacked"`) or >350KB photo
