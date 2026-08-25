# M-Pesa STK Edge Function

This edge function sends a Safaricom STK push request for wallet deposits.

## Required environment variables

Set these in your Supabase project secrets or local `.env` before running locally:

- `DARAJA_CONSUMER_KEY`
- `DARAJA_CONSUMER_SECRET`
- `DARAJA_PASSKEY`
- `DARAJA_SHORTCODE`
- `DARAJA_CALLBACK_URL`
- `DARAJA_ENV` (`sandbox` or `production`)
- `SUPABASE_URL`
- `SERVICE_ROLE_KEY`

## Run locally

1. Install Supabase CLI and Deno.
2. In the repo root:

   ```bash
   supabase functions serve mpesa-stk --env-file supabase/functions/mpesa-stk/.env.example
   ```

3. Send a POST request with `Authorization: Bearer <supabase-access-token>` and JSON body:

   ```json
   {
     "userId": "<uuid>",
     "phone": "0712345678",
     "amount": 500
   }
   ```

## Notes

- The function normalizes Kenyan mobile numbers like `0712345678` to `254712345678` before pushing to Daraja.
- It verifies the request token against Supabase auth and matches the request user id.
