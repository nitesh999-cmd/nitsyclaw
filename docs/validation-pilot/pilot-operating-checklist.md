# Pilot Operating Checklist

Use this for each paid pilot customer.

## Before taking payment

- Explain this is a 2-week pilot.
- Explain it is concierge/manual assisted.
- Explain there is no bank login, email login, payment, SMS send, or call action.
- Explain they can redact sensitive info.
- Confirm refund rule: refund if it does not save time.
- Record the customer in `pilot-tracker.csv`.

## Intake questions

Ask only these:

1. What admin keeps slipping: bills, receipts, reminders, messages, renewals, or something else?
2. What weekly digest day works best?
3. Do you prefer short bullet points or detailed notes?
4. What currency should I use?
5. Anything I must not store or repeat back?

## During the pilot

For every item received:

- Identify type: bill, receipt, reminder, draft, complaint, renewal, other.
- Extract amount, provider, due date, reference, merchant, category where available.
- Create reminder text where useful.
- Add it to the weekly digest.
- If uncertain, ask one short clarification.

## Safety rules

Never:

- Ask for passwords, OTPs, or recovery codes.
- Ask for bank login.
- Make payments.
- Send messages on behalf of the user.
- Call anyone.
- Claim an integration is live.

Always:

- Draft before risky action.
- Ask before storing sensitive details.
- Tell the user if something is outside pilot scope.

## End of week

Send the weekly digest.

Ask:

```text
Was this useful enough that you would pay to continue after the pilot?

If yes, what part was most valuable?
If no, what was missing or not worth paying for?
```

## Evidence to capture

- Paid yes/no.
- What pain they mentioned.
- Whether they sent real admin.
- Whether they opened/read the digest.
- Whether they would continue.
- Exact objection if they would not pay.

