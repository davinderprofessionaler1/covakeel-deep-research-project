# CoVakeel VPS deployment

This deployment runs the user application, admin application, PostgreSQL,
the legal RAG API, Ollama and automatic HTTPS as isolated Docker services.
Only ports 80 and 443 are public. PostgreSQL, Node APIs, the Python API and
Ollama remain on the private Docker network.

## Server requirements

- Ubuntu 24.04 LTS VPS with a public IPv4 address
- minimum 4 vCPU, 8 GB RAM and 40 GB SSD for the Qwen3 1.7B CPU setup
- 8 vCPU and 16 GB RAM recommended for better response time
- Docker Engine and the Docker Compose plugin
- TCP ports 22, 80 and 443 allowed by the VPS firewall
- two DNS A records: the main domain and an admin subdomain

GPU hosting or a production cloud model provider is recommended when low
latency or concurrent users are required. This Compose file preserves the
current Ollama model so the first live test matches local behavior.

## First deployment

```bash
git clone https://github.com/davinderprofessionaler1/covakeel-deep-research-project.git
cd covakeel-deep-research-project
cp deploy/.env.production.example deploy/.env.production
nano deploy/.env.production
chmod 600 deploy/.env.production
bash deploy/deploy.sh
```

Point both DNS records to the VPS before running the script. Caddy obtains and
renews HTTPS certificates automatically after DNS is active.

Generate independent secrets instead of reusing passwords:

```bash
openssl rand -hex 32
```

Run that command separately for `POSTGRES_PASSWORD`, `OTP_SECRET`,
`ADMIN_INTERNAL_API_KEY` and `ADMIN_SETTINGS_SECRET`. Set a separate strong
`ADMIN_INITIAL_PASSWORD` and change it from Admin Settings after first login.

## Operations

```bash
# Service status
docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml ps

# Follow logs
docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml logs -f --tail=200

# Deploy a new Git revision
git pull --ff-only
bash deploy/deploy.sh

# Stop services without deleting data
docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml down
```

Do not add `-v` to `docker compose down`; that removes the PostgreSQL, Ollama,
upload and HTTPS volumes. Back up the PostgreSQL database, `storage/`,
`knowledge/` and the `user_uploads` volume before server migration.

