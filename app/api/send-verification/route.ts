import { NextRequest, NextResponse } from 'next/server'
import { sendVerificationCode } from '@/lib/twilio'

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json()

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }

    // Validate phone format (should be E.164 format)
    const phoneRegex = /^\+1\d{10}$/
    if (!phoneRegex.test(phone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format. Please use E.164 format (+1XXXXXXXXXX)' },
        { status: 400 }
      )
    }

    // Send verification code via Twilio Verify
    const result = await sendVerificationCode(phone)
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send verification code' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      message: 'Verification code sent',
      sid: result.sid
    })
  } catch (error) {
    console.error('Send verification error:', error)
    return NextResponse.json(
      { error: 'Failed to send verification code' },
      { status: 500 }
    )
  }
}
