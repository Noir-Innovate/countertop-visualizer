import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ggpyvviweofgpbfwkfbm.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function getImageUrls() {
  const bucketName = 'public-assets'
  const folderPath = 'accent-countertops'

  console.log(`Fetching files from ${bucketName}/${folderPath}...`)

  const { data: files, error } = await supabase.storage
    .from(bucketName)
    .list(folderPath)

  if (error) {
    console.error('Error listing files:', error)
    return
  }

  if (!files || files.length === 0) {
    console.log('No files found')
    return
  }

  console.log(`Found ${files.length} files\n`)

  const urlMap = {}
  
  files.forEach(file => {
    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(`${folderPath}/${file.name}`)
    
    urlMap[file.name] = data.publicUrl
    console.log(`${file.name}: ${data.publicUrl}`)
  })

  return urlMap
}

getImageUrls().catch(console.error)

