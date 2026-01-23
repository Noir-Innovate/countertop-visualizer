import { Resend } from "resend";

// Initialize Resend client
function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Resend API key not configured. Set RESEND_API_KEY environment variable."
    );
  }

  return new Resend(apiKey);
}

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  senderName?: string;
}

// Send email via Resend
export async function sendEmail({
  to,
  subject,
  html,
  from,
  replyTo,
  senderName,
}: SendEmailParams): Promise<{
  success: boolean;
  error?: string;
  id?: string;
}> {
  try {
    const resend = getResendClient();
    const fromEmail =
      from ||
      process.env.RESEND_FROM_EMAIL ||
      "countertopvisualizer@mail.noirinnovates.com";

    // Format from address with sender name
    // Use custom sender name if provided, otherwise default to "Countertop Visualizer"
    const senderDisplayName = senderName || "Countertop Visualizer";
    const fromWithName = fromEmail.includes("<")
      ? fromEmail
      : `${senderDisplayName} <${fromEmail}>`;

    const emailPayload: any = {
      from: fromWithName,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };

    // Add reply-to if provided (Resend API uses camelCase: replyTo)
    if (replyTo) {
      emailPayload.replyTo = replyTo;
    }

    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error("Resend error:", JSON.stringify(error, null, 2));
      return {
        success: false,
        error: error.message || JSON.stringify(error) || "Failed to send email",
      };
    }

    return {
      success: true,
      id: data?.id,
    };
  } catch (error) {
    console.error("Resend send error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}

// Send organization invitation email
export async function sendInvitationEmail({
  to,
  organizationName,
  role,
  invitationUrl,
  inviterName,
}: {
  to: string;
  organizationName: string;
  role: string;
  invitationUrl: string;
  inviterName?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const formatRole = (role: string) => {
    return role
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Countertop Visualizer</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <h1 style="color: #0f172a; font-size: 24px; font-weight: 600; margin-top: 0;">
            You've been invited!
          </h1>
          
          <p style="color: #64748b; font-size: 16px; margin: 16px 0;">
            ${
              inviterName ? `${inviterName} has` : "You have been"
            } invited to join <strong style="color: #0f172a;">${organizationName}</strong> as a <strong style="color: #0f172a;">${formatRole(
    role
  )}</strong>.
          </p>
          
          <div style="margin: 32px 0;">
            <a 
              href="${invitationUrl}" 
              style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;"
            >
              Accept Invitation
            </a>
          </div>
          
          <p style="color: #64748b; font-size: 14px; margin: 24px 0 0;">
            Or copy and paste this link into your browser:
          </p>
          <p style="color: #2563eb; font-size: 14px; word-break: break-all; margin: 8px 0;">
            ${invitationUrl}
          </p>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
          
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `You've been invited to join ${organizationName}`,
    html,
  });
}

// Send lead notification email with kitchen image
export async function sendLeadNotificationEmail({
  to,
  leadInfo,
  kitchenImageUrl,
  originalImageUrl,
  materialLineName,
  senderName,
  replyTo,
}: {
  to: string;
  leadInfo: {
    name: string;
    email: string;
    phone?: string;
    address: string;
    selectedSlab?: string;
  };
  kitchenImageUrl?: string;
  originalImageUrl?: string;
  materialLineName?: string;
  senderName?: string;
  replyTo?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Lead - Countertop Visualizer</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <h1 style="color: #0f172a; font-size: 24px; font-weight: 600; margin-top: 0;">
            🏠 New Countertop Lead!
          </h1>
          
          ${
            originalImageUrl || kitchenImageUrl
              ? `
            <div style="margin: 24px 0;">
              ${
                originalImageUrl && kitchenImageUrl
                  ? `
                <div style="margin-bottom: 24px;">
                  <h3 style="color: #64748b; font-size: 14px; font-weight: 600; margin-bottom: 8px; text-align: center;">Before</h3>
                  <img 
                    src="${originalImageUrl}" 
                    alt="Original kitchen" 
                    style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0;"
                  />
                </div>
                <div>
                  <h3 style="color: #64748b; font-size: 14px; font-weight: 600; margin-bottom: 8px; text-align: center;">Wants Quote For</h3>
                  <img 
                    src="${kitchenImageUrl}" 
                    alt="Kitchen visualization" 
                    style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0;"
                  />
                </div>
              `
                  : originalImageUrl
                  ? `
                <div>
                  <h3 style="color: #64748b; font-size: 14px; font-weight: 600; margin-bottom: 8px;">Original Kitchen</h3>
                  <img 
                    src="${originalImageUrl}" 
                    alt="Original kitchen" 
                    style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0;"
                  />
                </div>
              `
                  : kitchenImageUrl
                  ? `
                <div>
                  <h3 style="color: #64748b; font-size: 14px; font-weight: 600; margin-bottom: 8px;">Wants Quote For</h3>
                  <img 
                    src="${kitchenImageUrl}" 
                    alt="Kitchen visualization" 
                    style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0;"
                  />
                </div>
              `
                  : ""
              }
            </div>
          `
              : ""
          }
          
          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <h2 style="color: #0f172a; font-size: 18px; font-weight: 600; margin-top: 0; margin-bottom: 16px;">
              Lead Details
            </h2>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-weight: 500; width: 120px;">Name:</td>
                <td style="padding: 8px 0; color: #0f172a;">${
                  leadInfo.name
                }</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Email:</td>
                <td style="padding: 8px 0; color: #0f172a;">
                  <a href="mailto:${
                    leadInfo.email
                  }" style="color: #2563eb; text-decoration: none;">${
    leadInfo.email
  }</a>
                </td>
              </tr>
              ${
                leadInfo.phone
                  ? `
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Phone:</td>
                  <td style="padding: 8px 0; color: #0f172a;">
                    <a href="tel:${leadInfo.phone}" style="color: #2563eb; text-decoration: none;">${leadInfo.phone}</a>
                  </td>
                </tr>
              `
                  : ""
              }
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Address:</td>
                <td style="padding: 8px 0; color: #0f172a;">${
                  leadInfo.address
                }</td>
              </tr>
              ${
                leadInfo.selectedSlab
                  ? `
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Selected Slab:</td>
                  <td style="padding: 8px 0; color: #0f172a;">${leadInfo.selectedSlab}</td>
                </tr>
              `
                  : ""
              }
              ${
                materialLineName
                  ? `
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Material Line:</td>
                  <td style="padding: 8px 0; color: #0f172a;">${materialLineName}</td>
                </tr>
              `
                  : ""
              }
            </table>
          </div>
          
          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
            <p style="color: #64748b; font-size: 14px; margin: 0;">
              Please follow up with this lead as soon as possible.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `New Lead: ${leadInfo.name} - ${
      materialLineName || "Countertop Visualizer"
    }`,
    html,
    senderName,
    replyTo,
  });
}

