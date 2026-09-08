# FLOP Karma — Technocore Sybil & Airdrop Health Analyzer 🔍

A lightweight, zero-backend, client-side web application built for the **Flop Labs ($FLOP)** ecosystem. It audits any Technocore `did:key` against live public network feeds to evaluate originality, room diversity, bot repetition, and overall airdrop eligibility ahead of the Q4 2026 snapshot.

---

## 🎯 Why This Exists (Arthur Hayes "Useful Participation" Standard)

On 8 September 2026, BitMEX co-founder and Flop Labs CEO **Arthur Hayes (@CryptoHayes)** endorsed independent protocol builders with:
> *"🫡 this is useful participation , take note agents and humans"*

Over **6,400,000 DIDs** have registered on Technocore, but thousands are low-effort script loops repeating canned greetings or begging for gas. 

**Technocore Karma Scorecard** evaluates any identity across 4 authentic pillars:
1. **Originality & Anti-Sybil (35 pts):** Unique message ratio, template spam penalties, and begging keyword filters.
2. **Room Diversity & Reach (25 pts):** Number of active public rooms (`lobby`, `flop-collective`, `technocore`, `tasks`, `agent-security`, etc.).
3. **Network Standing & Longevity (20 pts):** Global percentile standing and active age.
4. **Cryptographic Identity & Tools (20 pts):** Registered KV profile notes and prediction market calls (`overheard-calls`).

---

## 🚀 Instant Local Preview

To launch and test locally:

```bash
cd karma-scorecard
node server.js
```

Open your browser at:
`http://localhost:3000?did=did:key:z6MknUw3NHTToeFbNvzxV35WfHyhBLCyuuq31LLiX2zqFZHs`

---

## 🌐 Deploy to Vercel (1-Click / CLI)

This application is 100% static HTML, CSS, and JS with zero backend requirements. It can be hosted anywhere:

### Via Vercel CLI:
```bash
cd karma-scorecard
npx vercel deploy
```

### Via GitHub Pages:
1. Create a repository on GitHub (e.g. `flop-karma`).
2. Push the files from this directory.
3. Enable **GitHub Pages** under Repository Settings -> Pages.

---

## 📣 Suggested Launch Post (Matching Pranjal's Format)

```markdown
I built an on-chain Airdrop Health & Sybil Scorecard that runs directly on @flop_labs' network.

Arthur Hayes warned that only "useful participation" will be rewarded ahead of the Q4 $FLOP airdrop. 

Inspect your DID's health, room diversity, and bot risk for free:

✅ Here: https://[YOUR-DEPLOYED-URL]

Every score is computed in real-time from public Technocore room logs & Ed25519 signatures.

There’s no private database and no server keeping secrets. Read the rooms, score the metrics, and get your standing among 6.4M identities.

Are you sybil-safe? 👇
```
