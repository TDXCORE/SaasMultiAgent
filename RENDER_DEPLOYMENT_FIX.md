# Render Deployment Fix Guide

## Problem
The deployment is failing on Render with the following error:
```
Error [ZodError]: Please provide a valid HTTPS URL. Set the variable NEXT_PUBLIC_SITE_URL with a valid URL, such as: 'https://example.com'
```

## Root Cause
The application's configuration (`apps/web/config/app.config.ts`) validates that in production mode, the `NEXT_PUBLIC_SITE_URL` must be an HTTPS URL. Currently, the environment variables are set to `http://localhost:3000`, which fails this validation during the build process.

## Solution

### Step 1: Set Environment Variables in Render Dashboard

1. Go to your Render dashboard
2. Navigate to your web service
3. Go to the "Environment" tab
4. Add the following environment variables:

**Required Variables:**
```
NEXT_PUBLIC_SITE_URL=https://your-app-name.onrender.com
NEXT_PUBLIC_PRODUCT_NAME=Makerkit
NEXT_PUBLIC_SITE_TITLE=Makerkit - The easiest way to build and manage your SaaS
NEXT_PUBLIC_SITE_DESCRIPTION=Makerkit is the easiest way to build and manage your SaaS. It provides you with the tools you need to build your SaaS, without the hassle of building it from scratch.
NEXT_PUBLIC_DEFAULT_THEME_MODE=light
NEXT_PUBLIC_THEME_COLOR=#ffffff
NEXT_PUBLIC_THEME_COLOR_DARK=#0a0a0a
NEXT_PUBLIC_DEFAULT_LOCALE=en
```

**Auth Variables:**
```
NEXT_PUBLIC_AUTH_PASSWORD=true
NEXT_PUBLIC_AUTH_MAGIC_LINK=false
NEXT_PUBLIC_CAPTCHA_SITE_KEY=
```

**Feature Flags:**
```
NEXT_PUBLIC_ENABLE_THEME_TOGGLE=true
NEXT_PUBLIC_LANGUAGE_PRIORITY=application
NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_DELETION=true
NEXT_PUBLIC_LOCALES_PATH=apps/web/public/locales
```

**Supabase Variables (replace with your actual values):**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Step 2: Replace Placeholder URL

**IMPORTANT:** Replace `your-app-name.onrender.com` with your actual Render app URL. You can find this in your Render dashboard under your service details.

### Step 3: Supabase Configuration

If you haven't set up Supabase yet:
1. Create a new project at [supabase.com](https://supabase.com)
2. Get your project URL and API keys from the project settings
3. Replace the placeholder Supabase values in the environment variables

If you want to deploy without Supabase for now, you can use the placeholder values from `.env.local`, but you'll need to set up Supabase eventually for full functionality.

### Step 4: Redeploy

After setting the environment variables:
1. Go to the "Deploys" tab in your Render dashboard
2. Click "Trigger Deploy" to start a new deployment
3. Monitor the build logs to ensure the deployment succeeds

## Environment Variable Priority

Render environment variables will override the values in your `.env` files during deployment. The priority order is:
1. Render Environment Variables (highest priority)
2. `.env.production` (for production builds)
3. `.env.local` (for local development)
4. `.env` (base configuration)

## Verification

After successful deployment, verify that:
1. The site loads at your Render URL
2. The robots.txt file is accessible at `https://your-app-name.onrender.com/robots.txt`
3. The sitemap is accessible at `https://your-app-name.onrender.com/sitemap.xml`

## Common Issues

### Issue: Still getting HTTP URL error
**Solution:** Double-check that `NEXT_PUBLIC_SITE_URL` in Render environment variables uses `https://` and not `http://`

### Issue: Supabase connection errors
**Solution:** Verify that your Supabase URL and keys are correct and that your Supabase project is active

### Issue: Build still failing
**Solution:** Check the Render build logs for any other missing environment variables or configuration issues

## Next Steps

1. Set up your Supabase project properly
2. Configure your domain (if using a custom domain)
3. Set up any additional integrations (email, payments, etc.)
4. Test all functionality in the deployed environment

## Support

If you continue to have issues:
1. Check the Render build logs for specific error messages
2. Verify all environment variables are set correctly
3. Ensure your Supabase project is properly configured
