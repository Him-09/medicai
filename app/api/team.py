import secrets
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field
import logging

from app.auth import get_current_user, hash_password
from app.audit import audit_event
from medicai.storage.postgres import get_conn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings/team", tags=["team"])

VALID_ROLES = ("doctor", "assistant")
INVITABLE_ROLES = ("assistant",)
MAX_ASSISTANTS = 2

class TeamMember(BaseModel):
    id: str
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: str
    totp_enabled: bool = False
    created_at: Optional[str] = None

class TeamInvitation(BaseModel):
    id: str
    email: str
    role: str
    status: str
    invited_by_email: Optional[str] = None
    created_at: Optional[str] = None
    expires_at: Optional[str] = None

class TeamListResponse(BaseModel):
    members: List[TeamMember]
    invitations: List[TeamInvitation]

class InviteRequest(BaseModel):
    email: EmailStr
    role: str = Field(default="assistant", description="Role: assistant (only assistants can be invited)")
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    password: Optional[str] = None

class UpdateRoleRequest(BaseModel):
    role: str = Field(..., description="New role: doctor or assistant")

def _require_owner(user: Dict[str, Any]) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT role FROM users WHERE id = %s", (user["id"],))
            row = cur.fetchone()
            if not row or row[0] != "doctor":
                raise HTTPException(403, "Only the doctor (clinic owner) can manage team members")

def _get_user_role(user_id: str) -> Optional[str]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT role FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            return row[0] if row else None

@router.get("", response_model=TeamListResponse)
def list_team(user: Dict[str, Any] = Depends(get_current_user)):
    clinic_id = user["clinic_id"]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.created_at,
                       COALESCE(s.totp_enabled, FALSE) as totp_enabled
                FROM users u
                LEFT JOIN user_security_settings s ON s.user_id = u.id
                WHERE u.clinic_id = %s
                ORDER BY
                    CASE u.role
                        WHEN 'doctor' THEN 0
                        WHEN 'assistant' THEN 1
                    END,
                    u.created_at ASC
            """, (clinic_id,))
            members = []
            for row in cur.fetchall():
                members.append(TeamMember(
                    id=str(row[0]),
                    email=row[1],
                    first_name=row[2],
                    last_name=row[3],
                    role=row[4] or "doctor",
                    created_at=row[5].isoformat() if row[5] else None,
                    totp_enabled=row[6] or False,
                ))

            cur.execute("""
                SELECT i.id, i.email, i.role, i.status, i.created_at, i.expires_at,
                       u.email as invited_by_email
                FROM team_invitations i
                LEFT JOIN users u ON i.invited_by = u.id
                WHERE i.clinic_id = %s AND i.status = 'pending'
                ORDER BY i.created_at DESC
            """, (clinic_id,))
            invitations = []
            for row in cur.fetchall():
                invitations.append(TeamInvitation(
                    id=str(row[0]),
                    email=row[1],
                    role=row[2],
                    status=row[3],
                    created_at=row[4].isoformat() if row[4] else None,
                    expires_at=row[5].isoformat() if row[5] else None,
                    invited_by_email=row[6],
                ))

    return TeamListResponse(members=members, invitations=invitations)

@router.post("/invite")
def invite_member(
    payload: InviteRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    _require_owner(user)

    if payload.role not in INVITABLE_ROLES:
        raise HTTPException(400, f"Only assistants can be added. Valid roles: {', '.join(INVITABLE_ROLES)}")

    clinic_id = user["clinic_id"]
    email = payload.email.strip().lower()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM users WHERE clinic_id = %s AND role = 'assistant'",
                (clinic_id,),
            )
            count = cur.fetchone()[0]
            if count >= MAX_ASSISTANTS:
                raise HTTPException(
                    400,
                    f"Maximum {MAX_ASSISTANTS} assistants per workspace reached. "
                    "Remove an existing assistant before adding a new one."
                )

            cur.execute(
                "SELECT id FROM users WHERE email = %s AND clinic_id = %s",
                (email, clinic_id),
            )
            if cur.fetchone():
                raise HTTPException(409, "This email is already a member of your clinic")

            cur.execute(
                "SELECT id FROM team_invitations WHERE email = %s AND clinic_id = %s AND status = 'pending'",
                (email, clinic_id),
            )
            if cur.fetchone():
                raise HTTPException(409, "An invitation is already pending for this email")

            token = secrets.token_urlsafe(32)

            cur.execute("""
                INSERT INTO team_invitations (clinic_id, email, role, invited_by, token)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, created_at, expires_at
            """, (clinic_id, email, payload.role, user["id"], token))
            inv_row = cur.fetchone()

            temp_password = payload.password if payload.password else secrets.token_urlsafe(16)
            password_hash = hash_password(temp_password)

            cur.execute("""
                INSERT INTO users (email, password_hash, role, clinic_id, invited_by, first_name, last_name)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (email, password_hash, payload.role, clinic_id, user["id"],
                  payload.first_name, payload.last_name))
            new_user_id = str(cur.fetchone()[0])

            cur.execute("""
                UPDATE team_invitations SET status = 'accepted', accepted_at = now()
                WHERE id = %s
            """, (inv_row[0],))

            conn.commit()

    audit_event(user["id"], "TEAM_INVITE", metadata={
        "invited_email": email,
        "role": payload.role,
        "new_user_id": new_user_id,
    })

    return {
        "message": f"Team member {email} added successfully as {payload.role}",
        "user_id": new_user_id,
        "email": email,
        "role": payload.role,
        "temp_password": temp_password,
    }

