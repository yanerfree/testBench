import bcrypt

from app.config import settings


def hash_password(plain_password: str) -> str:
    """对明文密码进行 bcrypt 哈希，cost factor 取自配置（>= 10）"""
    salt = bcrypt.gensalt(rounds=settings.bcrypt_cost)
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证明文密码与哈希值是否匹配"""
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
