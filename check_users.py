"""Quick script to check user MFA status."""
from medicai.storage.postgres import get_conn

with get_conn() as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT u.email, COALESCE(s.totp_enabled, FALSE) as mfa_enabled 
            FROM users u 
            LEFT JOIN user_security_settings s ON s.user_id = u.id
        """)
        rows = cur.fetchall()
        print("Users and MFA status:")
        for row in rows:
            print(f"  {row[0]}: MFA enabled = {row[1]}")
        
        if not rows:
            print("  No users found!")
