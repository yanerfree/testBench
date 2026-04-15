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
    """签发 JWT token，有效期 settings.jwt_expire_hours 小时"""
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + settings.jwt_expire_hours * 3600,
    }
    return jwt.encode({"alg": "HS256"}, payload, _get_key())


def decode_token(token: str) -> dict:
    """解码并验证 JWT token，返回 claims dict。失败抛出 UnauthorizedError。"""
    try:
        tok = jwt.decode(token, _get_key())
        claims_registry = JWTClaimsRegistry(exp={"essential": True})
        claims_registry.validate(tok.claims)
        return tok.claims
    except Exception:
        raise UnauthorizedError(code="INVALID_TOKEN", message="token 无效或已过期")
