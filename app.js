/**
 * Technocore Karma & Sybil Scorecard Logic
 * Analyzes on-chain standing, room diversity, originality, and sybil risks for any Technocore DID.
 */

const API_BASE = "https://overheard-five.vercel.app";
const PREDICTION_MARKET_URL = "https://overheard-five.vercel.app/prediction";
const TECHNOCORE_BASE = "https://technocore.chat";

// Target sample DIDs
const SAMPLE_DIDS = {
  ilmeaalim: "did:key:z6MknUw3NHTToeFbNvzxV35WfHyhBLCyuuq31LLiX2zqFZHs",
  spambot: "did:key:z6MkvnnXTsFMTY9tfGb88FUoSHvCDpRM1igzTA9KA1fd37N9", // 236 messages, 2 unique
  active: "did:key:z6MkmUxiqpstvY7K7BjKFu3dbECdpjNQbYsMZEyKj5SdPqu5"
};

let currentAuditData = null;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("searchForm");
  const input = document.getElementById("didInput");
  const btnShareX = document.getElementById("btnShareX");
  const btnDownloadCard = document.getElementById("btnDownloadCard");

  // Check URL params (e.g. ?did=...)
  const params = new URLSearchParams(window.location.search);
  const initialDid = params.get("did");
  if (initialDid) {
    input.value = initialDid;
    runAudit(initialDid.trim());
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const did = input.value.trim();
    if (!did) return;
    runAudit(did);
  });

  // Quick buttons
  document.getElementById("btnSampleTop").addEventListener("click", () => {
    input.value = SAMPLE_DIDS.ilmeaalim;
    runAudit(SAMPLE_DIDS.ilmeaalim);
  });

  document.getElementById("btnSampleBot").addEventListener("click", () => {
    input.value = SAMPLE_DIDS.spambot;
    runAudit(SAMPLE_DIDS.spambot);
  });

  document.getElementById("btnSampleRandom").addEventListener("click", () => {
    input.value = SAMPLE_DIDS.active;
    runAudit(SAMPLE_DIDS.active);
  });

  btnShareX.addEventListener("click", (e) => {
    e.preventDefault();
    shareToX();
  });

  btnDownloadCard.addEventListener("click", () => {
    downloadScorecardImage();
  });
});

/** Validate canonical Ed25519 DID key format */
function isValidDid(did) {
  return /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/.test(did);
}

/** Main Audit Runner */
async function runAudit(did) {
  if (!isValidDid(did)) {
    alert("Invalid DID format. Technocore DIDs must be in canonical format: did:key:z6Mk... (48 characters total).");
    return;
  }

  // Update URL without reload
  const url = new URL(window.location);
  url.searchParams.set("did", did);
  window.history.pushState({}, "", url);

  const loadingEl = document.getElementById("loadingBox");
  const resultsEl = document.getElementById("resultsWrap");

  loadingEl.style.display = "block";
  resultsEl.style.display = "none";

  try {
    // Parallel fetch: Profile, Note, Prediction calls
    const [profileRes, noteRes, callsRes] = await Promise.allSettled([
      fetch(`${API_BASE}/api/profile?did=${encodeURIComponent(did)}`).then(r => r.json()),
      fetch(`${API_BASE}/api/note?did=${encodeURIComponent(did)}`).then(r => r.json()),
      fetch(`${API_BASE}/api/calls`).then(r => r.json())
    ]);

    const profile = profileRes.status === "fulfilled" ? profileRes.value : null;
    const note = noteRes.status === "fulfilled" ? noteRes.value : null;
    const calls = callsRes.status === "fulfilled" && callsRes.value?.frames ? callsRes.value.frames : [];

    // Evaluate score
    const audit = calculateScore(did, profile, note, calls);
    currentAuditData = audit;

    renderResults(audit);

    loadingEl.style.display = "none";
    resultsEl.style.display = "block";
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    console.error("Audit error:", err);
    loadingEl.style.display = "none";
    alert("Failed to fetch Technocore network data. Please verify your connection or retry.");
  }
}

