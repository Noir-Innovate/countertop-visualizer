export interface Slab {
  id: string
  name: string
  imageUrl: string
  description: string
}

export interface GenerationResult {
  slabId: string
  slabName: string
  imageData: string | null
  isLoading: boolean
  error: string | null
}

export interface LeadFormData {
  name: string
  email: string
  address: string
  phone?: string
}

// Old/demo slab options (kept for reference, not used)
export const OLD_SLABS: Slab[] = [
  {
    id: 'alabaster-beige',
    name: 'Alabaster Beige',
    imageUrl: '/slabs/Mightyslab_Alabaster_Beige_Full-1024x2048.jpg',
    description: 'Warm beige alabaster with subtle veining'
  },
  {
    id: 'alabaster-onyx',
    name: 'Alabaster Onyx',
    imageUrl: '/slabs/Mightyslab_Alabaster_Onyx_Full-1024x2048.jpg',
    description: 'Elegant black and white alabaster'
  },
  {
    id: 'arabescato',
    name: 'Arabescato',
    imageUrl: '/slabs/Mightyslab_Arabescato_Full-512x1024.jpg',
    description: 'Classic Arabescato marble with bold veining'
  },
  {
    id: 'azzura',
    name: 'Azzura',
    imageUrl: '/slabs/Mightyslab_Azzura_Full-768x1536.jpg',
    description: 'Beautiful Azzura marble'
  },
  {
    id: 'calcatta-oro',
    name: 'Calcatta Oro',
    imageUrl: '/slabs/Mightyslab_Calcatta_Oro_Full-512x1024.jpg',
    description: 'Luxurious gold-veined Calacatta marble'
  },
  {
    id: 'caravaggio-gold',
    name: 'Caravaggio Gold',
    imageUrl: '/slabs/Mightyslab_Caravaggio_Gold_Full-512x1024.jpg',
    description: 'Rich Caravaggio marble with golden accents'
  },
  {
    id: 'cava-gold',
    name: 'Cava Gold',
    imageUrl: '/slabs/Mightyslab_Cava_Gold_Full-768x1536.jpg',
    description: 'Elegant Cava Gold marble'
  },
  {
    id: 'cremo-delicato',
    name: 'Cremo Delicato',
    imageUrl: '/slabs/Mightyslab_Cremo_Delicato_Full-512x1024.jpg',
    description: 'Delicate cream marble with soft veining'
  },
  {
    id: 'desert-gray',
    name: 'Desert Gray',
    imageUrl: '/slabs/Mightyslab_Desert_Gray_Full-512x1024.jpg',
    description: 'Modern desert gray with natural patterns'
  },
  {
    id: 'fior-di-bosco',
    name: 'Fior Di Bosco',
    imageUrl: '/slabs/Mightyslab_Fior_Di_Bosco_Full-512x1024.jpg',
    description: 'Exotic Fior Di Bosco with dramatic patterns'
  },
  {
    id: 'jade',
    name: 'Jade',
    imageUrl: '/slabs/Mightyslab_Jade_Full-512x1024.jpg',
    description: 'Stunning jade green marble'
  },
  {
    id: 'onice-cobalto',
    name: 'Onice Cobalto',
    imageUrl: '/slabs/Mightyslab_Onice_Cobalto_Full-512x1024.jpg',
    description: 'Striking cobalt blue onyx'
  },
  {
    id: 'onice-smeraldo',
    name: 'Onice Smeraldo',
    imageUrl: '/slabs/Mightyslab_Onice_Smeraldo_Full-512x1024.jpg',
    description: 'Rich emerald green onyx'
  },
  {
    id: 'onice-tiger',
    name: 'Onice Tiger',
    imageUrl: '/slabs/Mightyslab_Onice_Tiger_Full-512x1024.jpg',
    description: 'Bold tiger-striped onyx pattern'
  },
  {
    id: 'pietra-grigia',
    name: 'Pietra Grigia',
    imageUrl: '/slabs/Mightyslab_Pietra_Grigia_Full-512x1024.jpg',
    description: 'Elegant gray stone with natural texture'
  },
  {
    id: 'shape',
    name: 'Shape',
    imageUrl: '/slabs/Mightyslab_Shape_Full-512x1024.jpg',
    description: 'Modern geometric pattern design'
  },
  {
    id: 'sienna-sand',
    name: 'Sienna Sand',
    imageUrl: '/slabs/Mightyslab_Sienna_Sand_Full-512x1024.jpg',
    description: 'Warm sienna sand with earthy tones'
  },
  {
    id: 'statuario-classico',
    name: 'Statuario Classico',
    imageUrl: '/slabs/Mightyslab_Statuario_Classico-512x1024.jpg',
    description: 'Classic Statuario marble with elegant veining'
  },
  {
    id: 'statuario-imperiale',
    name: 'Statuario Imperiale',
    imageUrl: '/slabs/Mightyslab_Statuario_Imperiale_Full-768x1536.jpg',
    description: 'Luxurious Statuario Imperiale marble'
  }
]

