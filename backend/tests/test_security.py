import pytest

from app.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_password_roundtrip():
    password = "correct horse battery staple"
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed) is True


def test_verify_password_rejects_wrong_password():
    hashed = hash_password("the-real-password")
    assert verify_password("not-the-real-password", hashed) is False


def test_hash_password_produces_distinct_hashes_for_same_input():
    # bcrypt salts each hash, so two hashes of the same password must differ
    # while both still verifying correctly.
    hashed_a = hash_password("same-password")
    hashed_b = hash_password("same-password")
    assert hashed_a != hashed_b
    assert verify_password("same-password", hashed_a)
    assert verify_password("same-password", hashed_b)


def test_access_token_roundtrip():
    user_id = "f91fe17d-e5cf-46b5-a9e0-e11907dc0aef"
    token = create_access_token(user_id)
    assert decode_access_token(token) == user_id


def test_decode_access_token_rejects_garbage_token():
    with pytest.raises(ValueError):
        decode_access_token("not-a-real-jwt")


def test_decode_access_token_rejects_token_signed_with_wrong_key():
    from jose import jwt as jose_jwt

    forged = jose_jwt.encode({"sub": "someone"}, "wrong-key", algorithm="HS256")
    with pytest.raises(ValueError):
        decode_access_token(forged)
