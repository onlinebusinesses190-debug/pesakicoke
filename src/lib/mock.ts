export const user = {
  name: "Michael",
  avatar: "MO",
  balance: 84250,
  totalEarnings: 142800,
  referralEarnings: 12400,
  referralCode: "PESAKI-MIKE24",
  referrals: 38,
  currency: "KES",
};

export const stats = [
  { label: "Active Trades", value: "12", trend: "+3", tone: "primary" as const },
  { label: "Jobs Completed", value: "47", trend: "+5", tone: "gold" as const },
  { label: "Investment Growth", value: "+18.4%", trend: "YTD", tone: "success" as const },
  { label: "Businesses Funded", value: "3", trend: "Active", tone: "primary" as const },
];

export const opportunities = [
  { title: "Senior House Help — Karen", category: "KAZI Link", pay: "KES 25,000/mo", tag: "New" },
  { title: "Agritech Startup — Series Seed", category: "Funding", pay: "Up to KES 2M", tag: "Hot" },
  { title: "PESAKI Savings 12% APY", category: "Announcement", pay: "Limited time", tag: "Featured" },
  { title: "Event Workers — Nairobi Expo", category: "KAZI Link", pay: "KES 3,500/day", tag: "Urgent" },
];

export const transactions = [
  { id: "tx1", type: "Deposit",        amount: 15000,  date: "Today, 10:24",   status: "Completed" },
  { id: "tx2", type: "Job Earnings",   amount: 4500,   date: "Today, 08:11",   status: "Completed" },
  { id: "tx3", type: "Trading",        amount: -1200,  date: "Yesterday",      status: "Completed" },
  { id: "tx4", type: "Withdrawal",     amount: -8000,  date: "Yesterday",      status: "Pending"   },
  { id: "tx5", type: "Savings",        amount: -5000,  date: "Jun 18",         status: "Completed" },
  { id: "tx6", type: "Business Funding",amount: 50000, date: "Jun 15",         status: "Completed" },
];

export const tradingProducts = [
  { key: "binary",   name: "Binary FX",        desc: "Trade market movements and predict price direction.", stat: "1,284 active traders", color: "primary" },
  { key: "updown",   name: "Up & Down",        desc: "Quick predictions on short-term price moves.",         stat: "92% payout",          color: "gold"    },
  { key: "avi",      name: "Avimarket",        desc: "Live multiplier game with cash-out anytime.",          stat: "x1.45 last round",    color: "success" },
  { key: "invest",   name: "Invest Prediction",desc: "Predict long-term asset performance.",                 stat: "+18.4% avg.",         color: "primary" },
  { key: "spin",     name: "Market Spin",      desc: "Daily market spin for instant rewards.",               stat: "Resets in 04:12:33",  color: "gold"    },
];

export const jobCategories = [
  "House Helps", "Cleaners", "Tutors", "Gardeners", "Drivers",
  "Plumbers", "Electricians", "Security Guards", "Event Workers", "Casual Labourers",
];

export const workers = [
  { name: "Grace Wanjiru",  loc: "Nairobi, Karen",   rating: 4.9, jobs: 84, skills: ["House Help", "Cooking"], badge: "Top Rated" },
  { name: "James Otieno",   loc: "Mombasa, Nyali",   rating: 4.7, jobs: 52, skills: ["Driver", "Mechanic"],    badge: "Verified" },
  { name: "Aisha Hassan",   loc: "Kisumu",           rating: 4.8, jobs: 36, skills: ["Tutor", "English"],      badge: "Verified" },
  { name: "Peter Mwangi",   loc: "Nakuru",           rating: 4.6, jobs: 18, skills: ["Plumber"],               badge: "New Worker" },
];

export const savingsGoals = [
  { name: "School Fees",       saved: 42000,  target: 80000,  apy: "10%" },
  { name: "Business Expansion",saved: 120000, target: 500000, apy: "12%" },
  { name: "Emergency Fund",    saved: 18000,  target: 50000,  apy: "8%"  },
  { name: "Land Purchase",     saved: 250000, target: 1200000,apy: "12%" },
];

export const businessApps = [
  { name: "Mama Mboga Supplies", amount: 200000, status: "Approved",   repaid: 120000 },
  { name: "Boda Fleet Expansion",amount: 450000, status: "Reviewing",  repaid: 0      },
  { name: "Salon Renovation",    amount: 80000,  status: "Disbursed",  repaid: 22000  },
];

export const successStories = [
  { name: "Wanjiku's Bakery",  grew: "3x revenue", quote: "PESAKI funded our second oven and packaging line." },
  { name: "Tech4Kids Academy", grew: "5 branches", quote: "From one classroom to five — funded in 18 months." },
];

export function fmt(n: number) {
  const sign = n < 0 ? "-" : "";
  return sign + "KES " + Math.abs(n).toLocaleString();
}
