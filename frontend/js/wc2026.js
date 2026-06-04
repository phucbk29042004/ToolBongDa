const API_URL = 'http://localhost:3001/api/wc2026';

let allMatches = []; // Holds all matches retrieved from server
let localPredictions = {}; // matchId -> prediction object

document.addEventListener('DOMContentLoaded', () => {
  initPage();
});

async function initPage() {
  await loadMatches();
  setupEventListeners();
  // Automatically fetch standings/bracket if predictions exist
  await refreshSummary();
}

function setupEventListeners() {
  document.getElementById('groupSelect').addEventListener('change', filterMatches);
  document.getElementById('dateSelect').addEventListener('change', filterMatches);
  document.getElementById('btnPredictAll').addEventListener('click', runPredictAll);
}

async function loadMatches() {
  try {
    const res = await fetch(`${API_URL}/matches`);
    const data = await res.json();
    allMatches = data.matches;
    renderAccordions(allMatches);
  } catch (err) {
    console.error('Lỗi tải lịch đấu:', err);
  }
}

function renderAccordions(matchesList) {
  const container = document.getElementById('accordionContainer');
  container.innerHTML = '';

  const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  
  groups.forEach(g => {
    const groupMatches = matchesList.filter(m => m.group_name === g);
    if (groupMatches.length === 0) return;

    const accordion = document.createElement('div');
    accordion.className = 'accordion-item';

    const header = document.createElement('div');
    header.className = 'accordion-header';
    header.innerHTML = `
      <span>🅰 BẢNG ${g}</span>
      <span class="toggle-icon">[▼]</span>
    `;

    const content = document.createElement('div');
    content.className = 'accordion-content';

    let matchesHtml = '';
    groupMatches.forEach(m => {
      matchesHtml += `
        <div class="wc-match-row" id="match-row-${m.match_id}">
          <div class="match-time-col">${m.match_date} ${m.match_time}</div>
          <div class="match-teams-col">
            <span class="flag-badge">${m.team1_flag || ''}</span>
            <span>${m.team1_vi}</span>
            <span style="color: var(--text-muted); font-size: 0.85rem;">vs</span>
            <span class="flag-badge">${m.team2_flag || ''}</span>
            <span>${m.team2_vi}</span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <div id="inline-score-${m.match_id}" style="font-weight: 700; font-size: 1.05rem; display: none;"></div>
            <button class="btn-predict-single" onclick="predictSingle(${m.match_id}, '${m.team1_vi}', '${m.team2_vi}')">
              Dự đoán
            </button>
          </div>
          <div class="match-inline-prediction" id="inline-pred-${m.match_id}"></div>
        </div>
      `;
    });

    content.innerHTML = matchesHtml;
    accordion.appendChild(header);
    accordion.appendChild(content);
    container.appendChild(accordion);

    // Accordion Toggle
    header.addEventListener('click', () => {
      const isOpen = content.classList.contains('open');
      document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('open'));
      document.querySelectorAll('.toggle-icon').forEach(i => i.innerText = '[▼]');

      if (!isOpen) {
        content.classList.add('open');
        header.querySelector('.toggle-icon').innerText = '[▲]';
      }
    });
  });

  // Open first group by default
  const firstContent = container.querySelector('.accordion-content');
  const firstHeader = container.querySelector('.accordion-header');
  if (firstContent && firstHeader) {
    firstContent.classList.add('open');
    firstHeader.querySelector('.toggle-icon').innerText = '[▲]';
  }
}

function filterMatches() {
  const selectedGroup = document.getElementById('groupSelect').value;
  const selectedDate = document.getElementById('dateSelect').value;

  let filtered = allMatches;

  if (selectedGroup) {
    filtered = filtered.filter(m => m.group_name === selectedGroup);
  }
  if (selectedDate) {
    filtered = filtered.filter(m => m.match_date === selectedDate);
  }

  renderAccordions(filtered);

  // Restore any previous prediction badges
  Object.keys(localPredictions).forEach(matchId => {
    showInlinePrediction(matchId, localPredictions[matchId]);
  });
}

