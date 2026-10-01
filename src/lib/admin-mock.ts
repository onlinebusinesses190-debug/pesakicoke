export const adminStats = {
  totalUsers: 184250,
  activeUsers: 92140,
  pendingKyc: 1280,
  totalDeposits: 184_500_000,
  totalWithdrawals: 92_300_000,
  pendingWithdrawals: 4_120_000,
  platformRevenue: 22_400_000,
  openTickets: 142,
  activeJobs: 5840,
  fundedBusinesses: 312,
};

export const revenueSeries = [
  { m: "Jan", v: 1.2 }, { m: "Feb", v: 1.8 }, { m: "Mar", v: 2.1 },
  { m: "Apr", v: 2.6 }, { m: "May", v: 3.0 }, { m: "Jun", v: 3.4 },
  { m: "Jul", v: 3.9 }, { m: "Aug", v: 4.4 }, { m: "Sep", v: 4.7 },
];

export const adminUsers = [
  { id: "U-10241", name: "Michael Otieno",  email: "michael@pesaki.io",  status: "Active",    kyc: "Verified",  balance: 84250,   joined: "2024-08-12" },
  { id: "U-10242", name: "Grace Wanjiru",   email: "grace.w@pesaki.io",  status: "Active",    kyc: "Verified",  balance: 142800,  joined: "2024-06-04" },
  { id: "U-10243", name: "James Mwangi",    email: "jmwangi@pesaki.io",  status: "Suspended", kyc: "Rejected",  balance: 2400,    joined: "2025-01-22" },
  { id: "U-10244", name: "Aisha Hassan",    email: "aisha@pesaki.io",    status: "Active",    kyc: "Pending",   balance: 0,       joined: "2026-05-30" },
  { id: "U-10245", name: "Peter Kamau",     email: "pkamau@pesaki.io",   status: "Active",    kyc: "Verified",  balance: 318900,  joined: "2023-11-09" },
  { id: "U-10246", name: "Lilian Achieng",  email: "lilian@pesaki.io",   status: "Pending",   kyc: "Pending",   balance: 0,       joined: "2026-06-18" },
];

export const adminTx = [
  { id: "TX-88421", user: "Michael Otieno",  type: "Deposit",    amount:  15000, method: "M-PESA",  status: "Completed", date: "Today, 10:24" },
  { id: "TX-88422", user: "Grace Wanjiru",   type: "Withdrawal", amount:  -8000, method: "Bank",    status: "Pending",   date: "Today, 09:51" },
  { id: "TX-88423", user: "Peter Kamau",     type: "Trading",    amount:  12500, method: "Wallet",  status: "Completed", date: "Today, 08:11" },
  { id: "TX-88424", user: "Aisha Hassan",    type: "Deposit",    amount:   3000, method: "Card",    status: "Failed",    date: "Yesterday"     },
  { id: "TX-88425", user: "James Mwangi",    type: "Withdrawal", amount: -20000, method: "M-PESA",  status: "Flagged",   date: "Jun 19"        },
];

export const adminJobs = [
  { id: "JB-5021", title: "House Help — Karen",     poster: "N. Mwende",   loc: "Nairobi",  pay: 25000, status: "Active" },
  { id: "JB-5022", title: "Event Workers Expo",      poster: "Sarova Ltd", loc: "Nairobi",  pay: 3500,  status: "Active" },
  { id: "JB-5023", title: "Driver — Personal",       poster: "K. Ouma",    loc: "Mombasa",  pay: 35000, status: "Pending" },
  { id: "JB-5024", title: "Math Tutor (Form 4)",     poster: "Bright Aca.",loc: "Kisumu",   pay: 18000, status: "Filled" },
];

export const adminFunding = [
  { id: "BF-301", business: "Mama Mboga Supplies", owner: "L. Achieng",  amount: 200000, status: "Approved",  repaid: 120000 },
  { id: "BF-302", business: "Boda Fleet Expansion",owner: "P. Kamau",    amount: 450000, status: "Reviewing", repaid: 0      },
  { id: "BF-303", business: "Salon Renovation",    owner: "G. Wanjiru",  amount: 80000,  status: "Disbursed", repaid: 22000  },
  { id: "BF-304", business: "AgriDrip Irrigation", owner: "J. Kibet",    amount: 600000, status: "Pending",   repaid: 0      },
];

export const adminSavings = [
  { plan: "PESAKI Save 8%",   apy: "8%",  members: 12480, locked: 48_200_000 },
  { plan: "PESAKI Save 10%",  apy: "10%", members: 5210,  locked: 31_500_000 },
  { plan: "PESAKI Save 12%",  apy: "12%", members: 1840,  locked: 22_900_000 },
];

export const adminTrading = [
  { product: "Binary FX",         users: 1284, volume: 18_400_000, status: "Live" },
  { product: "Up & Down",         users:  920, volume:  9_120_000, status: "Live" },
  { product: "Avimarket",         users: 2140, volume: 22_300_000, status: "Live" },
  { product: "Invest Prediction", users:  480, volume:  6_500_000, status: "Live" },
  { product: "Market Spin",       users: 3210, volume:  4_120_000, status: "Paused" },
];

export const adminTickets = [
  { id: "T-9912", user: "Aisha Hassan",   subject: "KYC verification stuck",    priority: "High",   status: "Open"        },
  { id: "T-9913", user: "James Mwangi",   subject: "Withdrawal flagged",        priority: "Urgent", status: "In Review"   },
  { id: "T-9914", user: "Michael Otieno", subject: "Referral payout missing",   priority: "Med",    status: "Open"        },
  { id: "T-9915", user: "Lilian Achieng", subject: "Cannot link M-PESA",        priority: "Low",    status: "Awaiting User"},
  { id: "T-9916", user: "Peter Kamau",    subject: "Loan repayment receipt",    priority: "Low",    status: "Resolved"    },
];

export const adminNotifs = [
  { title: "Maintenance window",  body: "Wallet maintenance Sun 02:00–03:00 EAT.", audience: "All users",  sent: "2 hrs ago" },
  { title: "12% Savings launch",  body: "New high-yield plan now live.",            audience: "Verified",  sent: "Yesterday" },
  { title: "KYC reminder",        body: "Complete your KYC to unlock withdrawals.", audience: "Unverified",sent: "Jun 18"    },
];

export const adminCommissions = [
  { tier: "Bronze",   referrals: "1–10",   rate: "5%",  payout: 124000 },
  { tier: "Silver",   referrals: "11–50",  rate: "7%",  payout: 482000 },
  { tier: "Gold",     referrals: "51–200", rate: "10%", payout: 1240000 },
  { tier: "Platinum", referrals: "200+",   rate: "15%", payout: 3120000 },
];

export function fmtKES(n: number) {
  const sign = n < 0 ? "-" : "";
  return sign + "KES " + Math.abs(n).toLocaleString();
}

export function fmtCompact(n: number) {
  if (Math.abs(n) >= 1_000_000) return "KES " + (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return "KES " + (n / 1_000).toFixed(1) + "K";
  return "KES " + n.toLocaleString();
}