@router.patch("/{member_id}/role")
def update_member_role(
    member_id: str,
    payload: UpdateRoleRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    _require_owner(user)

    if payload.role not in INVITABLE_ROLES:
        raise HTTPException(400, f"Invalid role. Must be one of: {', '.join(INVITABLE_ROLES)}")

    if member_id == user["id"]:
        raise HTTPException(400, "Cannot change your own role")

    clinic_id = user["clinic_id"]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, role FROM users WHERE id = %s AND clinic_id = %s",
                (member_id, clinic_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Team member not found")

            if row[1] == "doctor":
                raise HTTPException(400, "Cannot change the doctor's role")

            cur.execute(
                "UPDATE users SET role = %s, updated_at = now() WHERE id = %s",
                (payload.role, member_id),
            )
            conn.commit()

    audit_event(user["id"], "TEAM_ROLE_CHANGE", metadata={
        "member_id": member_id,
        "new_role": payload.role,
    })

    return {"message": "Role updated successfully", "role": payload.role}

@router.delete("/{member_id}")
def remove_member(
    member_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    _require_owner(user)

    if member_id == user["id"]:
        raise HTTPException(400, "Cannot remove yourself from the team")

    clinic_id = user["clinic_id"]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, role FROM users WHERE id = %s AND clinic_id = %s",
                (member_id, clinic_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Team member not found")

            if row[2] == "doctor":
                raise HTTPException(400, "Cannot remove the doctor (clinic owner)")

            member_email = row[1]

            cur.execute("DELETE FROM users WHERE id = %s", (member_id,))
            conn.commit()

    audit_event(user["id"], "TEAM_REMOVE", metadata={
        "removed_user_id": member_id,
        "removed_email": member_email,
    })

    return {"message": f"Team member {member_email} removed successfully"}

@router.delete("/invitations/{invitation_id}")
def cancel_invitation(
    invitation_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    _require_owner(user)
    clinic_id = user["clinic_id"]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE team_invitations SET status = 'revoked' "
                "WHERE id = %s AND clinic_id = %s AND status = 'pending' "
                "RETURNING email",
                (invitation_id, clinic_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Invitation not found or already processed")
            conn.commit()

    return {"message": f"Invitation to {row[0]} cancelled"}

@router.get("/role")
def get_my_role(user: Dict[str, Any] = Depends(get_current_user)):
    role = _get_user_role(user["id"])
    return {"role": role or "doctor"}
