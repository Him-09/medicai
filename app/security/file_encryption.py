# security/file_encryption.py
"""
File encryption service for MedicAI.
Implements envelope encryption for PHI files at rest.

Architecture:
- Each file is encrypted with a unique Data Encryption Key (DEK)
- DEKs are encrypted with a Key Encryption Key (KEK) from environment
- KEK should be stored in a secure key management service in production
"""
import os
import base64
import secrets
from dataclasses import dataclass
from typing import Tuple, Optional
import logging

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend

logger = logging.getLogger(__name__)

# Get KEK from environment (in production, use AWS KMS, HashiCorp Vault, etc.)
_KEK_ENV = os.getenv("FILE_ENCRYPTION_KEY")
if not _KEK_ENV:
    logger.warning(
        "FILE_ENCRYPTION_KEY not set! Using a derived key from JWT_SECRET. "
        "Set FILE_ENCRYPTION_KEY for production use."
    )
    # Derive from JWT_SECRET as fallback (not ideal, but better than nothing)
    _jwt_secret = os.getenv("JWT_SECRET", "default-dev-secret-change-me")
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"medicai-file-encryption-salt",
        iterations=100000,
        backend=default_backend()
    )
    _KEK = kdf.derive(_jwt_secret.encode())
else:
    # Decode base64 KEK from environment
    _KEK = base64.b64decode(_KEK_ENV)

# Validate KEK length
if len(_KEK) != 32:
    raise ValueError("FILE_ENCRYPTION_KEY must be 32 bytes (256 bits) base64-encoded")


@dataclass
class EncryptedFile:
    """Container for encrypted file data."""
    encrypted_dek: bytes  # DEK encrypted with KEK
    nonce: bytes  # 12-byte nonce for AES-GCM
    ciphertext: bytes  # Encrypted file content
    
    def to_bytes(self) -> bytes:
        """Serialize to bytes for storage."""
        # Format: [2-byte dek_len][encrypted_dek][12-byte nonce][ciphertext]
        dek_len = len(self.encrypted_dek).to_bytes(2, 'big')
        return dek_len + self.encrypted_dek + self.nonce + self.ciphertext
    
    @classmethod
    def from_bytes(cls, data: bytes) -> 'EncryptedFile':
        """Deserialize from bytes."""
        dek_len = int.from_bytes(data[:2], 'big')
        encrypted_dek = data[2:2+dek_len]
        nonce = data[2+dek_len:2+dek_len+12]
        ciphertext = data[2+dek_len+12:]
        return cls(encrypted_dek=encrypted_dek, nonce=nonce, ciphertext=ciphertext)


def generate_data_key() -> Tuple[bytes, bytes]:
    """
    Generate a new Data Encryption Key (DEK) and its encrypted form.
    
    Returns:
        Tuple of (plaintext_dek, encrypted_dek)
    """
    # Generate random 256-bit DEK
    dek = secrets.token_bytes(32)
    
    # Encrypt DEK with KEK using AES-GCM
    kek_aesgcm = AESGCM(_KEK)
    nonce = secrets.token_bytes(12)
    encrypted_dek = nonce + kek_aesgcm.encrypt(nonce, dek, None)
    
    return dek, encrypted_dek


def _decrypt_dek(encrypted_dek: bytes) -> bytes:
    """Decrypt a DEK using the KEK."""
    nonce = encrypted_dek[:12]
    ciphertext = encrypted_dek[12:]
    
    kek_aesgcm = AESGCM(_KEK)
    return kek_aesgcm.decrypt(nonce, ciphertext, None)


def encrypt_file(plaintext: bytes, associated_data: Optional[bytes] = None) -> EncryptedFile:
    """
    Encrypt file content using envelope encryption.
    
    Args:
        plaintext: File content to encrypt
        associated_data: Optional AAD (e.g., patient_id, doc_id) for integrity
        
    Returns:
        EncryptedFile containing encrypted data
    """
    # Generate unique DEK for this file
    dek, encrypted_dek = generate_data_key()
    
    # Encrypt file with DEK
    aesgcm = AESGCM(dek)
    nonce = secrets.token_bytes(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext, associated_data)
    
    return EncryptedFile(
        encrypted_dek=encrypted_dek,
        nonce=nonce,
        ciphertext=ciphertext
    )


def decrypt_file(encrypted: EncryptedFile, associated_data: Optional[bytes] = None) -> bytes:
    """
    Decrypt file content.
    
    Args:
        encrypted: EncryptedFile object
        associated_data: Must match AAD used during encryption
        
    Returns:
        Decrypted file content
    """
    # Decrypt the DEK
    dek = _decrypt_dek(encrypted.encrypted_dek)
    
    # Decrypt file with DEK
    aesgcm = AESGCM(dek)
    return aesgcm.decrypt(encrypted.nonce, encrypted.ciphertext, associated_data)


def encrypt_file_to_path(input_path: str, output_path: str, patient_id: Optional[str] = None) -> None:
    """
    Encrypt a file and write to output path.
    
    Args:
        input_path: Path to plaintext file
        output_path: Path to write encrypted file
        patient_id: Optional patient ID for AAD
    """
    with open(input_path, 'rb') as f:
        plaintext = f.read()
    
    aad = patient_id.encode() if patient_id else None
    encrypted = encrypt_file(plaintext, aad)
    
    with open(output_path, 'wb') as f:
        f.write(encrypted.to_bytes())


def decrypt_file_from_path(input_path: str, patient_id: Optional[str] = None) -> bytes:
    """
    Decrypt a file from path.
    
    Args:
        input_path: Path to encrypted file
        patient_id: Must match patient_id used during encryption
        
    Returns:
        Decrypted file content
    """
    with open(input_path, 'rb') as f:
        data = f.read()
    
    encrypted = EncryptedFile.from_bytes(data)
    aad = patient_id.encode() if patient_id else None
    return decrypt_file(encrypted, aad)


# Utility functions for secure file operations
def secure_delete(path: str, passes: int = 3) -> None:
    """
    Securely delete a file by overwriting with random data.
    Note: May not work on SSDs/flash storage due to wear leveling.
    """
    if not os.path.exists(path):
        return
        
    file_size = os.path.getsize(path)
    
    try:
        with open(path, 'r+b') as f:
            for _ in range(passes):
                f.seek(0)
                f.write(secrets.token_bytes(file_size))
                f.flush()
                os.fsync(f.fileno())
        os.remove(path)
    except Exception as e:
        logger.error(f"Secure delete failed for {path}: {e}")
        # Fall back to regular delete
        os.remove(path)
