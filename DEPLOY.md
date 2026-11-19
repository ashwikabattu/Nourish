# Deploying to AWS

The setup:

- **RDS PostgreSQL** for the database
- **Elastic Beanstalk** (Docker platform, single instance) runs the container. Beanstalk builds the image from the `Dockerfile` in this repo.
- **CloudFront** in front of Beanstalk for HTTPS, without buying a domain or setting up a load balancer

Expect about 30–45 minutes the first time. Pick one region (for example `us-east-1`) and use it for every step.

> **Cost:** With the AWS Free Tier this runs for little or nothing at first. Beyond that, a `t3.micro` instance plus a `db.t4g.micro` database costs roughly $20–25/month. Set a billing alarm (**Billing → Budgets**), and run the teardown at the bottom when you no longer need the app.

## 0. Prerequisites

- An AWS account. Sign in as an IAM user with admin access, not the root account.
- The AWS CLI and EB CLI:
  ```bash
  brew install awscli awsebcli
  aws configure          # access key, secret, region (e.g. us-east-1)
  ```
- A free USDA FoodData Central API key for food search: sign up at https://fdc.nal.usda.gov/api-key-signup (it arrives by email in a minute). Without it the app falls back to `DEMO_KEY`, which allows only about 10 searches an hour.
- Push this project to GitHub first. The EB CLI deploys your latest **commit**, so commit before each deploy.

## 1. Create the database (RDS console)

**RDS → Create database**

| Setting | Value |
| --- | --- |
| Creation method | Standard create |
| Engine | PostgreSQL 17 |
| Template | **Free tier** |
| DB instance identifier | `nourish-db` |
| Master username | `nourish` |
| Credentials | Self managed, and set a password. Use only letters and digits so it works in a URL without escaping. |
| Instance class | `db.t4g.micro` |
| Storage | 20 GB gp3, autoscaling off |
| Public access | **No** |
| VPC security group | Create new: `nourish-db-sg` |
| Additional configuration → Initial database name | `nourish` |

Creation takes about 5–10 minutes. When it's done, copy the **Endpoint** from the *Connectivity & security* tab. It looks like `nourish-db.xxxxxxxx.us-east-1.rds.amazonaws.com`.

## 2. Create the Beanstalk environment

From the project root:

```bash
eb init nourish --platform docker --region us-east-1
eb create nourish-prod --single --instance-types t3.micro
```

`--single` runs one instance with no load balancer, which keeps costs low. The first build takes a few minutes. It will report the app as unhealthy until it can reach the database, which the next two steps fix.

## 3. Let the app reach the database

1. **EC2 → Security Groups**: find the group whose name contains `nourish-prod` and `AWSEBSecurityGroup`, and copy its ID (`sg-…`).
2. Open `nourish-db-sg` → **Edit inbound rules** → **Add rule**: type **PostgreSQL** (port 5432), source = the `sg-…` ID from step 1. Save.

Now only your app server can connect to the database. The internet can't.

## 4. Set secrets and deploy

```bash
eb setenv \
  DATABASE_URL="postgres://nourish:YOUR_DB_PASSWORD@YOUR_RDS_ENDPOINT:5432/nourish" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  FDC_API_KEY="YOUR_FOODDATA_CENTRAL_KEY"

eb deploy
eb health      # should go to Ok / Green
eb open        # opens http://nourish-prod.<id>.us-east-1.elasticbeanstalk.com
```

The app creates its tables on first boot, and the connection to RDS uses TLS with certificate verification. The Docker image includes the RDS CA bundle and sets `DATABASE_SSL_CA` automatically.

Beanstalk serves plain **HTTP**, so passwords would travel unencrypted. Do the next step before you share the link.

## 5. Add HTTPS with CloudFront

**CloudFront → Create distribution**

| Setting | Value |
| --- | --- |
| Origin domain | your Beanstalk URL, e.g. `nourish-prod.<id>.us-east-1.elasticbeanstalk.com` |
| Origin protocol | **HTTP only** |
| Viewer protocol policy | **Redirect HTTP to HTTPS** |
| Allowed HTTP methods | **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE** |
| Cache policy | **CachingDisabled** |
| Origin request policy | **AllViewerExceptHostHeader** (forwards the `Authorization` header) |
| Web Application Firewall | Do not enable |

When it finishes deploying (about 5 minutes), your app is at `https://<something>.cloudfront.net`. Use this as your **public link**.

With CloudFront in front there are two proxies, CloudFront and Beanstalk's nginx. Tell the app so per-IP rate limiting sees real client addresses:

```bash
eb setenv TRUST_PROXY=2
```

## Shipping updates

```bash
git commit -am "…"
eb deploy
```

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on every push to check types, tests, lint, and the builds, including the Docker build.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `eb health` is Red / Severe | `eb logs` and look for the app's JSON log lines. `DATABASE_URL is required` or `JWT_SECRET must be set` means step 4 was skipped. |
| `connect ETIMEDOUT` in the logs | The database security group rule from step 3 is missing or points at the wrong group. |
| `password authentication failed` | The password in `DATABASE_URL` is wrong or contains characters that need URL-encoding. |
| Logged out right after signing in through CloudFront | The origin request policy isn't forwarding headers. Set it to **AllViewerExceptHostHeader**. |

## Teardown

To stop all charges:

```bash
eb terminate nourish-prod
```

Then in the console, disable and delete the CloudFront distribution, and delete the RDS instance `nourish-db` (you can skip the final snapshot).
