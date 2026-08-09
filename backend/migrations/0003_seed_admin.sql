INSERT INTO users (email, password_hash, full_name, role)
VALUES (
    'elhacen@evoluops.com',
    '$2b$12$qAWSrF6WNNRJcFgz9Z.tE.HFwdOmbUcPIxVutk2I/VrMqxboj5AcC',
    'Admin',
    'admin'
)
ON CONFLICT (email) DO NOTHING;
