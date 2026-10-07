/**
 * Canonical, verified PESAKI company facts.
 *
 * Single source of truth for public identity, contact details, referral rules and
 * the Business Hub funding model. Nothing in this file may be added unless the
 * owner has verified it. Registration of a business name is NOT a licence.
 */

export const COMPANY = {
  legalName: "PESAKI MARKETING",
  brand: "PESAKI",
  registrationNumber: "BN-6ASR2E26",
  registeringAuthority: "Business Registration Service (BRS), Kenya",
  country: "Republic of Kenya",
  website: "https://pesaki.co.ke",
  email: "pesaki777@gmail.com",
  /** Displayed as 0140399389 */
  whatsapp: "0140399389",
  whatsappDial: "254140399389",
  founder: "Michael Ndung'u",
  director: "Hans Jaoko",
  directorNote: "Founder, Stratum Energy Ventures Ltd",
  tagline: "Work. Grow. Bank.",
} as const;

export const OFFICES = [
  {
    name: "Nairobi Office",
    address: "Along Tom Mboya Street, Nairobi",
    note: "Currently under renovation. Contact the Help Center before visiting, as walk-in availability is not guaranteed during this period.",
  },
  {
    name: "Santon Business Center",
    address: "Santon, Nairobi",
    note: "Our business location. Please confirm the best time to visit with the Help Center in advance.",
  },
] as const;

/**
 * Referral rules as implemented and published in the app (Profile → Referral
 * programme). Backed by migration 20260920_update_referral_rewards.sql, which
 * credits the referrer 10% of the referred user's first qualifying deposit and
 * the referred user a KES 10 welcome bonus.
 */
export const REFERRAL = {
  headline: "Earn 10% of a referred user's first deposit",
  creditWindow: "credited within 24 hours of the qualifying deposit",
  welcomeBonus: "KES 10 welcome bonus for the person you refer",
  conditions: [
    "Only a referred user's first qualifying deposit counts.",
    "Self-invites and multi-accounting are not eligible and will be reversed, with the account suspended.",
  ],
} as const;

/**
 * Business Hub funding model. The agreed return is a share of monthly business
 * profit under contract — it is NOT an equity or shareholding interest, and must
 * never be described as company ownership unless the signed contract says so.
 */
export const BUSINESS_FUNDING = {
  summary: "An agreed 10% of monthly business profit",
  mentorship: {
    duration: "approximately 3 hours of structured mentorship",
    focus: "understanding and starting or growing an SME",
    covers: [
      "business fundamentals",
      "how the business will operate",
      "responsibilities associated with funding",
      "how the business will be monitored",
    ],
  },
  approvalNotice:
    "Funding is subject to eligibility, assessment and approval. Terms are disclosed and agreed before funding is provided.",
  steps: [
    "The parties agree on the applicable terms.",
    "The entrepreneur signs the relevant agreement.",
    "Funding is provided according to the agreement.",
    "PESAKI monitors the supported business.",
    "PESAKI provides ongoing guidance and monitoring.",
    "The entrepreneur provides the agreed return according to the contract.",
  ],
} as const;

/** Services PESAKI actually offers, described without unsupported claims. */
export const SERVICES = [
  {
    key: "kazi",
    name: "KAZI Link",
    to: "/kazi",
    description: "Find work and hire talent. Build up your work profile/CV. Connect with work opportunities and skilled talent across Kenya. Free to use.",
  },
  {
    key: "business",
    name: "Business Hub",
    to: "/business",
    description: "Business mentorship, support and funding opportunities for SME, startups, ongoing businesses, eligible entrepreneurs. Free to apply for business funding.",
  },
  {
    key: "banking",
    name: "Banking Hub",
    to: "/banking",
    description: "Save, lock and borrow. Manage financial services available through PESAKI.",
  },
  {
    key: "wallet",
    name: "Wallet",
    to: "/wallet",
    description: "Manage the wallet functionality available within your account.",
  },
] as const;

export const HOW_IT_WORKS = [
  {
    title: "Create your PESAKI account",
    body: "Register with your name, date of birth and either your phone number or email address.",
  },
  {
    title: "Explore the services available to you",
    body: "Look through KAZI Link, Business Hub, Banking Hub and your wallet to see what applies to you.",
  },
  {
    title: "Complete any required verification or eligibility requirements",
    body: "Some services need identity verification or an eligibility assessment before you can use them.",
  },
  {
    title: "Use the selected service according to its terms",
    body: "Each service has its own terms. Read them before you proceed.",
  },
  {
    title: "Track your activity through your PESAKI account",
    body: "Balances, transactions and referral earnings are visible inside your account.",
  },
  {
    title: "Contact the PESAKI Help Center whenever clarification is required",
    body: "You are never expected to rely on third parties to understand a service.",
  },
] as const;

/** Account and wallet information the current application actually provides. */
export const ACCOUNT_VISIBILITY = [
  "Your available wallet balance",
  "Your transaction history, with filters for deposits and withdrawals",
  "Deposits to your wallet",
  "Withdrawals from your wallet",
  "Transfers from your wallet",
  "Your total deposits and total withdrawals to date",
  "Your referral earnings to date",
] as const;

export const REGULATORY_STATEMENT =
  "PESAKI is committed to complying with applicable Kenyan laws and regulatory requirements relevant to the services it provides.";

export const REGISTRATION_STATEMENT =
  "Registration of PESAKI MARKETING as a business name should not be interpreted as a licence or authorization to conduct activities that require separate regulatory approval.";

export const DATA_PROTECTION_STATEMENT =
  "PESAKI is implementing its data protection compliance requirements and will update this page with applicable registration information when available.";

/**
 * Organization structured data. Only verified fields — no ratings, reviews,
 * awards or government affiliations.
 */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: COMPANY.legalName,
    alternateName: COMPANY.brand,
    legalName: COMPANY.legalName,
    url: COMPANY.website,
    email: COMPANY.email,
    telephone: `+${COMPANY.whatsappDial}`,
    foundingDate: "2025",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Nairobi",
      addressCountry: "KE",
      streetAddress: OFFICES[0].address,
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        telephone: `+${COMPANY.whatsappDial}`,
        email: COMPANY.email,
        availableLanguage: ["en"],
      },
    ],
    founder: {
      "@type": "Person",
      name: COMPANY.founder,
    },
    knowsAbout: ["KAZI Link", "Business Hub", "Banking Hub", "PESAKI Wallet"],
  };
}
