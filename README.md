# Bloom — Women's Health Analysis and Period Detection

Bloom is a menstrual cycle tracking and wellness application designed to help users understand their menstrual health, daily symptoms, and cycle patterns through a clean and supportive experience.

## Features

- Daily menstrual cycle and symptom logging
- Next-period prediction and fertility insights
- AI-assisted health guidance
- Email reminders and notifications
- Privacy-focused profile and settings
- Responsive dashboard for mobile and desktop

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend:** Express.js
- **Database:** MongoDB
- **Authentication and data integrations:** Supabase

## Project Structure

- `src/` — Frontend application
- `server/` — Backend API and scheduled jobs
- `supabase/` — Supabase configuration and generated types
- `.env.example` — Frontend environment variable template
- `server/.env.example` — Backend environment variable template

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/Shunelaioo/Bloom-Women-s-Health-Analysis-and-Period-Detection.git
cd Bloom-Women-s-Health-Analysis-and-Period-Detection
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Install backend dependencies

```bash
cd server
npm install
cd ..
```

### 4. Configure environment variables

Create your local environment files using the provided templates:

```bash
cp .env.example .env
cp server/.env.example server/.env
```

On Windows PowerShell, you can use `Copy-Item` instead of `cp` if needed.

Configure the required values for your database, Supabase project, and any AI or email integrations.

### 5. Start the frontend

```bash
npm run dev
```

### 6. Start the backend

Open a separate terminal and run:

```bash
cd server
npm run dev
```

## Production Build

```bash
npm run build
```

## Security

Never commit real environment secrets, API keys, passwords, or database credentials. Keep local `.env` files excluded from version control and use the example files to document required configuration.

## License

No open-source license has been specified yet.