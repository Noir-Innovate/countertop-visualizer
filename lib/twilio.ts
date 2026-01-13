import twilio from "twilio";

// Initialize Twilio client
function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN."
    );
  }

  return twilio(accountSid, authToken);
}

// Get Twilio Verify Service SID
function getVerifyServiceSid(): string {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!serviceSid) {
    throw new Error(
      "TWILIO_VERIFY_SERVICE_SID not configured. Create a Verify service in Twilio Console and add the Service SID."
    );
  }

  return serviceSid;
}

interface SendSMSParams {
  phone: string;
  message: string;
}

// Send SMS via Twilio (for non-verification messages)
export async function sendSMS({
  phone,
  message,
}: SendSMSParams): Promise<{ success: boolean; error?: string }> {
  const fromNumber = process.env.TWILIO_PHONE;

  if (!fromNumber) {
    console.error("TWILIO_PHONE not configured");
    return { success: false, error: "SMS service not configured" };
  }

  try {
    const client = getTwilioClient();

    await client.messages.create({
      body: message,
      from: fromNumber,
      to: phone,
    });

    return { success: true };
  } catch (error) {
    console.error("Twilio SMS error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send SMS",
    };
  }
}

interface SendMMSParams {
  phone: string;
  message: string;
  mediaUrl: string;
}

// Send MMS via Twilio (for images)
export async function sendMMS({
  phone,
  message,
  mediaUrl,
}: SendMMSParams): Promise<{ success: boolean; error?: string }> {
  const fromNumber = process.env.TWILIO_PHONE;

  if (!fromNumber) {
    console.error("TWILIO_PHONE not configured");
    return { success: false, error: "MMS service not configured" };
  }

  try {
    const client = getTwilioClient();

    await client.messages.create({
      body: message,
      from: fromNumber,
      to: phone,
      mediaUrl: [mediaUrl], // Twilio expects an array of media URLs
    });

    return { success: true };
  } catch (error) {
    console.error("Twilio MMS error:", error);
    // Fallback to SMS if MMS fails
    console.log("Falling back to SMS...");
    return sendSMS({ phone, message: `${message}\n\nView image: ${mediaUrl}` });
  }
}

// Send verification code using Twilio Verify
export async function sendVerificationCode(
  phone: string
): Promise<{ success: boolean; error?: string; sid?: string }> {
  try {
    const client = getTwilioClient();
    const serviceSid = getVerifyServiceSid();

    const verification = await client.verify.v2
      .services(serviceSid)
      .verifications.create({ to: phone, channel: "sms" });

    return {
      success: true,
      sid: verification.sid,
    };
  } catch (error) {
    console.error("Twilio Verify error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to send verification code",
    };
  }
}

// Verify code using Twilio Verify
export async function verifyCode(
  phone: string,
  code: string
): Promise<{ success: boolean; error?: string; status?: string }> {
  try {
    const client = getTwilioClient();
    const serviceSid = getVerifyServiceSid();

    const verificationCheck = await client.verify.v2
      .services(serviceSid)
      .verificationChecks.create({ to: phone, code });

    if (verificationCheck.status === "approved") {
      return {
        success: true,
        status: verificationCheck.status,
      };
    } else {
      return {
        success: false,
        error: "Invalid or expired verification code",
        status: verificationCheck.status,
      };
    }
  } catch (error) {
    console.error("Twilio Verify check error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}

// Send notification to sales team
export async function notifySalesTeam(
  salesPhones: string[],
  leadInfo: {
    name: string;
    email: string;
    phone?: string;
    address: string;
    selectedSlab: string;
  }
): Promise<void> {
  const message = `🏠 New Countertop Lead!\n\nName: ${leadInfo.name}\nEmail: ${
    leadInfo.email
  }\nPhone: ${leadInfo.phone || "Not provided"}\nAddress: ${
    leadInfo.address
  }\nSelected: ${leadInfo.selectedSlab}\n\nFollow up ASAP!`;

  for (const phone of salesPhones) {
    await sendSMS({ phone, message });
  }
}

// Send confirmation to user with image link
export async function sendUserConfirmation(
  phone: string,
  name: string,
  selectedSlab?: string,
  imageUrl?: string,
  leadInfo?: {
    email?: string;
    address?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  let message = `Hi ${name}! 👋\n\nThanks for requesting a quote!`;

  if (selectedSlab) {
    message += `\n\nSelected Countertop: ${selectedSlab}`;
  }

  if (leadInfo?.email) {
    message += `\n\nEmail: ${leadInfo.email}`;
  }

  if (leadInfo?.address) {
    message += `\n\nAddress: ${leadInfo.address}`;
  }

  message += `\n\nOne of our specialists will be in touch shortly to discuss your project.\n\n- Accent Countertops`;

  // Note: SMS doesn't support images directly. If you want to share the image,
  // you'd need to upload it to a CDN and include the link here.
  // For now, we're sending the confirmation with their details.

  return sendSMS({ phone, message });
}
