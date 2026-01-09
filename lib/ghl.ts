// GoHighLevel API helpers

const GHL_API_BASE = 'https://services.leadconnectorhq.com'

interface SendSMSParams {
  phone: string
  message: string
}

interface CreateContactParams {
  name: string
  email: string
  phone?: string
  address?: string
  tags?: string[]
  customFields?: Record<string, string>
}

// Send SMS via GHL Conversations API
export async function sendSMS({ phone, message }: SendSMSParams): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.GHL_API_KEY
  const locationId = process.env.GHL_LOCATION_ID

  if (!apiKey || !locationId) {
    console.error('GHL credentials not configured')
    return { success: false, error: 'GHL credentials not configured' }
  }

  try {
    // First, create or find the contact
    const contactResponse = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      },
      body: JSON.stringify({
        locationId,
        phone,
      }),
    })

    if (!contactResponse.ok) {
      const error = await contactResponse.text()
      console.error('Failed to upsert contact:', error)
      return { success: false, error: 'Failed to create contact' }
    }

    const contactData = await contactResponse.json()
    const contactId = contactData.contact?.id

    if (!contactId) {
      return { success: false, error: 'Failed to get contact ID' }
    }

    // Send the SMS message
    const messageResponse = await fetch(`${GHL_API_BASE}/conversations/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      },
      body: JSON.stringify({
        type: 'SMS',
        contactId,
        message,
      }),
    })

    if (!messageResponse.ok) {
      const error = await messageResponse.text()
      console.error('Failed to send SMS:', error)
      return { success: false, error: 'Failed to send SMS' }
    }

    return { success: true }
  } catch (error) {
    console.error('GHL SMS error:', error)
    return { success: false, error: 'Failed to send SMS' }
  }
}

// Create or update a contact in GHL
export async function createContact(params: CreateContactParams): Promise<{ success: boolean; contactId?: string; error?: string }> {
  const apiKey = process.env.GHL_API_KEY
  const locationId = process.env.GHL_LOCATION_ID

  if (!apiKey || !locationId) {
    console.error('GHL credentials not configured')
    return { success: false, error: 'GHL credentials not configured' }
  }

  try {
    const response = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      },
      body: JSON.stringify({
        locationId,
        name: params.name,
        email: params.email,
        phone: params.phone,
        address1: params.address,
        tags: params.tags || ['countertop-lead'],
        customFields: params.customFields,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Failed to create contact:', error)
      return { success: false, error: 'Failed to create contact' }
    }

    const data = await response.json()
    return { success: true, contactId: data.contact?.id }
  } catch (error) {
    console.error('GHL contact error:', error)
    return { success: false, error: 'Failed to create contact' }
  }
}

// Send notification to sales team
export async function notifySalesTeam(salesPhones: string[], leadInfo: {
  name: string
  email: string
  phone?: string
  address: string
  selectedSlab: string
}): Promise<void> {
  const message = `🏠 New Countertop Lead!\n\nName: ${leadInfo.name}\nEmail: ${leadInfo.email}\nPhone: ${leadInfo.phone || 'Not provided'}\nAddress: ${leadInfo.address}\nSelected: ${leadInfo.selectedSlab}\n\nFollow up ASAP!`

  for (const phone of salesPhones) {
    await sendSMS({ phone, message })
  }
}

// Send confirmation to user
export async function sendUserConfirmation(phone: string, name: string): Promise<{ success: boolean; error?: string }> {
  const message = `Hi ${name}! 👋\n\nThanks for using our Countertop Visualizer! One of our specialists will be in touch shortly to discuss your project.\n\n- Accent Countertops`
  
  return sendSMS({ phone, message })
}


