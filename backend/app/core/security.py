import hashlib
import secrets
import time
import uuid

import bcrypt
from joserfc import jwt
from joserfc.jwt import JWTClaimsRegistry
from joserfc.jwk import OctKey

from app.config import settings
from app.core.exceptions import UnauthorizedError


def hash_password(plain_password: str) -> str:
    """对明文密码进行 bcrypt 哈希，cost factor 取自配置（>= 10）"""
    salt = bcrypt.gensalt(rounds=settings.bcrypt_cost)
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证明文密码与哈希值是否匹配"""
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def _get_key() -> OctKey:
    return OctKey.import_key(settings.secret_key)


def create_access_token(user_id: uuid.UUID, role: str) -> str:
    """签发短期 access JWT，有效期 settings.access_token_expire_minutes 分钟。"""
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "iat": now,
        "exp": now + settings.access_token_expire_minutes * 60,
    }
    return jwt.encode({"alg": "HS256"}, payload, _get_key())


def decode_token(token: str, expected_type: str | None = None) -> dict:
    """解码并验证 JWT token，返回 claims dict。失败抛出 UnauthorizedError。

    expected_type 非空时，额外校验 claims["type"]（缺失或不匹配即视为无效），
    防止不同用途的 token 被混用。
    """
    try:
        tok = jwt.decode(token, _get_key())
        claims_registry = JWTClaimsRegistry(exp={"essential": True})
        claims_registry.validate(tok.claims)
        if expected_type is not None and tok.claims.get("type") != expected_type:
            raise ValueError("token type mismatch")
        return tok.claims
    except Exception:
        raise UnauthorizedError(code="INVALID_TOKEN", message="token 无效或已过期")


def generate_refresh_token() -> str:
    """生成不透明的 refresh token 明文（返回给客户端，服务端只存其哈希）。"""
    return secrets.token_urlsafe(48)


def hash_refresh_token(raw: str) -> str:
    """对 refresh token 明文做 SHA-256，用于落库比对（不存明文）。"""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

