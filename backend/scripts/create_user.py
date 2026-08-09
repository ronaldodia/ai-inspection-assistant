import argparse

import psycopg
from psycopg import errors
from psycopg.rows import dict_row

from app.config import settings
from app.security import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(description="Créer un compte inspecteur ou administrateur")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--full-name", required=True)
    parser.add_argument("--role", choices=["inspector", "admin"], default="inspector")
    args = parser.parse_args()

    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        try:
            conn.execute(
                "INSERT INTO users (email, password_hash, full_name, role) VALUES (%s, %s, %s, %s)",
                (args.email, hash_password(args.password), args.full_name, args.role),
            )
            conn.commit()
        except errors.UniqueViolation:
            conn.rollback()
            print(f"L'utilisateur {args.email} existe déjà — rien à faire.")
            return
    print(f"Utilisateur {args.email} créé.")


if __name__ == "__main__":
    main()