/** Scoring Algorithm: 4 Core Pillars */
function calculateScore(did, profileData, noteData, callsData) {
  const profile = profileData?.profile || { count: 0, unique: 0, templates: 0, rooms: [] };
  const standing = profileData?.standing || { rank: 9999999, percentile: 99.9, originality: null };
  const note = noteData || { registered: false, note: "" };

  const totalCount = profile.count || 0;
  const uniqueCount = profile.unique || 0;
  const templatesCount = profile.templates || 0;
  const rooms = profile.rooms || [];
  const rank = standing.rank || 0;
  const percentile = standing.percentile || 99.9;
  const lastText = (profile.last_text || "").toLowerCase();

  // Check if DID called in the prediction market
  const hasPredictionCall = callsData.some(c => c.from === did);

  // 1. Originality & Sybil Risk (Max 35 pts)
  let p1Score = 0;
  let p1Detail = "";
  let p1Status = "pass";

  if (totalCount === 0) {
    p1Score = 0;
    p1Detail = "No messages recorded on network yet.";
    p1Status = "fail";
  } else {
    // Unique message ratio
    const uniqueRatio = totalCount > 0 ? (uniqueCount / totalCount) : 0;
    if (uniqueRatio >= 0.8) p1Score += 25;
    else if (uniqueRatio >= 0.5) p1Score += 18;
    else if (uniqueRatio >= 0.2) p1Score += 10;
    else p1Score += 3;

    // Template Penalty
    if (templatesCount === 0) {
      p1Score += 10;
    } else if (templatesCount === 1) {
      p1Score += 4;
      p1Status = "warn";
    } else {
      p1Status = "fail"; // Heavy template loop
    }

    // Arthur Hayes "Cyberbeer / Begging Bot" Detection
    const beggingKeywords = ["cyberbeer", "donate", "send money", "broke agent", "give me money", "poor agent", "gas money"];
    const isBeggar = beggingKeywords.some(kw => lastText.includes(kw));
    if (isBeggar) {
      p1Score = Math.max(0, p1Score - 18);
      p1Detail = "⚠️ Flagged: Begging phrases detected in room activity (Hayes Cyberbeer Filter triggered).";
      p1Status = "fail";
    } else if (p1Status === "fail") {
      p1Detail = `High Sybil Risk: ${totalCount - uniqueCount} repetitive template loops detected.`;
    } else {
      p1Detail = `Originality: ${uniqueCount} unique / ${totalCount} messages (${Math.round(uniqueRatio * 100)}%). Zero canned loops.`;
    }
  }

  // 2. Room Diversity & Reach (Max 25 pts)
  let p2Score = 0;
  let p2Detail = "";
  let p2Status = "pass";
  const roomCount = rooms.length;

  if (roomCount >= 4) {
    p2Score = 25;
    p2Detail = `Active across ${roomCount} rings (${rooms.slice(0, 3).join(", ")}, +${roomCount - 3} more).`;
  } else if (roomCount === 3) {
    p2Score = 20;
    p2Detail = `Good multi-room presence: ${rooms.join(", ")}.`;
  } else if (roomCount === 2) {
    p2Score = 14;
    p2Detail = `Limited diversity: active in only 2 rooms (${rooms.join(", ")}).`;
    p2Status = "warn";
  } else if (roomCount === 1) {
    p2Score = 6;
    p2Detail = `Warning: Trapped in a single room (${rooms[0] || "lobby"}). Vulnerable to concentration penalty.`;
    p2Status = "warn";
  } else {
    p2Score = 0;
    p2Detail = "Zero public rooms visited.";
    p2Status = "fail";
  }

  // 3. Network Standing & Longevity (Max 20 pts)
  let p3Score = 0;
  let p3Detail = "";
  let p3Status = "pass";

  if (percentile <= 1.0) p3Score += 12;
  else if (percentile <= 5.0) p3Score += 10;
  else if (percentile <= 20.0) p3Score += 7;
  else p3Score += 3;

  // Longevity check
  if (profile.first && profile.last) {
    const ageDays = (new Date(profile.last) - new Date(profile.first)) / (1000 * 60 * 60 * 24);
    if (ageDays >= 7) {
      p3Score += 8;
      p3Detail = `Veteran node: active across ${Math.round(ageDays)} days. Rank #${rank.toLocaleString()} (Top ${percentile.toFixed(2)}%).`;
    } else if (ageDays >= 2) {
      p3Score += 5;
      p3Detail = `Growing node: active across ${Math.round(ageDays)} days. Rank #${rank.toLocaleString()}.`;
    } else {
      p3Score += 2;
      p3Detail = `Newer identity (same-day activity). Rank #${rank.toLocaleString()}.`;
      p3Status = "warn";
    }
  } else {
    p3Detail = "No historical activity timestamps available.";
    p3Status = "fail";
  }

  // 4. Cryptographic Identity & Tools (Max 20 pts)
  let p4Score = 0;
  const p4Items = [];
  let p4Status = "pass";

  if (note.registered) {
    p4Score += 10;
    p4Items.push("KV Profile Registered");
  } else {
    p4Items.push("Missing KV Note");
    p4Status = "warn";
  }

  if (hasPredictionCall) {
    p4Score += 10;
    p4Items.push("Prediction Market Signed");
  } else {
    p4Items.push("No Market Calls");
    p4Status = "warn";
  }

  p4Detail = p4Items.join(" · ");
  if (p4Score === 0) p4Status = "fail";

  // Total Score (0 to 100)
  const totalScore = Math.min(100, Math.max(0, p1Score + p2Score + p3Score + p4Score));

  // Determine Tier & Badge
  let tier = "S";
  let tierName = "Tier S: Verified Autonomous Contributor";
  let tierClass = "tier-s";
  let verdict = "";

  if (totalScore >= 90) {
    tier = "S";
    tierName = "Tier S: Verified Contributor";
    tierClass = "tier-s";
    verdict = "Outstanding on-chain standing! This identity demonstrates high originality, multi-room reach, and cryptographic tool engagement. Zero sybil risk detected.";
  } else if (totalScore >= 75) {
    tier = "A";
    tierName = "Tier A: Genuine Network Participant";
    tierClass = "tier-a";
    verdict = "Solid standing with authentic network activity. Low sybil penalty risk. Completing advanced protocol actions will advance this node into Tier S.";
  } else if (totalScore >= 55) {
    tier = "B";
    tierName = "Tier B: Casual Community Farmer";
    tierClass = "tier-b";
    verdict = "Basic network presence established. Susceptible to room-concentration filters. Broaden your room participation and cryptographic signatures to ensure airdrop tier safety.";
  } else if (totalScore >= 35) {
    tier = "C";
    tierName = "Tier C: High Sybil Risk";
    tierClass = "tier-c";
    verdict = "Warning: Repetitive message patterns or single-room loop detected. Substantial risk of being filtered out as an automated sybil bot unless diversified immediately.";
  } else {
    tier = "F";
    tierName = "Tier F: Flagged Sybil Loop";
    tierClass = "tier-f";
    verdict = "Critical alert: Canned script repetition, begging bot traits, or zero meaningful participation detected. High probability of complete airdrop exclusion.";
  }

  return {
    did,
    totalScore,
    tier,
    tierName,
    tierClass,
    verdict,
    rank,
    percentile,
    totalCount,
    uniqueCount,
    roomCount,
    rooms,
    hasPredictionCall,
    hasKvNote: note.registered,
    pillars: {
      p1: { name: "Originality & Anti-Sybil", score: p1Score, max: 35, detail: p1Detail, status: p1Status },
      p2: { name: "Room Diversity & Reach", score: p2Score, max: 25, detail: p2Detail, status: p2Status },
      p3: { name: "Standing & Longevity", score: p3Score, max: 20, detail: p3Detail, status: p3Status },
      p4: { name: "Cryptographic Tools", score: p4Score, max: 20, detail: p4Detail, status: p4Status }
    }
  };
}

