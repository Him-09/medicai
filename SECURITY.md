# MedicAI Security Documentation

This document describes the security controls implemented in MedicAI to ensure HIPAA compliance and protect Protected Health Information (PHI).

## Table of Contents

1. [Overview](#overview)
2. [Tenant Isolation](#tenant-isolation)
3. [Authentication & MFA](#authentication--mfa)
4. [Session Management](#session-management)
5. [Encryption](#encryption)
6. [Audit Logging](#audit-logging)
7. [PHI Protection](#phi-protection)
8. [Backups](#backups)
9. [Security Headers](#security-headers)
10. [Configuration](#configuration)
11. [Security Checklist](#security-checklist)

---

## Overview

MedicAI implements defense-in-depth security with multiple layers:

| Layer | Control | Status |
|-------|---------|--------|
| Network | TLS/HTTPS, Security Headers | ✅ |
| Application | MFA, Session Management, RBAC | ✅ |
| Data | Encryption at Rest, RLS | ✅ |
| Audit | Comprehensive Logging | ✅ |
| Operations | Encrypted Backups | ✅ |

---

## Tenant Isolation

### Row-Level Security (RLS)

Every PHI table is protected by PostgreSQL Row-Level Security policies that filter data by `clinic_id`:

```sql
-- Example RLS policy
CREATE POLICY patients_clinic_isolation ON patients
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id')::uuid);
```

**Protected Tables:**
- `patients`
- `documents`
- `consultations`
- `audit_events`
- `consultation_orders`
- `consultation_documents`
- `document_embeddings`

### How It Works

1. User authenticates → JWT contains `clinic_id`
2. Every request sets `app.current_clinic_id` in PostgreSQL
3. RLS policies automatically filter all queries
4. Even SQL injection cannot access other tenants' data

### Migration

Run migration `007_tenant_isolation_rls.sql` to enable RLS.

---

## Authentication & MFA

### Multi-Factor Authentication

MFA is **mandatory** for all users when `MFA_REQUIRED=true` (default).

**Login Flow:**
```
1. User submits email/password
2. If valid + MFA enabled → Return temp_token (5 min expiry)
3. User submits TOTP code with temp_token
4. If valid → Return full access_token
```

**Supported Methods:**
- TOTP (Google Authenticator, Authy, etc.)
- Backup codes (8 codes, single-use)

### Code Location

- [app/auth.py](app/auth.py) - Core authentication
- [app/security/mfa.py](app/security/mfa.py) - MFA verification
- [app/api/auth_routes.py](app/api/auth_routes.py) - Login endpoints

### API Endpoints

```http
POST /auth/login
# Returns: { requires_mfa: true, temp_token: "..." }

POST /auth/verify-mfa
# Body: { temp_token: "...", code: "123456", method: "totp" }
# Returns: { access_token: "...", expires_in: 1800 }

GET /auth/mfa-status
# Returns: { mfa_required: true, mfa_methods: ["totp", "backup_code"] }
```

---

## Session Management

### Device Tracking

Each session records:
- Device fingerprint
- User agent / device name
- IP address
- Last active timestamp

### Session Features

- Maximum 5 concurrent sessions per user
- Oldest session revoked when limit exceeded
- Password change revokes all sessions
- Manual session revocation supported

### Token Rotation

Refresh tokens implement rotation:
1. Each refresh token is single-use
2. Using a token generates new access + refresh tokens
3. Reusing an old token → **entire token family revoked** (theft detection)

### Database Schema

```sql
-- user_sessions: Active sessions with device tracking
-- refresh_tokens: Token rotation with family tracking
-- suspicious_logins: Flagged login attempts
```

See migration `008_session_tracking.sql`.

---

## Encryption

### Encryption at Rest

#### File Encryption

All uploaded files are encrypted using envelope encryption:

```python
from app.security.file_encryption import encrypt_file, decrypt_file

# Encrypt
encrypted = encrypt_file(plaintext_bytes, associated_data=patient_id.encode())

# Decrypt
plaintext = decrypt_file(encrypted, associated_data=patient_id.encode())
```

**Algorithm:** AES-256-GCM with unique Data Encryption Key (DEK) per file

**Key Hierarchy:**
```
KEK (Key Encryption Key) ← From environment variable
  └── DEK (Data Encryption Key) ← Random per file
        └── File content
```

#### Database Encryption

- Configure PostgreSQL with encryption at rest
- Use cloud provider's managed encryption (AWS RDS, GCP Cloud SQL)

### Environment Variables

```bash
# 32 bytes, base64 encoded
FILE_ENCRYPTION_KEY=base64_encoded_32_byte_key
```

Generate key:
```python
import secrets, base64
print(base64.b64encode(secrets.token_bytes(32)).decode())
```

---

## Audit Logging

### Logged Events

| Event | Description |
|-------|-------------|
| `LOGIN_SUCCESS` | Successful login |
| `LOGIN_FAILED` | Failed login attempt |
| `PATIENT_VIEW` | Patient record accessed |
| `PATIENT_CREATE` | New patient created |
| `PATIENT_UPDATE` | Patient record modified |
| `PATIENT_DELETE` | Patient archived |
| `DOC_UPLOAD` | Document uploaded |
| `DOC_VIEW` | Document accessed |
| `DOC_DELETE` | Document deleted |
| `EXPORT` | Data exported |
| `2FA_ENABLED` | MFA enabled |
| `2FA_DISABLED` | MFA disabled |
| `CLINIC_SETTINGS_UPDATE` | Admin settings changed |

### Audit Log Schema

```sql
CREATE TABLE audit_events (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    patient_id UUID,  -- NULL for non-patient events
    clinic_id UUID,   -- Tenant isolation
    action TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ
);
```

### Querying Audit Logs

```http
GET /api/settings/audit-log?limit=50
```

---

## PHI Protection

### PHI Redaction in Logs

All log output passes through PHI redaction:

```python
from app.security.phi_redactor import redact_phi

# Automatically redacts:
# - Email addresses → [EMAIL]
# - Phone numbers → [PHONE]
# - National IDs → [CIN]
# - Dates of birth → [DOB]
# - JWT tokens → [JWT_TOKEN]
# - Passwords → [PASSWORD_REDACTED]
```

### Configuration

PHI-safe logging is configured at startup in `main.py`:

```python
from app.security.phi_redactor import configure_phi_safe_logging
configure_phi_safe_logging()
```

### Safe Logging Utilities

```python
from app.security.phi_redactor import safe_log_patient_action

safe_log_patient_action(logger, "Viewed records", patient_id)
# Output: "Viewed records for patient abc12345..."
```

---

## Backups

### Encrypted Backups

Backups are encrypted with AES-256:

```bash
# Create backup
python scripts/backup.py backup

# List backups
python scripts/backup.py list

# Restore backup
python scripts/backup.py restore backups/medicai_backup_20240115.sql.enc

# Test backup integrity
python scripts/backup.py test
```

### Backup Schedule (Cron)

```cron
# Daily at 2 AM
0 2 * * * cd /path/to/medicai && python scripts/backup.py backup >> /var/log/medicai-backup.log 2>&1
```

### Environment Variables

```bash
BACKUP_ENCRYPTION_KEY=your-strong-passphrase
BACKUP_RETENTION_DAYS=30
BACKUP_DIR=./backups
```

### Backup Testing

Regular restore testing is **critical**:

```bash
# Test backup can be decrypted and is valid PostgreSQL format
python scripts/backup.py test
```

---

## Security Headers

All responses include security headers:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-XSS-Protection` | `1; mode=block` | XSS protection |
| `Strict-Transport-Security` | `max-age=31536000` | Force HTTPS |
| `Content-Security-Policy` | (see code) | Prevent XSS/injection |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer |

API responses also include:
- `Cache-Control: no-store` - Prevent caching PHI

---

## Configuration

### Required Environment Variables

```bash
# Authentication
JWT_SECRET=...                    # At least 32 characters
MFA_REQUIRED=true                 # Enforce MFA

# Encryption
FILE_ENCRYPTION_KEY=...           # 32 bytes, base64

# Backups
BACKUP_ENCRYPTION_KEY=...         # Strong passphrase

# Database
PGPASSWORD=...                    # Database password
```

### Generate Secure Keys

```python
import secrets, base64

# JWT Secret
print("JWT_SECRET:", secrets.token_urlsafe(32))

# File Encryption Key
print("FILE_ENCRYPTION_KEY:", base64.b64encode(secrets.token_bytes(32)).decode())

# Backup Key (use a memorable but strong passphrase)
print("BACKUP_ENCRYPTION_KEY:", secrets.token_urlsafe(32))
```

---

## Security Checklist

### Deployment

- [ ] TLS/HTTPS configured (reverse proxy)
- [ ] Strong `JWT_SECRET` set (32+ chars)
- [ ] `MFA_REQUIRED=true` in production
- [ ] `FILE_ENCRYPTION_KEY` set
- [ ] Database encryption at rest enabled
- [ ] Backup encryption configured
- [ ] CORS `ALLOWED_ORIGINS` restricted

### Operations

- [ ] Daily backups scheduled
- [ ] Weekly backup restore test
- [ ] Audit log monitoring configured
- [ ] Intrusion detection in place
- [ ] Security patches applied regularly

### Access Control

- [ ] All users have MFA enabled
- [ ] Unused accounts deactivated
- [ ] Admin access limited
- [ ] Service account permissions minimized

### Compliance

- [ ] BAA signed with cloud provider
- [ ] Data retention policy implemented
- [ ] Incident response plan documented
- [ ] Security training completed

---

## Incident Response

### If Credentials Compromised

1. Rotate `JWT_SECRET` immediately (invalidates all tokens)
2. Force password reset for affected users
3. Review audit logs for unauthorized access
4. Notify affected parties per HIPAA requirements

### If Encryption Key Compromised

1. Re-encrypt all files with new key
2. Rotate `FILE_ENCRYPTION_KEY`
3. Audit file access logs

### If Backup Key Compromised

1. Create new backups with new key
2. Securely destroy old backups
3. Rotate `BACKUP_ENCRYPTION_KEY`

---

## Contact

For security concerns, contact: [security contact info]

Last updated: February 2026
