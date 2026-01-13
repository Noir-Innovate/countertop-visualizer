export class NoirMessenger {
  private apiToken: string;
  private baseUrl = "https://services.leadconnectorhq.com";

  constructor() {
    this.apiToken = process.env.NOIR_API_KEY!;
  }

  async sendMessage(
    to: string,
    body: string,
    name: string,
    attachments?: string[]
  ): Promise<boolean> {
    try {
      console.log("Sending message to:", to);
      console.log("Message body:", body);

      // Search for contact by phone number
      const searchResponse = await fetch(`${this.baseUrl}/contacts/search`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
        body: JSON.stringify({
          locationId: process.env.NOIR_LOCATION_ID,
          page: 1,
          pageLimit: 10,
          filters: [
            {
              field: "phone",
              operator: "eq",
              value: to,
            },
          ],
        }),
      });

      if (!searchResponse.ok) {
        const error = await searchResponse.text();
        console.error("Search API error:", error);
        throw new Error(`Search API error: ${error}`);
      }

      const searchResult = await searchResponse.json();
      let contactId;

      // If contact not found, create one
      if (!searchResult.contacts || searchResult.contacts.length === 0) {
        const createResponse = await fetch(`${this.baseUrl}/contacts/`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
            Version: "2021-07-28",
          },
          body: JSON.stringify({
            phone: to,
            locationId: process.env.NOIR_LOCATION_ID,
            source: "public api",
            name: name,
            timezone: "America/New_York",
            country: "US",
          }),
        });

        if (!createResponse.ok) {
          const error = await createResponse.text();
          console.error("Create contact API error:", error);
          throw new Error(`Create contact API error: ${error}`);
        }

        const createResult = await createResponse.json();
        contactId = createResult.id;
      } else {
        contactId = searchResult.contacts[0].id;
      }

      // Send message using contact ID
      const messagePayload: any = {
        type: "SMS",
        message: body,
        contactId: contactId,
      };

      // Add attachments if provided
      if (attachments && attachments.length > 0) {
        messagePayload.attachments = attachments;
      }

      const messageResponse = await fetch(
        `${this.baseUrl}/conversations/messages`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
            Version: "2021-04-15",
          },
          body: JSON.stringify(messagePayload),
        }
      );

      if (!messageResponse.ok) {
        const error = await messageResponse.text();
        console.error("Message API error:", error);
        throw new Error(`Message API error: ${error}`);
      }

      return true;
    } catch (error) {
      console.error("Failed to send message:", error);
      return false;
    }
  }
}
