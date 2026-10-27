# Account email and password recovery

Trove creates accounts through verified email links sent by Resend. Each account receives an automatic username that can be changed in Settings. Users can sign in with their email or username and reset a forgotten password through their verified inbox. Existing username accounts can add a recovery email from Settings.

## Configure dixmail.xyz

1. Create a [Resend account](https://resend.com/signup) and choose the Free plan. Keep paid overages disabled.
2. Open [Domains](https://resend.com/domains), add **dixmail.xyz**, and open its DNS instructions. Sending is the feature needed here; receiving setup is optional.
3. In [Namecheap](https://www.namecheap.com/), open **Domain List > Manage** beside dixmail.xyz, then **Advanced DNS**.
4. Copy the required sending records from Resend, using its exact type, host, value, and priority. Namecheap appends the domain to host names, so use the host label indicated for that zone. TXT records go under Host Records; custom MX records are managed under Mail Settings. Preserve unrelated records and existing root-domain mail routing.
5. If the domain uses custom nameservers elsewhere, add the records at that DNS provider instead. Namecheap's Advanced DNS editing applies to its own DNS service.
6. Return to Resend and wait for the domain to show **Verified**. Use the record values in your Resend dashboard; they are specific to your account.
7. Under [API Keys](https://resend.com/api-keys), create a key with Sending access for this domain.
8. Save these server settings in ignored `.env.local`:

```dotenv
RESEND_API_KEY=your-private-resend-key
EMAIL_FROM=Trove <accounts@dixmail.xyz>
```

Resend can send from an address at the verified domain without creating a separate mailbox for that sender. Your users receive links at the inboxes they verify. Application links continue to open Trove's website; configuring the sending domain does not move the website.

Resend's Free plan currently includes a daily limit of 100 sending emails. Trove also limits account mail requests. Check the provider dashboard's quotas before wider use.

## Configure deployment

Add **RESEND_API_KEY** and **EMAIL_FROM** as server environment variables in Vercel and deploy the updated source. Keep the key out of frontend variables and source control.

Alternatively, after both settings are saved locally, `npm run deploy:prepare` includes them in ignored `.artifacts/vercel.env`. Preserve the existing database and integration settings.

Account links use the trusted application origin. Vercel supplies the deployment metadata; a custom website domain uses `PUBLIC_ORIGIN`. Local testing can use `PUBLIC_ORIGIN=http://127.0.0.1:5173`.

## Create an account

1. Select **Create family** and enter an email address and password of at least 12 characters. Learners select **Join a family** and enter their invitation code, email address, and password.
2. Select **Sign up**. Trove sends a verification link; the username is generated after verification.
3. Open the emailed link within 30 minutes and select **Verify email**. Use the password chosen in the signup form when signing in later.
4. Trove creates the verified account and signs you in. The welcome screen shows the assigned username.
5. Select **Continue to Trove > Settings**. Change the username and select **Save username** if desired.
6. Sign out and sign back in with either the email address or current username and password.

Signup requests store a salted password hash alongside a pending email challenge. The raw password stays out of emails and stored records. Family membership, a portfolio, and a session are created after the verification link is completed. Learner invitations are checked again and consumed at completion. Each account uses its own email address.

## Verify an existing account

1. Sign in with the existing username and password.
2. Click the username at the top-right and find **Recovery email**.
3. Enter the inbox to link and the current password. Select **Send verification link**.
4. Open the email link and select **Verify email** on Trove.
5. Return to Account settings. The address should display **Verified**.
6. Sign out and sign back in with that email and the same password.

Existing learner accounts without email retain recovery through the parent's verified inbox. New learner accounts verify their own email before joining the family.

## Test password recovery

1. Sign out, open Sign in, and select **Forgot password?**
2. Enter the username or verified email and select **Send reset link**. The response is the same for matching and nonmatching accounts.
3. Open the received link within 15 minutes. Set and confirm a password of at least 12 characters, then select **Save new password**.
4. Sign in with the username or verified email and the new password. Family membership, balances, decisions, and wallet links should remain associated with the account.
5. Confirm the previous password and previous sessions no longer work. Reusing the reset link should fail.
6. For a learner without email, request recovery using the learner username and open the link from the parent's inbox. Resetting the learner's password leaves the parent's password unchanged.

## Implementation

Signup links expire after 30 minutes. Verification activates the account using the password chosen at signup. Previously issued email-first links continue to let their recipient choose a password before activation. Recovery-email verification links expire after 24 hours and require an explicit confirmation. Password-reset links expire after 15 minutes and can be consumed once. The database stores token hashes and credential-version checks. Tokens travel in URL fragments and are removed from the page address before submission.

Email changes require the current password and proof of inbox ownership. The previous verified address remains active until replacement verification succeeds. Password resets invalidate the member's sessions and recovery tokens; parent resets also revoke unused learner invitations. Shared database rate limits apply to requests and email sends.

Account email addresses stay in authentication storage, separate from Walrus learning records and coaching prompts. Delivery failures are recorded and displayed in Account settings. Serverless email work uses Vercel's `waitUntil` lifecycle.

Official references: [Resend domains](https://resend.com/docs/dashboard/domains/introduction), [Resend pricing](https://resend.com/pricing), [Namecheap host records](https://www.namecheap.com/support/knowledgebase/article.aspx/434/2237/how-do-i-set-up-host-records-for-a-domain/), [Namecheap MX records](https://www.namecheap.com/support/knowledgebase/article.aspx/322/2237/how-can-i-set-up-mx-records-required-for-mail-service/), [OWASP password recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