async function predictSingle(matchId, t1, t2) {
  try {
    const res = await fetch(`${API_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId })
    });
    const data = await res.json();
    const pred = data.prediction;

    localPredictions[matchId] = pred;
    showInlinePrediction(matchId, pred);
    renderPredictionDetails(mFind(matchId), pred);
    await refreshSummary();
  } catch (err) {
    console.error('Lỗi dự đoán trận:', err);
  }
}

function mFind(matchId) {
  return allMatches.find(m => m.match_id === matchId);
}

function showInlinePrediction(matchId, pred) {
  const inline = document.getElementById(`inline-pred-${matchId}`);
  if (inline) {
    inline.style.display = 'block';
    inline.innerHTML = `Dự đoán: <strong>${pred.score.home} - ${pred.score.away}</strong> (Xác suất thắng: ${Math.round(pred.result_probs.home * 100)}% - Hòa: ${Math.round(pred.result_probs.draw * 100)}% - Bại: ${Math.round(pred.result_probs.away * 100)}%)`;
  }
  
  const scoreBadge = document.getElementById(`inline-score-${matchId}`);
  if (scoreBadge) {
    scoreBadge.style.display = 'block';
    scoreBadge.innerText = `${pred.score.home} - ${pred.score.away}`;
  }
}

function renderPredictionDetails(match, pred) {
  const panel = document.getElementById('predDetailsPanel');
  panel.style.display = 'block';

  document.getElementById('detailTeam1').innerHTML = `<span>${match.team1_flag || ''}</span> <span>${match.team1_vi}</span>`;
  document.getElementById('detailTeam2').innerHTML = `<span>${match.team2_flag || ''}</span> <span>${match.team2_vi}</span>`;
  document.getElementById('detailScore').innerText = `${pred.score.home} - ${pred.score.away}`;

  const pHome = Math.round(pred.result_probs.home * 100);
  const pDraw = Math.round(pred.result_probs.draw * 100);
  const pAway = Math.round(pred.result_probs.away * 100);

  document.getElementById('probWin1').innerText = `${match.team1_vi} thắng: ${pHome}%`;
  document.getElementById('probDraw').innerText = `Hòa: ${pDraw}%`;
  document.getElementById('probWin2').innerText = `${match.team2_vi} thắng: ${pAway}%`;

  document.getElementById('barWin1').style.width = `${pHome}%`;
  document.getElementById('barDraw').style.width = `${pDraw}%`;
  document.getElementById('barWin2').style.width = `${pAway}%`;

  // Over/Under
  const pOver = Math.round(pred.over_under.over25 * 100);
  document.getElementById('detailOU').innerText = `${pred.over_under.prediction} (Xác suất Tài: ${pOver}%)`;

  // Confidence Stars
  const stars = Math.min(5, Math.ceil(pred.confidence * 5));
  document.getElementById('detailConfidence').innerText = '⭐'.repeat(stars) + ` (${Math.round(pred.confidence * 100)}%)`;

  // Factors
  const factorsContainer = document.getElementById('detailFactors');
  factorsContainer.innerHTML = '';
  if (pred.key_factors && pred.key_factors.length > 0) {
    pred.key_factors.forEach(f => {
      const item = document.createElement('div');
      item.style.marginTop = '4px';
      item.innerHTML = `${f.icon} ${f.factor}`;
      factorsContainer.appendChild(item);
    });
  } else {
    factorsContainer.innerText = 'Phân tích Poisson & ELO chuẩn của hệ thống.';
  }

  // Smooth scroll to panel
  panel.scrollIntoView({ behavior: 'smooth' });
}

async function runPredictAll() {
  const btn = document.getElementById('btnPredictAll');
  const progressContainer = document.getElementById('progressBarContainer');
  const progressBar = document.getElementById('progressBar');

  btn.disabled = true;
  progressContainer.style.display = 'block';
  progressBar.style.width = '10%';

  try {
    const res = await fetch(`${API_URL}/predict/all`);
    const data = await res.json();
    progressBar.style.width = '70%';

    data.results.forEach(r => {
      localPredictions[r.matchId] = r.prediction;
      showInlinePrediction(r.matchId, r.prediction);
    });

    progressBar.style.width = '100%';
    setTimeout(async () => {
      progressContainer.style.display = 'none';
      btn.disabled = false;
      await refreshSummary();
    }, 500);

  } catch (err) {
    console.error('Lỗi dự báo tất cả:', err);
    btn.disabled = false;
    progressContainer.style.display = 'none';
  }
}

async function refreshSummary() {
  try {
    const res = await fetch(`${API_URL}/summary`);
    if (!res.ok) return;
    const data = await res.json();

    renderMiniStandings(data.groupStandings);
    renderBracket(data.knockoutBracket);
  } catch (err) {
    console.warn('Lỗi đồng bộ standings/bracket:', err);
  }
}

function renderMiniStandings(groupStandings) {
  const container = document.getElementById('miniGroupsContainer');
  container.innerHTML = '';

  for (const [groupName, teams] of Object.entries(groupStandings)) {
    const card = document.createElement('div');
    card.className = 'group-mini-card';
    
    let teamsHtml = '';
    teams.forEach((t, i) => {
      const match = allMatches.find(m => m.team1_en === t.team_en || m.team2_en === t.team_en);
      const flag = match ? (match.team1_en === t.team_en ? match.team1_flag : match.team2_flag) : '🏳️';
      teamsHtml += `
        <div class="group-mini-team">
          <span>${i + 1}. ${flag} ${t.team_vi}</span>
          <strong>${t.points}đ</strong>
        </div>
      `;
    });

    card.innerHTML = `
      <div class="group-mini-title">BẢNG ${groupName}</div>
      ${teamsHtml}
    `;
    container.appendChild(card);
  }
}

function renderBracket(bracketData) {
  const section = document.getElementById('bracketSection');
  section.style.display = 'block';

  const renderCol = (stageIndex, colId) => {
    const col = document.getElementById(colId);
    const title = col.querySelector('h4');
    col.innerHTML = '';
    col.appendChild(title);

    const stage = bracketData.rounds[stageIndex];
    if (!stage) return;

    stage.matches.forEach(m => {
      const matchHtml = document.createElement('div');
      matchHtml.className = 'bracket-match';

      const matchInfo = allMatches.find(am => am.team1_en === m.t1.team_en || am.team2_en === m.t1.team_en);
      const flag1 = matchInfo ? (matchInfo.team1_en === m.t1.team_en ? matchInfo.team1_flag : matchInfo.team2_flag) : '🏳️';
      
      const matchInfo2 = allMatches.find(am => am.team1_en === m.t2.team_en || am.team2_en === m.t2.team_en);
      const flag2 = matchInfo2 ? (matchInfo2.team1_en === m.t2.team_en ? matchInfo2.team1_flag : matchInfo2.team2_flag) : '🏳️';

      const isT1Winner = m.winner.team_en === m.t1.team_en;

      matchHtml.innerHTML = `
        <div class="bracket-team ${isT1Winner ? 'winner' : ''}">
          <span>${flag1} ${m.t1.team_vi}</span>
          <span>${isT1Winner ? '🏆' : ''}</span>
        </div>
        <div class="bracket-team ${!isT1Winner ? 'winner' : ''}">
          <span>${flag2} ${m.t2.team_vi}</span>
          <span>${!isT1Winner ? '🏆' : ''}</span>
        </div>
        <div style="font-size: 0.7rem; color: var(--text-muted); text-align: center; border-top: 1px solid var(--border-light); margin-top: 4px; padding-top: 2px;">
          Tỉ số dự kiến: ${m.score}
        </div>
      `;
      col.appendChild(matchHtml);
    });
  };

  renderCol(0, 'bracketR32');
  renderCol(1, 'bracketR16');
  renderCol(2, 'bracketQF');
  renderCol(3, 'bracketSF');
  renderCol(4, 'bracketFinal');
}
