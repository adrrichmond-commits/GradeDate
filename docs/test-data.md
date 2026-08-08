# Test data

The repository does not ship a database-seeding script or shared test credentials. Use isolated test databases and generate credentials in the test runner or local environment when needed. Never run ad-hoc seed scripts against a production `DATABASE_URL`, and never commit passwords or tokens.

The historical `create-test-user` script was removed because it could write a privileged-looking account directly to any database supplied through `DATABASE_URL`.