// Send quote confirmation email to user
export async function sendUserQuoteConfirmationEmail({
  to,
  name,
  selectedSlab,
  address,
  kitchenImageUrl,
  originalImageUrl,
  materialLineName,
  senderName,
  replyTo,
}: {
  to: string;
  name: string;
  selectedSlab?: string;
  address: string;
  kitchenImageUrl?: string;
  originalImageUrl?: string;
  materialLineName?: string;
  senderName?: string;
  replyTo?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Quote Request - Countertop Visualizer</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <h1 style="color: #0f172a; font-size: 24px; font-weight: 600; margin-top: 0;">
            Thank You, ${name}!
          </h1>
          
          <p style="color: #64748b; font-size: 16px; margin: 16px 0;">
            We've received your quote request and our team will be in touch with you shortly to discuss your countertop project.
          </p>
          
          ${
            originalImageUrl || kitchenImageUrl
              ? `
            <div style="margin: 24px 0;">
              ${
                originalImageUrl && kitchenImageUrl
                  ? `
                <div style="margin-bottom: 24px;">
                  <h3 style="color: #64748b; font-size: 14px; font-weight: 600; margin-bottom: 8px; text-align: center;">Your Current Kitchen</h3>
                  <img 
                    src="${originalImageUrl}" 
                    alt="Original kitchen" 
                    style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0;"
                  />
                </div>
                <div>
                  <h3 style="color: #64748b; font-size: 14px; font-weight: 600; margin-bottom: 8px; text-align: center;">Your Vision</h3>
                  <img 
                    src="${kitchenImageUrl}" 
                    alt="Kitchen visualization" 
                    style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0;"
                  />
                </div>
              `
                  : originalImageUrl
                  ? `
                <div>
                  <h3 style="color: #64748b; font-size: 14px; font-weight: 600; margin-bottom: 8px;">Your Current Kitchen</h3>
                  <img 
                    src="${originalImageUrl}" 
                    alt="Original kitchen" 
                    style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0;"
                  />
                </div>
              `
                  : kitchenImageUrl
                  ? `
                <div>
                  <h3 style="color: #64748b; font-size: 14px; font-weight: 600; margin-bottom: 8px;">Your Vision</h3>
                  <img 
                    src="${kitchenImageUrl}" 
                    alt="Kitchen visualization" 
                    style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0;"
                  />
                </div>
              `
                  : ""
              }
            </div>
          `
              : ""
          }
          
          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <h2 style="color: #0f172a; font-size: 18px; font-weight: 600; margin-top: 0; margin-bottom: 16px;">
              Your Quote Request Details
            </h2>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-weight: 500; width: 120px;">Name:</td>
                <td style="padding: 8px 0; color: #0f172a;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Address:</td>
                <td style="padding: 8px 0; color: #0f172a;">${address}</td>
              </tr>
              ${
                selectedSlab
                  ? `
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Selected Slab:</td>
                  <td style="padding: 8px 0; color: #0f172a;">${selectedSlab}</td>
                </tr>
              `
                  : ""
              }
              ${
                materialLineName
                  ? `
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Material Line:</td>
                  <td style="padding: 8px 0; color: #0f172a;">${materialLineName}</td>
                </tr>
              `
                  : ""
              }
            </table>
          </div>
          
          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
            <p style="color: #64748b; font-size: 14px; margin: 0 0 16px;">
              Our team will review your request and contact you within 24 hours to discuss your project and provide a detailed quote.
            </p>
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              If you have any questions in the meantime, please don't hesitate to reach out to us.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `Your Quote Request - ${
      materialLineName || "Countertop Visualizer"
    }`,
    html,
    senderName,
    replyTo,
  });
}
