import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ggpyvviweofgpbfwkfbm.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseServiceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function uploadImages() {
  const bucketName = 'accent-countertops'
  const folderPath = path.join(process.cwd(), 'public', 'accent-countertops-slabs')
  
  // Create bucket if it doesn't exist
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  if (listError) {
    console.error('Error listing buckets:', listError)
    return
  }

  const bucketExists = buckets?.some(b => b.name === bucketName)
  if (!bucketExists) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 52428800, // 50MB
    })
    if (createError) {
      console.error('Error creating bucket:', createError)
      return
    }
    console.log(`Created bucket: ${bucketName}`)
  } else {
    console.log(`Bucket ${bucketName} already exists`)
  }

  // Get all image files
  const files = fs.readdirSync(folderPath).filter(file => 
    /\.(jpg|jpeg|png|tif|tiff)$/i.test(file)
  )

  console.log(`Found ${files.length} images to upload`)

  // Upload each file
  for (const file of files) {
    const filePath = path.join(folderPath, file)
    const fileBuffer = fs.readFileSync(filePath)
    const storagePath = `accent-countertops/${file}`

    console.log(`Uploading ${file}...`)
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, fileBuffer, {
        contentType: file.endsWith('.png') ? 'image/png' : 
                     file.endsWith('.tif') || file.endsWith('.tiff') ? 'image/tiff' : 
                     'image/jpeg',
        upsert: true
      })

    if (error) {
      console.error(`Error uploading ${file}:`, error)
    } else {
      console.log(`✓ Uploaded ${file}`)
    }
  }

  console.log('Upload complete!')
  
  // Get public URLs
  const { data: filesList } = await supabase.storage
    .from(bucketName)
    .list('accent-countertops')

  console.log('\nPublic URLs:')
  filesList?.forEach(file => {
    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(`accent-countertops/${file.name}`)
    console.log(`${file.name}: ${data.publicUrl}`)
  })
}

uploadImages().catch(console.error)

