import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

interface RequestBody {
  kitchenImage: string
  slabImage: string
  slabId: string
  slabName: string
  slabDescription: string
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== Function started ===')
    console.log('Parsing request body...')
    
    const body: RequestBody = await request.json()
    const { kitchenImage, slabImage, slabName, slabDescription } = body

    console.log('Request data:', {
      hasKitchenImage: !!kitchenImage,
      kitchenImageSize: kitchenImage?.length || 0,
      hasSlabImage: !!slabImage,
      slabImageSize: slabImage?.length || 0,
      slabName,
      slabDescription
    })

    if (!kitchenImage) {
      console.error('Missing kitchen image')
      return NextResponse.json(
        { error: 'Kitchen image is required' },
        { status: 400 }
      )
    }

    if (!slabImage) {
      console.error('Missing slab image')
      return NextResponse.json(
        { error: 'Slab image is required' },
        { status: 400 }
      )
    }

    // Get API key from environment variable
    console.log('Checking for API key...')
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      console.error('API key not found in environment')
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      )
    }
    console.log('API key found:', apiKey.substring(0, 10) + '...')

    // Initialize Google GenAI
    console.log('Initializing Google GenAI...')
    const ai = new GoogleGenAI({ apiKey })
    console.log('API initialized')

    // Extract base64 data (remove data URL prefix if present)
    console.log('Processing images...')
    const base64KitchenImage = kitchenImage.includes(',') 
      ? kitchenImage.split(',')[1] 
      : kitchenImage

    const base64SlabImage = slabImage.includes(',')
      ? slabImage.split(',')[1]
      : slabImage

    // Determine mime type from data URL or default to image/jpeg
    const kitchenMimeType = kitchenImage.includes(',')
      ? kitchenImage.split(',')[0].split(':')[1].split(';')[0]
      : 'image/jpeg'

    const slabMimeType = slabImage.includes(',')
      ? slabImage.split(',')[0].split(':')[1].split(';')[0]
      : 'image/jpeg'

    console.log('Image details:', {
      kitchenMimeType,
      kitchenBase64Size: base64KitchenImage.length,
      slabMimeType,
      slabBase64Size: base64SlabImage.length
    })

    // Create simple prompt array (following the example structure)
    console.log('Creating prompt...')

    console.log('Building contents array...')
    const contents = [
      { 
        inlineData: {
          mimeType: slabMimeType,
          data: base64SlabImage,
        },
      },
      {
        inlineData: {
          mimeType: kitchenMimeType,
          data: base64KitchenImage,
        },
      }, 
      { 
        text: `The first image is a slab of rock.
Put the design on the countertops of the second image.
Use the aspect ratio of the second image.
Only edit the countertops, keep the rest of the kitchen the same.`
      },
    ]

    const response = await ai.models.generateContent({
      // model: 'gemini-2.5-flash-image',
      model: 'gemini-3-pro-image-preview',
      contents: contents,
      config: {
        responseModalities: ['Image'],
        imageConfig: {
          aspectRatio: '16:9',
          // imageSize: '2K',
        },
      },
    })

    console.log('Received response from Google GenAI')
    console.log('Response structure:', {
      hasCandidates: !!response.candidates,
      candidatesLength: response.candidates?.length || 0
    })

    // Extract the generated image
    const parts = response.candidates?.[0]?.content?.parts || []
    console.log('Parts found:', parts.length)
    
    let generatedImageData = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      console.log(`Part ${i}:`, {
        hasText: !!part.text,
        hasInlineData: !!part.inlineData,
        inlineDataType: part.inlineData?.mimeType
      })
      
      if (part.text) {
        console.log('Text response:', part.text)
      }
      else if (part.inlineData) {
        generatedImageData = part.inlineData.data || ''
        console.log('Found image data, size:', generatedImageData.length)
        break
      }
    }

    if (!generatedImageData) {
      console.error('No image data found in response')
      console.error('Full response:', JSON.stringify(response, null, 2))
      return NextResponse.json(
        { 
          error: 'No image generated',
          details: 'The AI did not return an image. Check function logs for details.'
        },
        { status: 500 }
      )
    }

    console.log('Successfully generated image, returning response')

    return NextResponse.json({ imageData: generatedImageData })
  } catch (error) {
    console.error('=== ERROR ===')
    console.error('Error type:', error?.constructor?.name)
    console.error('Error message:', error instanceof Error ? error.message : String(error))
    console.error('Error stack:', error instanceof Error ? error.stack : 'N/A')
    console.error('Full error:', JSON.stringify(error, null, 2))
    
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate image',
        details: error instanceof Error ? error.stack : String(error)
      },
      { status: 500 }
    )
  }
}
