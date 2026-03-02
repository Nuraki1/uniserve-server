# CloudLinux Node.js Selector Setup Guide

## Important: CloudLinux Requirements

CloudLinux Node.js Selector requires `node_modules` to be a **symlink** pointing to the virtual environment's node_modules folder. Do NOT create a physical `node_modules` folder in your application root.

## Post-Deployment Setup Steps

After deploying via FTP, follow these steps in cPanel Terminal:

### 1. Activate Node.js Environment

```bash
source /home/nicecasf/nodevenv/uniserveapi.nicecafe.net/24/bin/activate && cd /home/nicecasf/uniserveapi.nicecafe.net
```

### 2. Fix Package Lock (if compromised)

If you get "Lock compromised" error, regenerate the lock file:

```bash
# Remove the compromised lock file
rm package-lock.json

# Regenerate it
npm install --package-lock-only

# Or use npm install to regenerate and install
npm install
```

### 3. Install Dependencies

```bash
# CloudLinux will automatically create the node_modules symlink
npm install
```

**Note:** CloudLinux Node.js Selector will automatically create the `node_modules` symlink pointing to the virtual environment. You should see a message like:
```
Cloudlinux NodeJS Selector demands to store node modules for application in separate folder (virtual environment) pointed by symlink called "node_modules".
```

This is **normal and expected** - the symlink will be created automatically.

### 4. Generate Prisma Client

```bash
npm run prisma:generate
```

If you get version mismatch errors, the script will use `npx --yes prisma@^5.22.0` to ensure the correct version.

### 5. Run Database Migrations

```bash
npm run prisma:migrate
```

### 6. Restart the Application

In cPanel → Setup Node.js App → Click **RESTART** button

## Troubleshooting

### "Lock compromised" Error

If you see `npm error code ECOMPROMISED`, the package-lock.json is corrupted:

```bash
# Remove and regenerate
rm package-lock.json
npm install
```

### "Prisma version mismatch"

The scripts now use `npx --yes prisma@^5.22.0` to ensure the correct version is used.

### "node_modules must be a symlink"

This is expected! CloudLinux automatically creates the symlink. Do NOT manually create a `node_modules` folder.

### Environment Variables

Make sure these are set in cPanel → Setup Node.js App → Environment Variables:
- `DATABASE_URL` - MySQL connection string
- `JWT_SECRET` - At least 16 characters
- `CLIENT_ORIGIN` - `https://uniserve.nicecafe.net,https://www.uniserve.nicecafe.net`
- `NODE_ENV` - `production` (usually set automatically)

## Verification

After setup, test the API:

```bash
# Test health endpoint
curl https://uniserveapi.nicecafe.net/health

# Should return: {"ok":true}
```





