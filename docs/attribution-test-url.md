# Attribution test URL

Use this URL to verify lead attribution (UTM + tags) is captured and stored correctly.

## Test URL (full)

```
https://cool-this-are-happening.localhost:3000/?utm_source=facebook&utm_medium=cpc&utm_campaign=spring_2025&utm_term=quartz+countertops&utm_content=hero_banner&tag=test_promo&ref=landing&sales_rep=jane
```

## How to test

1. Open the URL above in your browser (ensure the app is running on port 3000 and the host is configured for `cool-this-are-happening.localhost`).
2. Go through the visualizer flow (kitchen → material → results).
3. Submit a quote (lead form). Attribution is captured on **first load** and sent with the submission.
4. In the dashboard, open **Leads** for that material line and open the new lead.
5. On the lead detail page, check the **Attribution** section: you should see
   - **UTM Source:** facebook
   - **UTM Medium:** cpc
   - **UTM Campaign:** spring_2025
   - **UTM Term:** quartz countertops
   - **UTM Content:** hero_banner
   - **Tags:** tag → test_promo, ref → landing, sales_rep → jane

Referrer will show the previous page if you navigated from another site; direct paste may show "—".

## Params in this URL

| Param        | Value              | Purpose                     |
| ------------ | ------------------ | --------------------------- |
| utm_source   | facebook           | Traffic source              |
| utm_medium   | cpc                | Marketing medium            |
| utm_campaign | spring_2025        | Campaign name               |
| utm_term     | quartz countertops | Paid search term            |
| utm_content  | hero_banner        | Ad/content variant          |
| tag          | test_promo         | Custom tag (stored in tags) |
| ref          | landing            | Custom ref (stored in tags) |
| sales_rep    | jane               | Custom tag (stored in tags) |
