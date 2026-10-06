# Pesaki FX trading upgrade

## Trade screen and presentation
- Keep users on Trade after BUY or SELL. Show an expandable **My open trades** area with live results and a Close button for every position, including fullscreen.
- Retain Trade, Markets, Positions and History, clear KSh amounts, Demo/Real separation and real-order confirmation.
- Refine the existing light design into a sharper trading workspace: stronger hierarchy, readable market prices, compact account summaries and subtle price-change feedback.

## Five-second rule and fees
- Add an explicitly labelled **Demo risk simulation**, with rules shown before opening a trade. Never disguise timed deductions as market losses or apply them to real money.
- Preserve 10× leverage: the proposed default deduction is **20% of reserved margin every five seconds while the price is unfavorable**, capped at the remaining margin. This differs from the document's 20% of the full amount, which would consume the entire 10% margin in the first interval.
- Persist each deduction and final settlement atomically. Closing stops future deductions; exhausted margin closes the position; balances cannot go negative.
- Charge the documented settlement fee: **KSh 5 for trades through KSh 1,000; 1% of the original amount above KSh 1,000**. Show estimated fees before execution, actual fees and net results in History; cap deductions at available settlement proceeds.
- Make risk settings configurable on the backend and snapshot applicable rules on each trade for a reconstructable record.

## Prices and existing-site access
- Make the shared simulated market update more visibly and support larger **demo** swings, without promising a 5% return or presenting accelerated synthetic prices as real forex quotes.
- Remove the extra forex sign-in experience, but retain secure account checks. Reuse the existing website's session once this branch is integrated; do not make wallets public or create shared anonymous accounts.
- Real-money execution stays unavailable until a genuine broker and the parent wallet are connected. The current engine produces simulated prices, not real-market executions.

## Verification and delivery
- Test BUY and SELL without navigation, closing on Trade and fullscreen, fee boundaries (500, 999, 1,000, 2,000), repeated five-second deductions, close/deduction races, exhausted margin, refresh continuity and account isolation.
- Verify both narrow and wide screens and fix errors affecting these flows.
- Deliver a guide covering frontend, backend, formulas, risk rules, configuration, testing and parent-site integration.
- Changes here affect this project only. Replacing the forex branch in **pesakicoke** and confirming GitHub synchronization require access to that project; do not claim an external repository was updated.

## Technical approach
- Reuse the existing FX modules and TanStack server functions. Keep bearer authentication on wallet operations and row-level owner access.
- Implement ledger-backed, idempotent settlement under database locks. Use one bounded server-side processing path for risk ticks; evaluate the scheduler's five-second availability and cost before enabling it.
- Keep real quotes/execution separate from simulation parameters. Record architectural rules in AGENTS.md and ship focused regression tests.