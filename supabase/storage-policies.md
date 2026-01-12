# Supabase Storage Policies Setup

This document explains how to set up storage policies for the `public-assets` bucket to allow organization-based access control.

## Folder Structure

Materials are stored in the following structure:
```
public-assets/
  {org-slug}/
    {material-line-slug}/
      image1.jpg
      image2.png
      ...
```

Example:
```
public-assets/
  accent-countertops/
    signature-series/
      Calacatta_Grigio.jpg
      Frost_White.jpg
      ...
```

## Storage Policies

Set up the following policies in Supabase Dashboard → Storage → public-assets → Policies:

### 1. Public Read Access (SELECT)
**Policy Name:** `Public can read all materials`
- **Operation:** SELECT
- **Target Roles:** anon, authenticated
- **Policy Definition:**
```sql
true
```
This allows anyone to view material images (needed for the public visualizer).

### 2. Authenticated Upload (INSERT)
**Policy Name:** `Org members can upload to their org folder`
- **Operation:** INSERT
- **Target Roles:** authenticated
- **Policy Definition:**
```sql
(bucket_id = 'public-assets'::text) AND 
((storage.foldername(name))[1] IN (
  SELECT slug FROM organizations 
  WHERE id IN (
    SELECT organization_id FROM organization_members 
    WHERE profile_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
))
```
This allows only organization owners/admins to upload files to folders matching their organization slug.

### 3. Authenticated Update/Delete (UPDATE/DELETE)
**Policy Name:** `Org members can manage files in their org folder`
- **Operation:** UPDATE, DELETE
- **Target Roles:** authenticated
- **Policy Definition:**
```sql
(bucket_id = 'public-assets'::text) AND 
((storage.foldername(name))[1] IN (
  SELECT slug FROM organizations 
  WHERE id IN (
    SELECT organization_id FROM organization_members 
    WHERE profile_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
))
```

## Setup Instructions

1. Go to Supabase Dashboard → Storage → public-assets
2. Click on "Policies" tab
3. Create the three policies listed above
4. Make sure the bucket is set to "Public" for SELECT operations

## Alternative: Using Supabase CLI

If you're using Supabase CLI, you can add these policies to your migration files, but storage policies are typically managed through the dashboard or Storage API.

