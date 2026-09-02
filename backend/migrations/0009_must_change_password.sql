-- FALSE par défaut : ne force personne existant à changer son mot de passe
-- rétroactivement. Mis explicitement à TRUE côté application au moment de la
-- création d'un inspecteur ou d'une réinitialisation de mot de passe par un
-- admin, puisque c'est là qu'un mot de passe par défaut/temporaire est en jeu.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
