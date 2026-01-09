// Generate Supabase storage URLs for all slab images
const supabaseUrl = 'https://ggpyvviweofgpbfwkfbm.supabase.co'
const bucketName = 'public-assets'
const folderPath = 'accent-countertops'

// File names and extensions from types.ts
const slabFiles = [
  { name: 'Calacatta Grigio', ext: '.jpg' },
  { name: 'Frost White', ext: '.jpg' },
  { name: 'Iced White', ext: '.jpg' },
  { name: 'Macabo Gray', ext: '.jpg' },
  { name: 'New Carrara Pearl', ext: '.jpg' },
  { name: 'Alpine Frost', ext: '.jpg' },
  { name: 'Carrara Latte', ext: '.jpg' },
  { name: 'Calacatta Serene', ext: '.jpg' },
  { name: 'Soapstone Sky', ext: '.jpg' },
  { name: 'Moonlit Ivory', ext: '.jpg' },
  { name: 'Calacatta Oasis', ext: '.jpg' },
  { name: 'Austin Silver', ext: '.png' },
  { name: 'Steel Mirage', ext: '.jpg' },
  { name: 'Winter Luxe', ext: '.jpg' },
  { name: 'Ivory Glow', ext: '.jpg' },
  { name: 'Calacatta Prestige', ext: '.jpg' },
  { name: 'Alabaster Pearl', ext: '.jpg' },
  { name: 'Statuario Allure', ext: '.jpg' },
  { name: 'Calacatta Coastal', ext: '.png' },
  { name: 'Calacatta Lace', ext: '.png' },
  { name: 'Twilight Honed', ext: '.tif' },
  { name: 'Calacatta Eternity', ext: '.jpg' },
  { name: 'Gold Horizon', ext: '.jpg' },
  { name: 'Calacatta Opal', ext: '.tif' },
]

console.log('Supabase Storage URLs:\n')
slabFiles.forEach(file => {
  const fileName = `${file.name}${file.ext}`
  const url = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${folderPath}/${encodeURIComponent(fileName)}`
  console.log(`${file.name}: ${url}`)
})

console.log(`\nTotal: ${slabFiles.length} images`)

