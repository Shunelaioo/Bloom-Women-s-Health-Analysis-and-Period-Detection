# Bloom

Bloom is a cycle tracking and wellness companion designed to help users understand their menstrual health, daily symptoms, and cycle patterns with a clean and supportive experience.

## Features

- Daily cycle and symptom logging
- Next-period and fertility insight tracking
- AI-assisted health guidance
- Email reminders and notifications
- Privacy-focused profile and settings flows
- Responsive dashboard for mobile and desktop

## Tech stack

- React + TypeScript + Vite
- Tailwind CSS
- shadcn/ui
- Express API + MongoDB
- Supabase for frontend data/auth integrations

## Project structure

- `src/` — frontend application
- `server/` — backend API and scheduled jobs
- `supabase/` — Supabase configuration and generated types
- `.env.example` and `server/.env.example` — environment templates

## Local setup

1. Clone the repository:

```bash
git clone <your-github-repo-url>
cd <your-project-folder>
```

2. Install frontend dependencies:

```bash
npm install
```

3. Install backend dependencies:

```bash
cd server
npm install
cd ..
```

4. Create your local environment files:

```bash
cp .env.example .env
cp server/.env.example server/.env
```

Then fill in the required values for your local database, Supabase project, and any AI/email configuration.

5. Run the frontend:

```bash
npm run dev
```

6. Run the backend in another terminal:

```bash
cd server
npm run dev
```

## Production build

```bash
npm run build
```

## GitHub publishing

Before pushing to GitHub, make sure you do not commit real environment secrets. The repository is configured to ignore `.env` and server environment files.

```bash
git init
git branch -M main
git add .
git commit -m "Initial commit"
```

Then create a new repository in GitHub and push:

```bash
git remote add origin <your-github-repo-url>
git push -u origin main
```

## License

This project is currently unlicensed. Add a license file if you want to publish it under a specific open-source license.
