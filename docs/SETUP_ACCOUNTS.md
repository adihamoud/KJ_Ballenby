# Account Setup Guide (for the owner)

Step-by-step instructions to create the third-party resources the app depends on. You already have Vercel, Supabase, Google Cloud, and Azure accounts. Each step says **what to copy** and **where to paste it**.

Keep a private scratch file while you do this (never commit it) with these values:

```
SUPABASE_PROJECT_REF=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only, never in the browser
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGE_SERVICE_SID=       # or Verify service SID
```

Where UI labels are uncertain the text says "look for"; provider dashboards change often.

## 1. Supabase project

1. Go to https://supabase.com/dashboard and create a new project (organization: yours). Name: `kj-ballenby-prod`. Region: pick the closest to Israel (Frankfurt `eu-central-1` is a good choice). Set a strong database password and store it in your password manager.
2. Wait until the project is provisioned. Note the **project reference** (the short id in the URL `https://supabase.com/dashboard/project/<project-ref>`). Paste it as `SUPABASE_PROJECT_REF`.
3. Open **Project Settings -> API** (look for "API" under settings):
   - **Project URL** (`https://<project-ref>.supabase.co`) -> `NEXT_PUBLIC_SUPABASE_URL`.
   - **anon / public** key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Safe for browsers; RLS protects data.
   - **service_role** key -> `SUPABASE_SERVICE_ROLE_KEY`. Treat like a root password: only in Vercel server env and GitHub Actions secrets, never prefixed with `NEXT_PUBLIC_`.
   - If the dashboard shows the newer "publishable" and "secret" API keys instead of anon/service_role, use publishable as the anon key and secret as the service role key.
4. **Authentication -> URL Configuration** (look for "URL Configuration" or "Redirect URLs"):
   - **Site URL**: your production URL once Vercel is set up (for now `http://localhost:3000`).
   - **Additional Redirect URLs**: add `http://localhost:3000/auth/callback`, your production `https://<domain>/auth/callback`, and the Vercel preview wildcard `https://*-<your-vercel-team-or-user>.vercel.app/auth/callback`.
5. Repeat steps 1-4 for a second project `kj-ballenby-staging` used by preview deploys and CI (optional in phase 1; recommended before phase 2).
6. Locally: `pnpm dlx supabase login`, then in the repo `pnpm dlx supabase link --project-ref <project-ref>`. Migrations are applied with `pnpm dlx supabase db push`.

Where to paste: `.env.local` in `apps/web` (local), Vercel environment variables (section 5), GitHub Actions secrets (`Settings -> Secrets and variables -> Actions`).

## 2. Google Cloud OAuth client

1. Go to https://console.cloud.google.com and select or create a project (e.g. `kj-ballenby`).
2. **APIs & Services -> OAuth consent screen** (may be called "Google Auth Platform -> Branding/Audience"):
   - User type: **External**.
   - App name: `KJ Ballenby`; user support email: yours; developer contact: yours.
   - Authorized domains: add `supabase.co` and your production domain.
   - Scopes: the defaults `email`, `profile`, `openid` are enough.
   - Publishing status: while "Testing", only listed test users can sign in; add your test accounts. Switch to **In production** before letting guests in (basic scopes do not require verification review).
3. **APIs & Services -> Credentials -> Create credentials -> OAuth client ID**:
   - Application type: **Web application**. Name: `KJ Ballenby (Supabase)`.
   - **Authorized JavaScript origins**: `http://localhost:3000` and your production origin.
   - **Authorized redirect URIs**: `https://<project-ref>.supabase.co/auth/v1/callback` (one per Supabase project: prod and staging).
   - Create. Copy **Client ID** -> `GOOGLE_CLIENT_ID` and **Client secret** -> `GOOGLE_CLIENT_SECRET`.
4. In Supabase: **Authentication -> Providers -> Google** (look for "Sign In / Providers"): enable, paste Client ID and Client Secret, save. Leave "Skip nonce check" off.

Where to paste: only into the Supabase dashboard. The app itself does not need the Google secret.

## 3. Azure app registration (Microsoft login)

1. Go to https://portal.azure.com -> **Microsoft Entra ID** (formerly Azure Active Directory) -> **App registrations -> New registration**.
   - Name: `KJ Ballenby`.
   - **Supported account types**: choose the option that includes **personal Microsoft accounts and any organizational directory** (multitenant + personal). This is what makes tenant `common` work so both Outlook.com users and work accounts can sign in.
   - **Redirect URI**: platform **Web**, value `https://<project-ref>.supabase.co/auth/v1/callback`. Add the staging project's URI later under **Authentication**.
2. After creation, on the **Overview** page copy **Application (client) ID** -> `AZURE_CLIENT_ID`.
3. **Certificates & secrets -> New client secret**: description `supabase`, expiry 24 months (set a calendar reminder to rotate). Copy the secret **Value** immediately (it is shown once) -> `AZURE_CLIENT_SECRET`.
4. **API permissions**: ensure Microsoft Graph delegated `openid`, `email`, `profile`, `User.Read` are present (default `User.Read` is usually there; add the others if missing). Grant admin consent is not required for these.
5. Optional: **Token configuration -> Add optional claim -> ID -> email** so the email claim is always present.
6. In Supabase: **Authentication -> Providers -> Azure**: enable, paste Client ID and Secret, set **Azure Tenant URL** to `https://login.microsoftonline.com/common` (look for a "Tenant URL" field; if it only asks for a tenant id, use `common`). Save.