// Helper function to get image URL from Supabase storage
function getImageUrl(name: string, extension: string = '.jpg'): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ggpyvviweofgpbfwkfbm.supabase.co'
  const fileName = `${name}${extension}`
  // Bucket: public-assets, Folder: accent-countertops
  return `${supabaseUrl}/storage/v1/object/public/public-assets/accent-countertops/${fileName}`
}

// Accent Countertops Signature Series Quartz Slabs
export const SLABS: Slab[] = [
  {
    id: 'calacatta-grigio',
    name: 'Calacatta Grigio',
    imageUrl: getImageUrl('Calacatta Grigio', '.jpg'),
    description: 'This marble-look quartz offers timeless elegance with the durability and easy maintenance of quartz. Ideal for waterfall islands, compact spaces, and both traditional and modern designs, it\'s perfect for countertops, islands, backsplashes, floors, and accent walls.'
  },
  {
    id: 'frost-white',
    name: 'Frost White',
    imageUrl: getImageUrl('Frost White'),
    description: 'Frost White Quartz features glistening white tones with a refined, elegant look. Durable and low maintenance, it\'s ideal for countertops, islands, backsplashes, and accent walls. Whether as a statement or subtle backdrop, this versatile white quartz offers timeless style and endless design potential.'
  },
  {
    id: 'iced-white',
    name: 'Iced White',
    imageUrl: getImageUrl('Iced White'),
    description: 'Iced White Quartz features soft white tones with subtle gray highlights for a clean, elegant look. Durable, stain-resistant, and easy to maintain, it\'s ideal for residential or commercial spaces, including countertops, backsplashes, and accent walls—effortlessly elevating any design.'
  },
  {
    id: 'macabo-gray',
    name: 'Macabo Gray',
    imageUrl: getImageUrl('Macabo Gray'),
    description: 'Macabo Gray Quartz features a modern neutral gray tone with subtle speckling for added depth. Durable and low maintenance, it suits both residential and commercial spaces and is ideal for countertops, waterfall islands, accent walls, and other surfaces seeking understated sophistication.'
  },
  {
    id: 'new-carrara-pearl',
    name: 'New Carrara Pearl',
    imageUrl: getImageUrl('New Carrara Pearl'),
    description: 'New Carrara Pearl Quartz features a warm white background with elegant veining inspired by classic Carrara marble. Durable, scratch- and stain-resistant, and easy to maintain, it\'s ideal for countertops, waterfall islands, shower surrounds, accent walls, and other refined design applications.'
  },
  {
    id: 'alpine-frost',
    name: 'Alpine Frost',
    imageUrl: getImageUrl('Alpine Frost'),
    description: 'Alpine Frost Quartz features a pure, solid white surface with no veining for a clean, timeless look. Stain-resistant and low-maintenance, it\'s ideal for countertops, accent walls, shower surrounds, and architectural elements in both residential and commercial spaces.'
  },
  {
    id: 'carrara-latte',
    name: 'Carrara Latte',
    imageUrl: getImageUrl('Carrara Latte'),
    description: 'Carrara Latte Quartz features a warm white background with short gold and brown veining for a refined, marble-inspired look. Durable and low-maintenance, it\'s ideal for countertops, accent walls, and other surfaces in both residential and commercial spaces.'
  },
  {
    id: 'calacatta-serene',
    name: 'Calacatta Serene',
    imageUrl: getImageUrl('Calacatta Serene'),
    description: 'Calacatta Serene Quartz features bold cool gray veining with warm brown accents for a natural, marble-inspired look. Its balanced pattern adds timeless elegance to residential and commercial spaces, making it ideal for countertops, islands, backsplashes, and other sophisticated design applications.'
  },
  {
    id: 'soapstone-sky',
    name: 'Soapstone Sky',
    imageUrl: getImageUrl('Soapstone Sky'),
    description: 'Soapstone Sky Quartz features a neutral slate-gray tone with long, delicate white veining for a refined, soapstone-inspired look. Durable and easy to maintain, it\'s ideal for countertops, walls, and high-traffic residential or commercial spaces seeking a distinctive, timeless aesthetic.'
  },
  {
    id: 'moonlit-ivory',
    name: 'Moonlit Ivory',
    imageUrl: getImageUrl('Moonlit Ivory'),
    description: 'Moonlit Ivory Quartz features a pristine white background with delicate marble-like veining for a clean, refined look. Ideal for countertops, waterfall islands, backsplashes, and accent walls, it brings contemporary elegance to both residential and commercial spaces.'
  },
  {
    id: 'calacatta-oasis',
    name: 'Calacatta Oasis',
    imageUrl: getImageUrl('Calacatta Oasis'),
    description: 'Calacatta Oasis Quartz features a luminous white background with striking veining for a warm, inviting look. Versatile and eye-catching, it\'s ideal for waterfall islands, countertops, backsplashes, accent walls, and shower spaces in both residential and commercial settings.'
  },
  {
    id: 'austin-silver',
    name: 'Austin Silver',
    imageUrl: getImageUrl('Austin Silver', '.png'),
    description: 'Austin Silver Quartz boasts a calming gray backdrop with understated, flecks and movement that lend depth and character. This quartz material achieves a contemporary and revitalizing visual appeal, all while offering the advantages of durability, low maintenance, and versatile utility.'
  },
  {
    id: 'steel-mirage',
    name: 'Steel Mirage',
    imageUrl: getImageUrl('Steel Mirage'),
    description: 'A modern take on warm grey limestone, Steel Mirage features a subtle two-tone background with a fine, granite-like texture. Delicate warm veins are scattered across the surface, creating a sophisticated yet natural aesthetic.'
  },
  {
    id: 'winter-luxe',
    name: 'Winter Luxe',
    imageUrl: getImageUrl('Winter Luxe'),
    description: 'Inspired by the timeless beauty of Calacatta marble, Winter Luxe exudes elegance with its harmonious blend of warm and cool tones. Soft, flowing veins intertwine warm hues with delicate greys, bringing a refined and luxurious touch to any space.'
  },
  {
    id: 'ivory-glow',
    name: 'Ivory Glow',
    imageUrl: getImageUrl('Ivory Glow'),
    description: 'Drawing from the soft, neutral tones of natural limestone, Ivory Glow offers a warm beige foundation accented by fine, even veining. Its understated elegance makes it a versatile choice, seamlessly complementing both classic and contemporary designs.'
  },
  {
    id: 'calacatta-prestige',
    name: 'Calacatta Prestige',
    imageUrl: getImageUrl('Calacatta Prestige'),
    description: 'Bold and striking, Calacatta Prestige showcases dramatic, thick veins set against a luminous gray-toned background. The high-contrast pattern makes a statement in any space, blending classic elegance with modern sophistication.'
  },
  {
    id: 'alabaster-pearl',
    name: 'Alabaster Pearl',
    imageUrl: getImageUrl('Alabaster Pearl'),
    description: 'Alabaster Pearl combines timeless beauty with everyday durability. This polished marble-look quartz features a soft white backdrop with sweeping gray veins, offering a luxurious yet low-maintenance surface perfect for countertops, backsplashes, and more.'
  },
  {
    id: 'statuario-allure',
    name: 'Statuario Allure',
    imageUrl: getImageUrl('Statuario Allure'),
    description: 'Embodying the elegance of classic Italian Carrara marble, Statuario Allure presents a pristine white surface with delicate, sparkling grey highlights. Its depth and refinement make it an exquisite choice for sophisticated interiors.'
  },
  {
    id: 'calacatta-coastal',
    name: 'Calacatta Coastal',
    imageUrl: getImageUrl('Calacatta Coastal', '.png'),
    description: 'A captivating fusion of tradition and modernity, Calacatta Coastal boasts a crisp white base accented by dramatic veins in taupe, gold, and striking blue. Perfect for statement countertops, waterfall islands, and accent walls, this quartz offers both breathtaking aesthetics and effortless durability.'
  },
  {
    id: 'calacatta-lace',
    name: 'Calacatta Lace',
    imageUrl: getImageUrl('Calacatta Lace', '.png'),
    description: 'Refined and elegant, Calacatta Lace features a striking combination of white and gray tones with bold veining in deep gray and soft gold. Designed for those who appreciate understated luxury, this quartz enhances any space with its rich depth and sophisticated presence.'
  },
  {
    id: 'twilight-honed',
    name: 'Twilight Honed',
    imageUrl: getImageUrl('Twilight Honed', '.tif'),
    description: 'A stunning embodiment of quartz innovation, Twilight Honed blends the depth of nightfall hues with a sleek, matte finish. The result is a modern, versatile surface that complements a variety of design styles.'
  },
  {
    id: 'calacatta-eternity',
    name: 'Calacatta Eternity',
    imageUrl: getImageUrl('Calacatta Eternity'),
    description: 'With a luminous white backdrop and flowing grey veins interwoven with subtle golden accents, Calacatta Eternity is a tribute to the timeless elegance of Calacatta Gold marble. Its distinguished appearance adds an air of luxury to any interior.'
  },
  {
    id: 'gold-horizon',
    name: 'Gold Horizon',
    imageUrl: getImageUrl('Gold Horizon'),
    description: 'Graceful gold and gray veins sweep across a soft white background, creating a beautifully balanced and refined design. Gold Horizon offers a sophisticated yet warm aesthetic, making it a standout choice for elegant interiors.'
  },
  {
    id: 'calacatta-opal',
    name: 'Calacatta Opal',
    imageUrl: getImageUrl('Calacatta Opal', '.tif'),
    description: 'A stunning blend of classic marble beauty and modern quartz innovation, Calacatta Opal features intricate veining and a luminous surface that captures the essence of natural stone while delivering superior durability.'
  }
]

// Featured slabs for Variant A (limited view) - using Accent Countertops slabs
export const FEATURED_SLAB_IDS = ['calacatta-grigio', 'frost-white', 'calacatta-serene']
