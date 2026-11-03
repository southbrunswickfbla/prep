# FBLA Prep setup

FBLA Prep is a separate website from the chapter site. It has two parts:

- **Website** (this folder): React, TypeScript, Tailwind v4, and Vite, the same stack as the chapter site. It's hosted on GitHub Pages at `https://southbrunswickfbla.github.io/prep/`, which works on the school network.
- **Backend** (`backend/Code.gs`): a Google Apps Script attached to a new Google Sheet. It checks Google sign-ins, has the AI write questions, grades practice, and stores progress. It runs on script.google.com, which the school network allows.

Everything is free. The AI is Google's Gemini API on its free tier.

## 1. Make the data sheet and backend

1. Create a new Google Sheet named **FBLA Prep Data**, using the account that should own it. The account that owns the reminders script is simplest.
2. In the sheet, open **Extensions → Apps Script**. Delete the starter code, paste in all of `backend/Code.gs`, and save. Name the project **FBLA Prep backend**.
3. Open **Project Settings** (the gear) → **Script properties** and add these:

   | Property | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | The same OAuth client ID as the chapter site (`GOOGLE_SIGNIN_CLIENT_ID` on Render) |
   | `ADMIN_EMAILS` | Officer school emails, separated by commas |
   | `GEMINI_API_KEY` | From step 4 |
   | `MEMBER_SHEET_ID` | `1M5ZWCouy9Kfr7amoa2pBv2xVW4rWDECjbcsACtrgH6s` (optional: only members can sign in) |
   | `MEMBER_SHEET_TAB` | `Attendance` |

   Optional: `GEMINI_MODEL` (default `gemini-flash-latest`), `BANK_TARGET` (default 30 questions per topic), `FULL_TEST_SIZE` (100), `FULL_TEST_MINUTES` (50).

4. **Get the Gemini API key.** Google requires the account holder to be 18 or older, so an adviser or parent does this part. Go to **aistudio.google.com → Get API key → Create API key**, and copy the key into `GEMINI_API_KEY`. No credit card is needed.
   - On the free tier, Google may use what's sent to improve its products. The backend only ever sends event names, topics, and questions, never names, emails, or student IDs.
5. In the Apps Script editor, pick **setup** from the function menu and click **Run**. Approve the permissions. This creates the tabs and starts a timer that writes questions every 10 minutes.
6. Pick **testAi** and click **Run**. The log should show `{"ok":true,...}`. If it says the model wasn't found, set `GEMINI_MODEL` to a model listed as free in AI Studio.
7. Click **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then deploy and copy the URL ending in `/exec`.
   - "Anyone" only lets the website reach the script. Every request still needs a valid school Google sign-in.
   - **When you change Code.gs later:** Deploy → Manage deployments → edit (pencil) → Version: **New version** → Deploy. The URL stays the same.

## 2. Google sign-in

FBLA Prep uses the same OAuth client as the chapter site. In Google Cloud Console → APIs & Services → Credentials → that OAuth client, make sure **Authorized JavaScript origins** includes:

- `https://southbrunswickfbla.github.io` (the chapter site needs this too)
- `http://localhost:5173` (for testing on your Mac)

The IT approval for students under 18 that's still open for the chapter site applies here too, because it's the same sign-in.

## 3. Put the website online

1. In the **southbrunswickfbla** organization on GitHub, create a **public** repository named **prep**.
2. In Terminal:
   ```bash
   cd ~/Downloads
   unzip fbla-prep.zip
   cd fbla-prep
   npm install
   git init -b main
   git add -A
   git commit -m "FBLA Prep v1"
   git remote add origin https://github.com/southbrunswickfbla/prep.git
   git push -u origin main
   ```
   The push needs the same kind of login as the other repo: a fine-grained token with **Contents** and **Workflows** set to Read and write on this repo, or `gh auth login`.
3. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
4. Open **Settings → Secrets and variables → Actions → Variables** and add:
   - `VITE_API_URL`: the `/exec` URL from step 1.7
   - `VITE_GOOGLE_CLIENT_ID`: the OAuth client ID
   - `VITE_RCE_TESTING_DATE` (optional): defaults to `2026-11-30`
5. Open **Actions → Deploy to GitHub Pages → Run workflow**. When it finishes, the site is at `https://southbrunswickfbla.github.io/prep/`.

Because this repo deploys itself with GitHub's own Pages action, it doesn't use the `PAGES_DEPLOY_TOKEN` that's failing on the chapter site.

## 4. Set up the tests (officers)

All 45 events that have an objective test are built in: the 31 objective tests, the 12 role plays (their test round), Business Ethics, and Future Business Leader. Each one links to FBLA's official 2026–27 guidelines, the same ones every chapter uses.

1. Sign in with an email listed in `ADMIN_EMAILS` and open **Admin**.
2. Click **Load all tests from the guidelines** and keep the page open. The AI reads each event's guidelines and saves its knowledge areas with the number of questions each one has on the real test. It takes about 15 seconds per event, so roughly 10 to 15 minutes for all 45.
3. If any event shows a red note, open it and click **Reload from the guidelines**, or type its topics by hand.
4. Questions then start writing on their own: up to 20 every 10 minutes, starting with whichever topic has the fewest. Drills also write questions on the spot, and **Write 10 more** on any topic fills it right away.

You don't have to click the button at all: after `setup` runs, the 10-minute timer reads two events' guidelines per run, so all 45 are done in about 4 hours.

Filling every topic to 30 questions takes roughly 1,000 AI calls. At the timer's pace that's a few days, as long as the free daily limit holds, so click **Write 10 more** for the tests with the most RCE sign-ups first.

## Try it locally

```bash
cp .env.example .env.local     # leave VITE_API_URL empty for demo mode
npm run dev
```

With no `VITE_API_URL`, the site runs in **demo mode** with sample questions for Introduction to Information Technology and Personal Finance, saved only in your browser. Put the real values in `.env.local` to test against the live backend.

## Linking from the chapter site

Add a link to `https://southbrunswickfbla.github.io/prep/` in the chapter site's navbar or on the Competitions page. FBLA Prep already links back to the chapter site's Competitions page, Event Finder, and Events page.

## What's stored where

| Tab in FBLA Prep Data | What's in it |
|---|---|
| Events | Event names, career clusters, topics and weights |
| Questions | Every AI-written question, its answer and explanation, reports, and status |
| Stats | Each member's attempts and correct answers per topic |
| Sessions | Each finished drill or test and its answers |
| Users | Each member's school email, name, and last visit |
| Flags | Every report, with who sent it and why |

Don't sort these tabs or delete rows by hand while the site is live. Like the RSVP sheet, the script writes by row number. Use a filter view to look things over.