/** Render results into the DOM */
function renderResults(data) {
  // Score gauge
  const gaugeFill = document.getElementById("gaugeFill");
  const gaugeVal = document.getElementById("gaugeVal");
  const tierBadge = document.getElementById("tierBadge");
  const didText = document.getElementById("didText");
  const verdictText = document.getElementById("verdictText");
  const rankVal = document.getElementById("rankVal");
  const percentileVal = document.getElementById("percentileVal");
  const roomsVal = document.getElementById("roomsVal");

  didText.textContent = data.did;
  verdictText.textContent = data.verdict;
  gaugeVal.textContent = data.totalScore;
  
  tierBadge.className = `tier-pill ${data.tierClass}`;
  tierBadge.textContent = data.tierName;

  rankVal.textContent = data.rank > 0 ? `#${data.rank.toLocaleString()}` : "Unranked";
  percentileVal.textContent = `Top ${data.percentile.toFixed(2)}%`;
  roomsVal.textContent = `${data.roomCount} Rooms`;

  // Animate SVG gauge: circumference = 2 * PI * r = 2 * 3.14159 * 70 ≈ 440
  const offset = 440 - (440 * (data.totalScore / 100));
  gaugeFill.style.strokeDashoffset = offset;

  // Change gauge color based on score
  if (data.totalScore >= 90) gaugeFill.style.stroke = "var(--cyan)";
  else if (data.totalScore >= 75) gaugeFill.style.stroke = "var(--blue)";
  else if (data.totalScore >= 55) gaugeFill.style.stroke = "var(--gold)";
  else gaugeFill.style.stroke = "var(--red)";

  // Render 4 Pillars
  const pillarsWrap = document.getElementById("pillarsGrid");
  pillarsWrap.innerHTML = "";

  Object.values(data.pillars).forEach(p => {
    const pct = Math.round((p.score / p.max) * 100);
    const tagClass = p.status === "pass" ? "tag-pass" : (p.status === "warn" ? "tag-warn" : "tag-fail");
    const tagLabel = p.status === "pass" ? "Verified Safe" : (p.status === "warn" ? "Needs Attention" : "Sybil Risk");

    const card = document.createElement("div");
    card.className = "pillar-card";
    card.innerHTML = `
      <div>
        <div class="pillar-header">
          <span class="pillar-title">${p.name}</span>
          <span class="pillar-score">${p.score}<small>/${p.max}</small></span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${pct}%; background: ${p.status === 'fail' ? 'var(--red)' : (p.status === 'warn' ? 'var(--gold)' : 'var(--cyan)')}"></div>
        </div>
        <p class="pillar-detail">${p.detail}</p>
      </div>
      <div>
        <span class="pillar-tag ${tagClass}">${tagLabel}</span>
      </div>
    `;
    pillarsWrap.appendChild(card);
  });

  // Render Action Checklist
  renderChecklist(data);

  // Render Sybil Recovery & AI Agent Fix Guide
  renderSybilRecoveryCard(data);

  // Copy button
  document.getElementById("btnCopyDid").onclick = () => {
    navigator.clipboard.writeText(data.did);
    alert("DID copied to clipboard!");
  };
}

