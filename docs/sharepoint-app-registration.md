# SharePoint access for the CBS Operations Hub: steps for CBS IT

**What this is for.** The new CBS Operations Hub (a web app hosted on Vercel) saves job documents to SharePoint, in the same place the current hub uses. It needs its own app registration with access to **one SharePoint site only**. It does not replace or change the existing registration used by n8n.

**What it needs access to**

| | |
|---|---|
| Tenant | chelmsfordbuildingservices |
| Site | `https://example.sharepoint.com/Shared%20Documents/ZZ%20Test/old-33 (the root site) |
| Library | Documents (`Shared Documents`), folder `CBS System` |
| Permission | Microsoft Graph **Sites.Selected** (application), then **Write** on the site above only |

Sites.Selected on its own gives access to nothing. Access starts only when step 4 grants it to the one site. Write access is granted on the whole site, not just one folder.

## 1. Create the app registration

1. Sign in to the Microsoft Entra admin centre (https://entra.microsoft.com) as an administrator.
2. Go to **Identity > Applications > App registrations > New registration**.
3. Name: `CBS Operations Hub (Vercel)`.
4. Supported account types: **Accounts in this organisational directory only (single tenant)**.
5. Redirect URI: leave blank. Select **Register**.
6. On the app's **Overview** page, copy the **Application (client) ID** and the **Directory (tenant) ID**.

## 2. Create a client secret

1. In the app, open **Certificates & secrets > Client secrets > New client secret**.
2. Description: `Vercel`. Expires: 24 months (put a reminder in the calendar to renew it).
3. Copy the secret **Value** straight away; it's shown once only.

## 3. Add the permission and grant admin consent

1. Open **API permissions > Add a permission > Microsoft Graph > Application permissions**.
2. Tick **Sites.Selected**, then **Add permissions**. Don't add any other Graph permissions.
3. Select **Grant admin consent for Chelmsford Building Services**, then confirm. The status shows a green tick.

## 4. Give the app Write access to the one site

Use either option. Both need a SharePoint administrator (or Global Administrator).

**Option A: PnP PowerShell**

```powershell
Connect-PnPOnline -Url https://chelmsfordbuildingservices-admin.sharepoint.com -Interactive -ClientId <your PnP management app id>
Grant-PnPAzureADAppSitePermission -AppId <Application (client) ID from step 1> -DisplayName "CBS Operations Hub (Vercel)" -Site https://example.sharepoint.com/Shared%20Documents/ZZ%20Test/old-34.com -Permissions Write
```

**Option B: Microsoft Graph Explorer** (https://developer.microsoft.com/graph/graph-explorer, signed in as an admin who has consented to `Sites.FullControl.All`)

1. Get the site id: `GET https://graph.microsoft.com/v1.0/sites/chelmsfordbuildingservices.sharepoint.com:/` and copy `id`.
2. Grant the access:

```http
POST https://graph.microsoft.com/v1.0/sites/{site id}/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToIdentities": [
    { "application": { "id": "<Application (client) ID from step 1>", "displayName": "CBS Operations Hub (Vercel)" } }
  ]
}
```

3. Check it: `GET https://graph.microsoft.com/v1.0/sites/{site id}/permissions` lists `CBS Operations Hub (Vercel)` with role `write`.

## 5. Send these back to Ethan

- Directory (tenant) ID
- Application (client) ID
- Client secret value: please send it securely (password manager share or a one-time secret link), not in a plain email.

Ethan stores them as environment variables in Vercel; they're never put in code.

---

*For Ethan (not needed by IT):* the Vercel variables are `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `SHAREPOINT_DRIVE_ID` (the Documents library of the root site; the old hub uses drive `b!ZZ-example-drive-id`) and `FILE_STORAGE=sharepoint`.