Where to paste: Supabase dashboard only.

## 4. Twilio for phone OTP (+972)

Supabase can send OTP SMS through Twilio in two ways; pick one:

- **Twilio Verify** (recommended): Twilio generates and checks the code, handles templates and rate limits, and is pre-approved for many countries. Supabase provider: "Twilio Verify".
- **Twilio Messaging Service / Programmable SMS**: Supabase generates the code and sends a plain SMS through your Messaging Service. More control over text, but you manage sender registration.

Israel (+972) notes: alphanumeric sender IDs are generally supported for Israel; check Twilio's SMS guidelines page for Israel regarding sender registration and content rules. For go-live (phase 3) consider traffic volume pricing; an Israeli SMS provider can later be plugged in via Supabase's "Send SMS" auth hook without client changes.

Steps:

1. Create an account at https://www.twilio.com/try-twilio and upgrade it (trial accounts can only text verified numbers).
2. From the **Console home** copy **Account SID** -> `TWILIO_ACCOUNT_SID` and **Auth Token** -> `TWILIO_AUTH_TOKEN`.
3. Option A - Verify: **Verify -> Services -> Create new**. Friendly name `KJ Ballenby` (this appears in the SMS). Enable the SMS channel. Copy the **Service SID** (starts with `VA`) -> `TWILIO_MESSAGE_SERVICE_SID`.
4. Option B - Messaging: **Messaging -> Services -> Create**. Add a sender (buy a number with SMS capability that can reach Israel, or set up an alphanumeric sender ID where allowed). Copy the **Messaging Service SID** (starts with `MG`).
5. In Supabase: **Authentication -> Providers -> Phone**: enable; choose provider **Twilio Verify** (option A) or **Twilio** (option B); paste Account SID, Auth Token, and the Verify/Messaging Service SID. Set **OTP expiry** (e.g. 300 s) and **OTP length** 6. Look for "Enable phone confirmations" and keep it on.
6. **Authentication -> Rate Limits**: lower the SMS sending rate to something sensible for a bar (e.g. 30 per hour) until you understand real traffic.
7. Test from the app with your own +972 number in local format; the UI converts `05X-XXXXXXX` to `+9725XXXXXXXX`.

Where to paste: Supabase dashboard only. The app never talks to Twilio directly.

## 5. Vercel project

1. Push the repo to GitHub (`adihamoud/KJ_Ballenby`) if not already there.
2. At https://vercel.com -> **Add New -> Project** -> import the GitHub repo.
   - **Root Directory**: `apps/web`. Look for "Include source files outside of the Root Directory" and keep it enabled (monorepo).
   - Framework preset: Next.js (auto-detected). Build command: leave default or `pnpm turbo run build --filter=@kj/web`. Install command: `pnpm install` (Vercel detects pnpm from the lockfile; set `packageManager` in root `package.json` so versions match).
3. **Settings -> Environment Variables**. Add for **Production** and **Preview** (and Development if you use `vercel env pull`):

   | Name                            | Value                                                           | Environments         | Exposed to browser                      |
   | ------------------------------- | --------------------------------------------------------------- | -------------------- | --------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | Production project URL (prod) / staging URL (preview)           | Production / Preview | yes                                     |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | matching anon key                                               | Production / Preview | yes                                     |
   | `SUPABASE_SERVICE_ROLE_KEY`     | matching service role key                                       | Production / Preview | **no** (server only; mark as sensitive) |
   | `NEXT_PUBLIC_APP_URL`           | `https://<domain>` / leave empty on preview to use `VERCEL_URL` | Production           | yes                                     |

4. Deploy. Copy the production URL (`https://<project>.vercel.app` or your custom domain) and paste it into Supabase **Site URL** and **Additional Redirect URLs** (section 1 step 4), and into Google **Authorized JavaScript origins** (section 2).
5. **Settings -> Git**: confirm "Preview deployments" are enabled for all branches and that the production branch is `main`.
6. Optional: add a custom domain under **Settings -> Domains**; then update Supabase/Google/Azure URLs accordingly.

## 6. GitHub Actions secrets

In the repo: **Settings -> Secrets and variables -> Actions -> New repository secret**:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (staging) for build and e2e.
- `SUPABASE_ACCESS_TOKEN` (from https://supabase.com/dashboard/account/tokens) and `SUPABASE_DB_PASSWORD` if CI applies migrations with `supabase db push`.
- `VERCEL_TOKEN` only if CI needs to query preview URLs (Vercel's GitHub integration posts them automatically otherwise).

## 7. Checklist

- [ ] Supabase prod (and staging) created; URL, anon, service role recorded.
- [ ] Redirect URLs set in Supabase (localhost, production, preview wildcard).
- [ ] Google OAuth client created; redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`; consent screen published.
- [ ] Azure app registered with multitenant + personal accounts; secret saved; Supabase tenant `common`.
- [ ] Twilio account upgraded; Verify or Messaging service created; Supabase Phone provider configured; test OTP to a +972 number works.
- [ ] Vercel project imported with root `apps/web`; env vars set; production and preview deploys green.
- [ ] GitHub Actions secrets added; CI green.
- [ ] Secrets stored only in Vercel, GitHub, Supabase, and your password manager; `.env.local` is git-ignored.