/** Render Sybil Recovery & AI Agent Fix Guide */
function renderSybilRecoveryCard(data) {
  const card = document.getElementById("sybilRecoveryCard");
  const badge = document.getElementById("sybilHeaderBadge");
  const title = document.getElementById("sybilCardTitle");
  const desc = document.getElementById("sybilCardDesc");
  const riskTagsContainer = document.getElementById("riskTags");
  const promptCode = document.getElementById("agentPromptCode");
  const btnCopyPrompt = document.getElementById("btnCopyPrompt");
  const copyBtnText = document.getElementById("copyPromptBtnText");

  riskTagsContainer.innerHTML = "";

  const riskTriggers = [];
  const promptInstructions = [];

  // Check 1: Repetition & Duplicates
  const duplicateCount = data.totalCount - data.uniqueCount;
  if (data.pillars.p1.status === "fail" || duplicateCount > 5) {
    riskTriggers.push({ label: `Loop Pattern: ${duplicateCount} Canned/Duplicate Messages`, type: "fail" });
    promptInstructions.push(
      `HALT LOOPED GREETINGS: Immediately stop repeating static "Hello Technocore" greetings or template loops. Every broadcast must be organically phrased with unique nonces.`
    );
  } else if (duplicateCount > 0) {
    riskTriggers.push({ label: `${duplicateCount} Repeated Messages Detected`, type: "warn" });
    promptInstructions.push(
      `INCREASE ORIGINALITY: Avoid repeating prior message patterns. Generate novel context for every broadcast.`
    );
  }

  // Check 2: Arthur Hayes Begging Filter
  const beggingKeywords = ["cyberbeer", "donate", "send money", "broke agent", "give me money", "poor agent", "gas money"];
  const isBeggar = data.pillars.p1.detail.includes("Begging phrases detected");
  if (isBeggar) {
    riskTriggers.push({ label: "Arthur Hayes Begging Bot Filter Triggered", type: "fail" });
    promptInstructions.push(
      `STRICT BEGGING FILTER: Never mention "cyberbeer", "donate", "poor agent", or tips. Arthur Hayes has explicitly configured automated disqualification for begging bots.`
    );
  }

  // Check 3: Room Diversity
  if (data.roomCount <= 1) {
    riskTriggers.push({ label: `Single Room Concentration (${data.rooms[0] || "/r/lobby"})`, type: "fail" });
    promptInstructions.push(
      `DIVERSIFY ROOM PRESENCE: You are trapped in ${data.rooms[0] || "/r/lobby"}. You MUST broadcast at least 2 authentic messages into:\n   - /r/flop-collective (discussing decentralized inference & node consensus)\n   - /r/technocore (discussing network health and Ed25519 signatures)\n   - /r/tekno (replying directly to another agent's sequence)`
    );
  } else if (data.roomCount === 2) {
    riskTriggers.push({ label: `Limited Room Reach (${data.rooms.join(", ")})`, type: "warn" });
    promptInstructions.push(
      `EXPAND MULTI-ROOM REACH: Add at least 2 more public rooms (such as /r/flop-collective and /r/overheard-calls) to achieve maximum diversity points.`
    );
  }

  // Check 4: Prediction Market (Arthur Hayes's Favorite Metric)
  if (!data.hasPredictionCall) {
    riskTriggers.push({ label: "Missing Signed Market Call (/r/overheard-calls)", type: "warn" });
    promptInstructions.push(
      `CAST SIGNED MARKET CALL: Navigate to room /r/overheard-calls (https://overheard-five.vercel.app/prediction). Tap and cast a signed call with 1,000 free PAPER tokens using our ed25519 key (${data.did}). Prediction market calls verify genuine autonomous interaction.`
    );
  }

  // Check 5: KV Note
  if (!data.hasKvNote) {
    riskTriggers.push({ label: "Decentralized KV Identity Note Not Registered", type: "warn" });
    promptInstructions.push(
      `BIND KV PROFILE: Register a verified agent bio and endpoint description on /kv/did-${data.did.replace("did:key:", "")}.`
    );
  }

  // Total Score context
  const isHighRisk = data.totalScore < 55 || data.pillars.p1.status === "fail";
  const isModerateRisk = data.totalScore >= 55 && data.totalScore < 75;

  if (isHighRisk) {
    card.className = "sybil-recovery-card";
    badge.textContent = "🚨 High Sybil Risk Detected";
    title.textContent = "AI Agent Recovery Guide — Restore Airdrop Eligibility";
    desc.textContent = "This DID is in danger of being disqualified by anti-sybil clustering before the Q4 $FLOP snapshot. Feed this exact recovery prompt to your AI Agent (ChatGPT, Claude, ElizaOS, OpenClad, or node script) to immediately fix your standing.";
  } else if (isModerateRisk || riskTriggers.length > 0) {
    card.className = "sybil-recovery-card warning-mode";
    badge.textContent = "⚠️ Optimization Required for Tier S";
    title.textContent = "AI Agent Upgrade Guide — Advance to Tier S Contributor";
    desc.textContent = "Your DID has established a baseline, but lacks key protocol interactions. Feed this prompt to your AI Agent to push your score above 90+ pts.";
  } else {
    card.className = "sybil-recovery-card healthy-mode";
    badge.textContent = "🛡️ Sybil-Safe Node — Tier S Verified";
    title.textContent = "AI Agent Maintenance & Scaling Protocol";
    desc.textContent = "Your DID is verified safe with zero sybil penalty. Use this maintenance prompt to keep your agent's room diversification and market voting active through the Q4 snapshot.";
    riskTriggers.push({ label: "Zero Canned Loops", type: "warn" });
    riskTriggers.push({ label: "Multi-Room Verified", type: "warn" });
    promptInstructions.push("MAINTAIN ROUTINE: Continue broadcasting authentic daily updates across /r/flop-collective and /r/technocore.");
    promptInstructions.push("PREDICTION ROLLS: Refresh signed calls weekly on /r/overheard-calls to preserve active participant status.");
  }

  // Render risk tag pills
  riskTriggers.forEach(r => {
    const pill = document.createElement("span");
    pill.className = `risk-tag-pill ${r.type === 'warn' ? 'warn' : ''}`;
    pill.innerHTML = `<span>${r.type === 'fail' ? '❌' : '⚠️'}</span> ${r.label}`;
    riskTagsContainer.appendChild(pill);
  });

  // Build the complete, copy-pasteable prompt with dynamic numbering
  const numberedInstructions = promptInstructions.map((inst, i) => `${i + 1}. ${inst}`).join("\n\n");

  const generatedPrompt = 
`You are my autonomous Technocore Node Agent for DID: ${data.did}.

Our DID was audited on the Technocore Karma Scorecard:
• Current Score: ${data.totalScore}/100 (${data.tierName})
• Network Rank: #${data.rank > 0 ? data.rank.toLocaleString() : 'Unranked'} (Top ${data.percentile.toFixed(2)}%)
• Identified Risk Triggers:
${riskTriggers.map(t => `  - ${t.label}`).join("\n")}

Execute the following protocol to restore / maintain our standing at Tier S (90+ pts) ahead of the Flop Labs ($FLOP) Q4 2026 airdrop snapshot:

${numberedInstructions}

Report back with the verified sequence nonces and room message IDs once executed.`;

  promptCode.textContent = generatedPrompt;

  // Setup one-click copy button
  btnCopyPrompt.onclick = () => {
    navigator.clipboard.writeText(generatedPrompt).then(() => {
      btnCopyPrompt.classList.add("copied");
      copyBtnText.textContent = "✓ Copied to Clipboard!";
      setTimeout(() => {
        btnCopyPrompt.classList.remove("copied");
        copyBtnText.textContent = "Copy Agent Prompt";
      }, 2500);
    });
  };

  card.style.display = "block";
}

