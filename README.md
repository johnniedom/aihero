## TODO

Do related followup questions.

Handle anonymous requests to the API, rate limit by IP.

Use a chunking system on the crawled information.

Add 'edit' button, and 'rerun from here' button.

Add evals.

Handle conversations longer than the context window by summarizing.

How do you get the LLM to ask followup questions?

## Setup

1. Install dependencies with `pnpm`

```bash
pnpm install
```

2. Copy `.env.example` to `.env.local` and fill in the required values:

```bash
cp .env.example .env.local
```

Required environment variables:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string (use `rediss://` for TLS with Upstash)
- `GOOGLE_GENERATIVE_AI_API_KEY` - Get from [Google AI Studio](https://aistudio.google.com/app/apikey)
- `AUTH_SECRET` - Generate with `openssl rand -base64 32`
- `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET` - Discord OAuth credentials

3. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)

4. Run `./start-database.sh` to start the database (or use a managed service like Neon/Supabase).

5. Run `./start-redis.sh` to start the Redis server (or use Upstash Redis).

6. Run database migrations:

```bash
pnpm db:push
```

7. Start the development server:

```bash
pnpm dev
```

The app will be available at `http://localhost:3000`.
# aihero
