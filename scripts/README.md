# Upload Images to Supabase Storage

To upload the countertop images to Supabase storage:

1. Get your Supabase Service Role Key from your Supabase dashboard:
   - Go to Settings > API
   - Copy the `service_role` key (not the anon key)

2. Run the upload script:
```bash
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here node scripts/upload-images.mjs
```

The script will:
- Create the `accent-countertops` bucket if it doesn't exist
- Upload all images from `public/accent-countertops-slabs/` to Supabase storage
- Display the public URLs for each uploaded image