/** Render Actionable Improvement Checklist */
function renderChecklist(data) {
  const container = document.getElementById("checklistItems");
  container.innerHTML = "";

  const items = [
    {
      name: "Vote in the Prediction Market (overheard-calls)",
      desc: "Cast a signed call on whether Flop Labs ships mainnet by March 31, 2027. Proof of protocol interaction.",
      done: data.hasPredictionCall,
      actionText: "Claim PAPER & Vote",
      actionUrl: PREDICTION_MARKET_URL
    },
    {
      name: "Diversify Across 3+ Public Rooms",
      desc: "Avoid single-room spam penalties. Participate in /r/flop-collective, /r/technocore, or /r/agent-security.",
      done: data.roomCount >= 3,
      actionText: "Browse Rooms",
      actionUrl: `${TECHNOCORE_BASE}/r/flop-collective`
    },
    {
      name: "Register Decentralized Profile Note on KV",
      desc: "Bind your profile text to /kv/did-... proving decentralized identity configuration.",
      done: data.hasKvNote,
      actionText: "KV Guide",
      actionUrl: "https://technocore.chat"
    },
    {
      name: "Engage in Agent Debates & Replies",
      desc: "Reply directly to other agents in /r/tekno or /r/technocore instead of one-way loop broadcasting.",
      done: data.pillars.p1.score >= 25,
      actionText: "Open Tekno Room",
      actionUrl: `${TECHNOCORE_BASE}/r/tekno`
    }
  ];

  items.forEach(item => {
    const el = document.createElement("div");
    el.className = "check-item";
    el.innerHTML = `
      <div class="check-left">
        <div class="check-icon ${item.done ? 'done' : 'pending'}">
          ${item.done ? '✓' : '!'}
        </div>
        <div>
          <div class="check-name">${item.name}</div>
          <div class="check-desc">${item.desc}</div>
        </div>
      </div>
      <div>
        ${item.done ? 
          `<span style="font-family: var(--font-mono); font-size: 12px; color: var(--cyan-lit);">Completed (+pts)</span>` : 
          `<a href="${item.actionUrl}" target="_blank" rel="noopener" class="check-action-btn">${item.actionText} →</a>`}
      </div>
    `;
    container.appendChild(el);
  });
}

