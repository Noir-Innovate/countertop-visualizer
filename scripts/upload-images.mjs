import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const supabaseUrl = 'https://ggpyvviweofgpbfwkfbm.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseServiceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required. Please set it as an environment variable.')
  console.error('You can find it in your Supabase dashboard under Settings > API > service_role key')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function uploadImages() {
  const bucketName = 'accent-countertops'
  const folderPath = path.join(__dirname, '..', 'public', 'accent-countertops-slabs')
  
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

  // Check if folder exists
  if (!fs.existsSync(folderPath)) {
    console.error(`Folder does not exist: ${folderPath}`)
    return
  }

  // Get all image files
  const files = fs.readdirSync(folderPath).filter(file => 
    /\.(jpg|jpeg|png|tif|tiff)$/i.test(file)
  )

  if (files.length === 0) {
    console.error(`No image files found in ${folderPath}`)
    console.log('Files in directory:', fs.readdirSync(folderPath))
    return
  }

  console.log(`Found ${files.length} images to upload`)

  // Upload each file
  let successCount = 0
  let errorCount = 0
  
  for (const file of files) {
    const filePath = path.join(folderPath, file)
    
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      errorCount++
      continue
    }
    
    const fileBuffer = fs.readFileSync(filePath)
    const storagePath = `accent-countertops/${file}`

    console.log(`Uploading ${file} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)...`)
    
    const contentType = file.toLowerCase().endsWith('.png') ? 'image/png' : 
                       file.toLowerCase().endsWith('.tif') || file.toLowerCase().endsWith('.tiff') ? 'image/tiff' : 
                       'image/jpeg'
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: true
      })

    if (error) {
      console.error(`✗ Error uploading ${file}:`, error.message || error)
      errorCount++
    } else {
      console.log(`✓ Uploaded ${file}`)
      successCount++
    }
  }

  console.log(`\nUpload summary: ${successCount} successful, ${errorCount} failed`)

  console.log('\nUpload complete!')
  
  // Get public URLs
  const { data: filesList } = await supabase.storage
    .from(bucketName)
    .list('accent-countertops')

  console.log('\nPublic URLs:')
  const urlMap = {}
  filesList?.forEach(file => {
    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(`accent-countertops/${file.name}`)
    urlMap[file.name] = data.publicUrl
    console.log(`${file.name}: ${data.publicUrl}`)
  })
  
  return urlMap
}

uploadImages().catch(console.error)

