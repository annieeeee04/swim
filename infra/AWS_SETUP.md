# AWS setup: S3 + CloudFront frontend hosting

This is a one-time setup you (Annie) need to do in your own AWS account — I can't
provision real AWS resources or hold your credentials. Everything below is either
AWS console clicks or AWS CLI commands you run yourself. Once it's done, the
`deploy-frontend-s3` job in `.github/workflows/ci-cd.yml` handles every deploy
after that automatically.

## 1. Create the S3 bucket

```bash
aws s3 mb s3://swim-frontend-annie --region us-west-2
```

Bucket name must be globally unique — pick your own. Keep **Block all public
access** ON; CloudFront will read from the bucket privately via Origin Access
Control (OAC), so the bucket itself never needs to be public.

## 2. Create a CloudFront distribution

In the CloudFront console:

- **Origin**: the S3 bucket above, origin access = "Origin access control settings
  (recommended)" → create a new OAC. CloudFront will give you a bucket policy
  snippet to paste into the bucket's permissions — do that (it scopes
  `s3:GetObject` to just this distribution).
- **Default root object**: `index.html`
- **Custom error responses**: add one for HTTP 403 and one for 404, both
  → response page `/index.html`, response code `200`. This makes client-side
  routing work when someone refreshes on a non-root URL.
- Note the **Distribution ID** once created — you'll need it for the GitHub secret.

## 3. Create an IAM role GitHub Actions can assume (OIDC, no long-lived keys)

This avoids ever storing an AWS access key/secret in GitHub. One-time setup:

1. IAM → Identity providers → Add provider → OpenID Connect:
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
2. IAM → Roles → Create role → Web identity → pick the provider above, audience
   `sts.amazonaws.com`.
3. Trust policy — restrict it to your repo (replace `OWNER/REPO`):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
           "StringLike": { "token.actions.githubusercontent.com:sub": "repo:OWNER/REPO:ref:refs/heads/master" }
         }
       }
     ]
   }
   ```

4. Attach a least-privilege permissions policy (see `infra/iam-deploy-policy.json`
   in this folder — update the bucket name and distribution ARN first).
5. Copy the role's ARN.

## 4. GitHub repo secrets / variables

Settings → Secrets and variables → Actions:

| Name | Type | Value |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | secret | the IAM role ARN from step 3 |
| `AWS_REGION` | secret | e.g. `us-west-2` |
| `S3_BUCKET` | secret | your bucket name, e.g. `swim-frontend-annie` |
| `CLOUDFRONT_DISTRIBUTION_ID` | secret | from step 2 |
| `VITE_API_BASE_URL` | variable | wherever the backend ends up running (e.g. an EC2/ECS URL); used at frontend build time |

Once these exist, every push to `master` that passes the build jobs will sync
`frontend/dist/` to S3 and invalidate the CloudFront cache automatically.

## Local manual deploy (without CI, e.g. to sanity-check the setup)

```bash
cd frontend
npm run build
aws s3 sync dist/ s3://swim-frontend-annie --delete
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*"
```

## Why this design (for interviews)

- **S3 + CloudFront** instead of running the frontend in a container 24/7: it's a
  static SPA build, so a CDN-backed object store is cheaper and faster than
  serving it from a running server.
- **OIDC role assumption** instead of static AWS access keys in GitHub secrets:
  no long-lived credential to leak — GitHub mints a short-lived token per run.
- **Origin Access Control** keeps the S3 bucket private; only CloudFront can
  read from it, the bucket is never publicly browsable directly.
- **Cache invalidation on deploy** ensures users get the new bundle immediately
  instead of waiting out CloudFront's TTL.
