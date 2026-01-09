# Countertop Visualizer

A Next.js application that lets users visualize different countertop materials in their kitchen photos using AI image generation.

## Features

- **AI-Powered Visualization**: Upload a kitchen photo and see how different countertop materials would look using Google Gemini AI
- **AB Testing**: Built-in AB testing to compare limited vs full countertop access variants
- **Phone Verification**: SMS verification via GoHighLevel to unlock all countertop options
- **Lead Capture**: Collect user information for follow-up with integrated GHL CRM
- **Analytics**: PostHog integration for tracking user behavior and conversion funnels

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS v4
- **Database**: Supabase (PostgreSQL)
- **AI**: Google Gemini AI
- **SMS**: Twilio
- **Analytics**: PostHog

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account
- Google AI API key
- Twilio account with a phone number
- GoHighLevel account with API access (optional, for CRM)
- PostHog account (optional, for analytics)

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   
   Copy the example env file and fill in your values:
   ```bash
   cp .env.local.example .env.local
   ```

   Required environment variables:
   ```bash
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

   # Google AI
   GOOGLE_AI_API_KEY=your_google_ai_api_key

   # Twilio (for SMS verification via Verify service)
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_VERIFY_SERVICE_SID=your_verify_service_sid
   TWILIO_PHONE_NUMBER=+1234567890

   # GoHighLevel (optional, for CRM)
   GHL_API_KEY=your_ghl_api_key
   GHL_LOCATION_ID=your_ghl_location_id

   # PostHog (optional)
   NEXT_PUBLIC_POSTHOG_KEY=your_posthog_key
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

   # Sales Team Phone Numbers (comma-separated)
   SALES_TEAM_PHONES=+1234567890,+0987654321
   ```

3. **Set up Supabase database**
   
   Run the migration in your Supabase SQL Editor:
   ```bash
   # Copy contents from:
   supabase/migrations/001_initial_schema.sql
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
countertop-visualizer/
├── app/
│   ├── page.tsx                 # Main app page
│   ├── layout.tsx               # Root layout with PostHog provider
│   ├── providers.tsx            # Client-side providers
│   ├── globals.css              # Tailwind styles
│   └── api/
│       ├── generate-countertop/ # AI image generation
│       ├── send-verification/   # SMS code sending
│       ├── verify-code/         # SMS code verification
│       └── submit-lead/         # Lead form submission
├── components/
│   ├── ImageUpload.tsx          # Drag & drop image upload
│   ├── SlabSelector.tsx         # Countertop selection grid
│   ├── ResultDisplay.tsx        # Generated results display
│   ├── PhoneVerificationModal.tsx
│   ├── LeadCaptureForm.tsx
│   ├── ImageCarousel.tsx
│   ├── ImageComparison.tsx
│   └── ImageModal.tsx
├── lib/
│   ├── supabase.ts              # Supabase client
│   ├── ghl.ts                   # GoHighLevel API helpers
│   ├── posthog.ts               # PostHog client
│   ├── ab-testing.ts            # AB test utilities
│   └── types.ts                 # TypeScript types
├── public/
│   └── slabs/                   # Countertop slab images
└── supabase/
    └── migrations/              # Database migrations
```

## AB Testing

The app implements two variants:

- **Variant A (Limited)**: Shows only 3 featured countertops. Users must verify their phone number to unlock all options.
- **Variant B (Full Access)**: Shows all 19 countertops immediately without verification.

PostHog feature flag: `countertop-slab-access`
- `limited` → Variant A
- `full-access` → Variant B

## API Routes

### POST /api/generate-countertop
Generates a visualization using Gemini AI.

**Request Body:**
```json
{
  "kitchenImage": "base64_encoded_image",
  "slabImage": "base64_encoded_slab",
  "slabId": "marble-white",
  "slabName": "White Marble",
  "slabDescription": "Classic white marble"
}
```

### POST /api/send-verification
Sends SMS verification code via Twilio.

**Request Body:**
```json
{
  "phone": "+15551234567"
}
```

### POST /api/verify-code
Verifies the SMS code.

**Request Body:**
```json
{
  "phone": "+15551234567",
  "code": "123456"
}
```

### POST /api/submit-lead
Submits lead information.

**Request Body:**
```json
{
  "name": "John Smith",
  "email": "john@example.com",
  "address": "123 Main St",
  "phone": "+15551234567",
  "selectedSlabId": "marble-white",
  "selectedSlabName": "White Marble",
  "selectedImageUrl": "data:image/png;base64,...",
  "abVariant": "A"
}
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy

### Netlify

1. Push to GitHub
2. Import to Netlify
3. Set build command: `npm run build`
4. Set publish directory: `.next`
5. Add environment variables
6. Deploy

## Twilio Verify Setup

1. Create a Twilio account at [twilio.com](https://www.twilio.com)
2. Get your Account SID and Auth Token from the [Twilio Console](https://console.twilio.com/)
3. Create a Verify Service:
   - Go to [Verify Services](https://console.twilio.com/us1/develop/verify/services)
   - Click "Create new Verify Service"
   - Give it a name (e.g., "Countertop Visualizer")
   - Copy the Service SID
4. Add the credentials to your `.env.local`:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_PHONE_NUMBER=+1234567890  # For sales notifications
   ```

## PostHog Setup (Optional)

1. Create a PostHog account at [posthog.com](https://posthog.com)
2. Get your project API key
3. Create a feature flag named `countertop-slab-access` with variants:
   - `limited` (50%)
   - `full-access` (50%)
4. Add the PostHog key to your environment variables

## License

MIT