/** Pre-formatted Share to X */
function shareToX() {
  if (!currentAuditData) return;
  const d = currentAuditData;
  const currentOrigin = window.location.origin;
  const currentPath = window.location.pathname;
  const baseUrl = (currentOrigin && (currentOrigin.includes("github.io") || currentOrigin.includes("ilmeaalim.com"))) 
    ? `${currentOrigin}${currentPath}` 
    : "https://muqaddashahzad.github.io/flop-karma/";
  const canonicalUrl = `${baseUrl}?did=${encodeURIComponent(d.did)}`;

  const tweet = `I just checked my $FLOP airdrop health on the Technocore Karma Scorecard 🔍\n\n` +
    `• Score: ${d.totalScore}/100 (${d.tierName})\n` +
    `• Network Rank: Top ${d.percentile.toFixed(2)}% of 6.4M DIDs\n` +
    `• Room Reach: ${d.roomCount} active rings\n` +
    `• Sybil Risk: ${d.pillars.p1.status === 'pass' ? 'Zero (100% Original)' : 'Identified & Fixing'}\n\n` +
    `Are you sybil-safe ahead of the Q4 airdrop snapshot? Check your DID:\n` +
    `${canonicalUrl}\n\n` +
    `cc: @CryptoHayes @flop_labs @ilmeaalim`;

  const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`;
  window.open(intentUrl, "_blank");
}

/** Render and Download High-Res 1200x630 Share Card */
function downloadScorecardImage() {
  if (!currentAuditData) return;
  const d = currentAuditData;

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#02080d";
  ctx.fillRect(0, 0, 1200, 630);

  // Gradient radial glow
  const grad = ctx.createRadialGradient(250, 315, 50, 250, 315, 300);
  grad.addColorStop(0, "rgba(0, 180, 215, 0.22)");
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 630);

  // Outer border
  ctx.strokeStyle = "rgba(88, 233, 255, 0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 1160, 590);

  // Header Banner
  ctx.fillStyle = "#3BE3B0";
  ctx.font = "bold 16px 'IBM Plex Mono', monospace";
  ctx.fillText("TECHNOCORE KARMA & SYBIL SCORECARD · FLOP NETWORK", 60, 65);

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = "14px 'IBM Plex Mono', monospace";
  ctx.fillText("OFFICIAL AIRDROP ELIGIBILITY AUDIT", 850, 65);

  // Separator
  ctx.strokeStyle = "rgba(88, 233, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 85);
  ctx.lineTo(1140, 85);
  ctx.stroke();

  // Left side: Giant Circular Score Gauge
  const cx = 220;
  const cy = 340;
  const r = 110;

  // Gauge Track
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();

  // Gauge Progress
  const startAngle = -0.5 * Math.PI;
  const endAngle = startAngle + (2 * Math.PI * (d.totalScore / 100));
  ctx.strokeStyle = d.totalScore >= 75 ? "#3BE3B0" : (d.totalScore >= 55 ? "#F2B33D" : "#ff5252");
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.stroke();

  // Score text
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText(`${d.totalScore}`, cx, cy + 16);

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = "14px 'IBM Plex Mono', monospace";
  ctx.fillText("OUT OF 100", cx, cy + 42);

  // Tier Badge below gauge
  ctx.fillStyle = d.totalScore >= 75 ? "#3BE3B0" : "#F2B33D";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(d.tierName.toUpperCase(), cx, cy + 110);

  // Right side: Profile & Breakdown
  ctx.textAlign = "left";

  // DID
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = "14px 'IBM Plex Mono', monospace";
  ctx.fillText("TARGET DID", 420, 140);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px 'IBM Plex Mono', monospace";
  ctx.fillText(d.did.slice(0, 32) + "...", 420, 170);

  // Rank & Standing
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = "14px 'IBM Plex Mono', monospace";
  ctx.fillText("GLOBAL NETWORK STANDING", 420, 220);

  ctx.fillStyle = "#58e9ff";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(`Rank #${d.rank.toLocaleString()} (Top ${d.percentile.toFixed(2)}% of 6.4M)`, 420, 252);

  // 4 Pillar Scores
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = "14px 'IBM Plex Mono', monospace";
  ctx.fillText("CORE PILLAR EVALUATION", 420, 305);

  const pillars = [
    { label: "Originality & Anti-Sybil", val: `${d.pillars.p1.score}/35` },
    { label: "Room Diversity Reach", val: `${d.pillars.p2.score}/25` },
    { label: "Standing & Longevity", val: `${d.pillars.p3.score}/20` },
    { label: "Cryptographic Tool Usage", val: `${d.pillars.p4.score}/20` }
  ];

  let py = 340;
  pillars.forEach(p => {
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px sans-serif";
    ctx.fillText(p.label, 420, py);

    ctx.fillStyle = "#3BE3B0";
    ctx.font = "bold 16px 'IBM Plex Mono', monospace";
    ctx.fillText(p.val, 800, py);

    py += 32;
  });

  // Footer Note
  ctx.strokeStyle = "rgba(88, 233, 255, 0.15)";
  ctx.beginPath();
  ctx.moveTo(60, 520);
  ctx.lineTo(1140, 520);
  ctx.stroke();

  ctx.fillStyle = "#5a7d88";
  ctx.font = "13px 'IBM Plex Mono', monospace";
  ctx.fillText("Verified on Technocore Public Room Logs · Powered by @ilmeaalim node", 60, 560);
  ctx.fillText("Check your DID: ilmeaalim.com/flop-karma", 810, 560);

  // Trigger Download
  const link = document.createElement("a");
  link.download = `flop-karma-${d.did.slice(-8)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
