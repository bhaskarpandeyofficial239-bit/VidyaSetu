# VidyaSetu

VidyaSetu is a gamified, browser-based learning platform with subject lessons, activities, quizzes, student dashboards, and Punjabi-language screens.

## Project structure

```
.
├── index.html              # Main entry point
├── assets/
│   ├── css/                # Shared styles
│   └── media/              # Local video and other media
├── docs/                   # Project presentation and documentation
├── pages/
│   ├── assessments/        # Quiz screens
│   ├── auth/               # Login screens
│   ├── dashboards/         # Student and teacher dashboards
│   ├── portal/             # Learner portal pages
│   └── subjects/           # Mathematics, Science, and Language content
└── LICENSE
```

## Run locally

Open `index.html` in a browser, or use the **Live Server** extension in VS Code. No build step or package installation is required.

## Publish on GitHub Pages

1. Push this repository to GitHub.
2. In the repository, open **Settings → Pages**.
3. Select **Deploy from a branch**, then choose `main` and `/ (root)`.
4. Save. GitHub Pages will serve `index.html` as the site entry point.

## Notes

- The project uses Tailwind CSS through its CDN, so an internet connection is needed for the Tailwind styles.
- `assets/media/team-srijan.mp4` is a large media file. GitHub accepts files below 100 MB, but Git LFS is recommended if more large media is added.

## Full-stack development

This version includes a Node.js backend for student registration and login. It hashes passwords with Node's `scrypt` algorithm and stores runtime student data locally in `data/students.json` (which is intentionally excluded from Git).

```bash
npm start
```

Open `http://localhost:3000` rather than opening the HTML files directly; the backend APIs require the Node server.

### Registration notification email

1. Copy `.env.example` to `.env`.
2. Create a Resend account and add its API key as `RESEND_API_KEY`.
3. Verify a sender domain and set `MAIL_FROM` to an approved sender.
4. Deploy the project to a Node-compatible host and add the same environment variables there.

Each successful student registration will then send a notification to `bhaskarpandey895623@gmail.com`. GitHub Pages can host only the static frontend; deploy the Node app to a Node-compatible service for registration, login, and email notifications.

### Before production

For a public production launch, move student data from the local JSON file to a managed database, use HTTPS, configure a persistent session store, add password reset and email verification, and apply appropriate privacy policies for student data.
